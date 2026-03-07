const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

// ─── PAZIENTI ──────────────────────────────────────────────────────────────────

// GET tutti i pazienti
app.get("/api/pazienti", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM pazienti");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST nuovo paziente
app.post("/api/pazienti", async (req, res) => {
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

// GET dieta di un paziente (con ingredienti)
app.get("/api/pazienti/:id/dieta", async (req, res) => {
  const { id } = req.params;
  try {
    const [piatti] = await db.query(
      "SELECT * FROM piatti WHERE paziente_id = ?",
      [id]
    );
    // Per ogni piatto, carica gli ingredienti
    for (const piatto of piatti) {
      const [ingredienti] = await db.query(
        "SELECT * FROM ingredienti WHERE piatto_id = ?",
        [piatto.id]
      );
      piatto.ingredienti = ingredienti;
    }
    res.json(piatti);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST nuovo piatto per un paziente
app.post("/api/pazienti/:id/dieta", async (req, res) => {
  const { id } = req.params;
  const { nome, pasto, ristorante, ingredienti } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      "INSERT INTO piatti (paziente_id, nome, pasto, ristorante) VALUES (?, ?, ?, ?)",
      [id, nome, pasto, ristorante]
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

// DELETE piatto
app.delete("/api/piatti/:id", async (req, res) => {
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

// GET tutti gli ordini (per il ristorante)
app.get("/api/ordini", async (req, res) => {
  const { ristorante } = req.query;
  try {
    let query = `
      SELECT o.*, p.nome as paziente_nome
      FROM ordini o
      JOIN pazienti p ON o.paziente_id = p.id
    `;
    const params = [];
    if (ristorante) {
      query += " WHERE o.ristorante = ?";
      params.push(ristorante);
    }
    query += " ORDER BY o.creato_il DESC";
    const [ordini] = await db.query(query, params);
    for (const ordine of ordini) {
      const [ingredienti] = await db.query(
        "SELECT * FROM ordine_ingredienti WHERE ordine_id = ?",
        [ordine.id]
      );
      ordine.ingredienti = ingredienti;
    }
    res.json(ordini);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST nuovo ordine
app.post("/api/ordini", async (req, res) => {
  const { paziente_id, piatto_nome, pasto, ristorante, ingredienti, note } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO ordini (paziente_id, piatto_nome, pasto, ristorante, note, stato)
       VALUES (?, ?, ?, ?, ?, 'in_attesa')`,
      [paziente_id, piatto_nome, pasto, ristorante, note || null]
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

// PATCH conferma ordine
app.patch("/api/ordini/:id/conferma", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query(
      "UPDATE ordini SET stato = 'confermato' WHERE id = ?",
      [id]
    );
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
