const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("./db");
const { authMiddleware, requireRuolo, JWT_SECRET } = require("./auth");

const app = express();
app.use(cors());
app.use(express.json());

// ─── AUTH ──────────────────────────────────────────────────────────────────────

// POST /api/login
app.post("/api/login", async (req, res) => {
  const { telefono, password } = req.body;
  if (!telefono || !password) {
    return res.status(400).json({ error: "Telefono e password sono obbligatori" });
  }
  try {
    const [rows] = await db.query(
      "SELECT * FROM utenti WHERE telefono = ?", [telefono]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: "Credenziali non valide" });
    }
    const utente = rows[0];
    const valida = await bcrypt.compare(password, utente.password_hash);
    if (!valida) {
      return res.status(401).json({ error: "Credenziali non valide" });
    }
    const token = jwt.sign(
      {
        id: utente.id,
        nome: utente.nome,
        ruolo: utente.ruolo,
        ristorante_id: utente.ristorante_id,
        paziente_id: utente.paziente_id,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({
      token,
      utente: {
        id: utente.id,
        nome: utente.nome,
        ruolo: utente.ruolo,
        ristorante_id: utente.ristorante_id,
        paziente_id: utente.paziente_id,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/registra — la nutrizionista crea account, oppure chiunque si registra come cliente/ristoratore
app.post("/api/registra", async (req, res) => {
  const { nome, telefono, password, ruolo, ristorante_id, paziente_id, token_nutrizionista } = req.body;
  if (!nome || !telefono || !password || !ruolo) {
    return res.status(400).json({ error: "Tutti i campi sono obbligatori" });
  }

  // Se il ruolo è nutrizionista, serve il token di autenticazione
  if (ruolo === "nutrizionista") {
    try {
      jwt.verify(token_nutrizionista, JWT_SECRET);
    } catch {
      return res.status(403).json({ error: "Non autorizzato a creare account nutrizionista" });
    }
  }

  try {
    const password_hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      `INSERT INTO utenti (nome, telefono, password_hash, ruolo, ristorante_id, paziente_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [nome, telefono, password_hash, ruolo, ristorante_id || null, paziente_id || null]
    );
    res.json({ id: result.insertId, nome, telefono, ruolo });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Numero di telefono già registrato" });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/me
app.get("/api/me", authMiddleware, async (req, res) => {
  res.json(req.utente);
});

// ─── RISTORANTI ────────────────────────────────────────────────────────────────

app.get("/api/ristoranti", authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM ristoranti");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ristoranti", authMiddleware, requireRuolo("nutrizionista"), async (req, res) => {
  const { nome, indirizzo } = req.body;
  try {
    const [result] = await db.query(
      "INSERT INTO ristoranti (nome, indirizzo) VALUES (?, ?)",
      [nome, indirizzo || null]
    );
    res.json({ id: result.insertId, nome, indirizzo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PAZIENTI ──────────────────────────────────────────────────────────────────

app.get("/api/pazienti", authMiddleware, requireRuolo("nutrizionista"), async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM pazienti");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/pazienti", authMiddleware, requireRuolo("nutrizionista"), async (req, res) => {
  const { nome, eta, obiettivo } = req.body;
  try {
    const [result] = await db.query(
      "INSERT INTO pazienti (nome, eta, obiettivo) VALUES (?, ?, ?)",
      [nome, eta, obiettivo]
    );
    res.json({ id: result.insertId, nome, eta, obiettivo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PIATTI / DIETA ────────────────────────────────────────────────────────────

app.get("/api/pazienti/:id/dieta", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { ruolo, paziente_id } = req.utente;

  if (ruolo === "cliente" && paziente_id !== parseInt(id)) {
    return res.status(403).json({ error: "Accesso non autorizzato" });
  }
  if (ruolo === "ristoratore") {
    return res.status(403).json({ error: "Accesso non autorizzato" });
  }

  try {
    const [piatti] = await db.query("SELECT * FROM piatti WHERE paziente_id = ?", [id]);
    for (const piatto of piatti) {
      const [ingredienti] = await db.query(
        "SELECT * FROM ingredienti WHERE piatto_id = ?", [piatto.id]
      );
      piatto.ingredienti = ingredienti;
    }
    res.json(piatti);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/pazienti/:id/dieta", authMiddleware, requireRuolo("nutrizionista"), async (req, res) => {
  const { id } = req.params;
  const { nome, pasto, ristorante, ristorante_id, ingredienti } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      "INSERT INTO piatti (paziente_id, nome, pasto, ristorante, ristorante_id) VALUES (?, ?, ?, ?, ?)",
      [id, nome, pasto, ristorante, ristorante_id || null]
    );
    const piattoId = result.insertId;
    for (const ing of ingredienti) {
      await conn.query(
        "INSERT INTO ingredienti (piatto_id, nome, quantita, unita) VALUES (?, ?, ?, ?)",
        [piattoId, ing.nome, ing.quantita, ing.unita]
      );
    }
    await conn.commit();
    res.json({ id: piattoId, paziente_id: id, nome, pasto, ristorante, ingredienti });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

app.delete("/api/piatti/:id", authMiddleware, requireRuolo("nutrizionista"), async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("DELETE FROM ingredienti WHERE piatto_id = ?", [id]);
    await db.query("DELETE FROM piatti WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ORDINI ────────────────────────────────────────────────────────────────────

app.get("/api/ordini", authMiddleware, async (req, res) => {
  const { ruolo, ristorante_id } = req.utente;
  if (ruolo === "cliente") {
    return res.status(403).json({ error: "Accesso non autorizzato" });
  }
  try {
    let query = `
      SELECT o.*, p.nome as paziente_nome, r.nome as ristorante_nome
      FROM ordini o
      JOIN pazienti p ON o.paziente_id = p.id
      LEFT JOIN ristoranti r ON o.ristorante_id = r.id
    `;
    const params = [];
    if (ruolo === "ristoratore" && ristorante_id) {
      query += " WHERE o.ristorante_id = ?";
      params.push(ristorante_id);
    }
    query += " ORDER BY o.creato_il DESC";
    const [ordini] = await db.query(query, params);
    for (const ordine of ordini) {
      const [ingredienti] = await db.query(
        "SELECT * FROM ordine_ingredienti WHERE ordine_id = ?", [ordine.id]
      );
      ordine.ingredienti = ingredienti;
    }
    res.json(ordini);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ordini", authMiddleware, requireRuolo("cliente"), async (req, res) => {
  const { paziente_id, piatto_nome, pasto, ristorante, ristorante_id, ingredienti, note } = req.body;
  if (req.utente.paziente_id !== parseInt(paziente_id)) {
    return res.status(403).json({ error: "Accesso non autorizzato" });
  }
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO ordini (paziente_id, piatto_nome, pasto, ristorante, ristorante_id, note, stato)
       VALUES (?, ?, ?, ?, ?, ?, 'in_attesa')`,
      [paziente_id, piatto_nome, pasto, ristorante, ristorante_id || null, note || null]
    );
    const ordineId = result.insertId;
    for (const ing of ingredienti) {
      await conn.query(
        "INSERT INTO ordine_ingredienti (ordine_id, nome, quantita, unita) VALUES (?, ?, ?, ?)",
        [ordineId, ing.nome, ing.quantita, ing.unita]
      );
    }
    await conn.commit();
    res.json({ id: ordineId, stato: "in_attesa" });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

app.patch("/api/ordini/:id/conferma", authMiddleware, requireRuolo("ristoratore"), async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("UPDATE ordini SET stato = 'confermato' WHERE id = ?", [id]);
    res.json({ success: true, stato: "confermato" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AVVIO SERVER ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Server NutriOrder in ascolto su http://localhost:${PORT}`);
});
