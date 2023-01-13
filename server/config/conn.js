const mysql = require("mysql");
const conn = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "sisdatabase2",
});

conn.connect();

module.exports = conn;
