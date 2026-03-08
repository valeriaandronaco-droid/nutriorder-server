const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "nutriorder_secret_key_cambiami";

// Verifica il token JWT
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token mancante o non valido" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.utente = decoded; // { id, nome, ruolo, ristorante_id, paziente_id }
    next();
  } catch {
    return res.status(401).json({ error: "Token scaduto o non valido" });
  }
}

// Verifica che l'utente abbia il ruolo richiesto
function requireRuolo(...ruoli) {
  return (req, res, next) => {
    if (!ruoli.includes(req.utente.ruolo)) {
      return res.status(403).json({ error: "Accesso non autorizzato" });
    }
    next();
  };
}

module.exports = { authMiddleware, requireRuolo, JWT_SECRET };
