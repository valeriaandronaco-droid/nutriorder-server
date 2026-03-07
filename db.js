const mysql = require("mysql2/promise");

console.log("MYSQL_URL:", process.env.MYSQL_URL);

const pool = mysql.createPool({
  uri: process.env.MYSQL_URL,
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;  