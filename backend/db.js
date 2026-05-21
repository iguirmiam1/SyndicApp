const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // ✅ lit la variable Render
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle pg client', err);
});

const query = (text, params) => pool.query(text, params);

module.exports = { query, pool };
