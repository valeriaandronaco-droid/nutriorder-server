-- Crea il database
CREATE DATABASE IF NOT EXISTS nutriorder CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE nutriorder;

-- Tabella pazienti
CREATE TABLE IF NOT EXISTS pazienti (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  eta INT,
  obiettivo VARCHAR(100),
  creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabella piatti (dieta assegnata dalla nutrizionista)
CREATE TABLE IF NOT EXISTS piatti (
  id INT AUTO_INCREMENT PRIMARY KEY,
  paziente_id INT NOT NULL,
  nome VARCHAR(150) NOT NULL,
  pasto ENUM('colazione', 'pranzo', 'cena') NOT NULL,
  ristorante VARCHAR(100) NOT NULL,
  creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (paziente_id) REFERENCES pazienti(id) ON DELETE CASCADE
);

-- Tabella ingredienti (collegati a un piatto della dieta)
CREATE TABLE IF NOT EXISTS ingredienti (
  id INT AUTO_INCREMENT PRIMARY KEY,
  piatto_id INT NOT NULL,
  nome VARCHAR(100) NOT NULL,
  quantita DECIMAL(8,2) NOT NULL,
  unita VARCHAR(10) NOT NULL DEFAULT 'g',
  FOREIGN KEY (piatto_id) REFERENCES piatti(id) ON DELETE CASCADE
);

-- Tabella ordini
CREATE TABLE IF NOT EXISTS ordini (
  id INT AUTO_INCREMENT PRIMARY KEY,
  paziente_id INT NOT NULL,
  piatto_nome VARCHAR(150) NOT NULL,
  pasto ENUM('colazione', 'pranzo', 'cena') NOT NULL,
  ristorante VARCHAR(100) NOT NULL,
  note TEXT,
  stato ENUM('in_attesa', 'confermato', 'rifiutato') DEFAULT 'in_attesa',
  creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (paziente_id) REFERENCES pazienti(id) ON DELETE CASCADE
);

-- Tabella ingredienti dell'ordine (grammature personalizzate dal cliente)
CREATE TABLE IF NOT EXISTS ordine_ingredienti (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ordine_id INT NOT NULL,
  nome VARCHAR(100) NOT NULL,
  quantita DECIMAL(8,2) NOT NULL,
  unita VARCHAR(10) NOT NULL DEFAULT 'g',
  FOREIGN KEY (ordine_id) REFERENCES ordini(id) ON DELETE CASCADE
);

-- Dati di esempio
INSERT INTO pazienti (nome, eta, obiettivo) VALUES
  ('Marco Bianchi', 34, 'Dimagrimento'),
  ('Sofia Russo', 28, 'Massa muscolare');
