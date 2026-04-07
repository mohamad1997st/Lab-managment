require('dotenv').config();
const { Pool } = require('pg');

const useSsl = String(process.env.DB_SSL || '').toLowerCase() === 'true';
const hasConnectionString = Boolean(process.env.DATABASE_URL);

const pool = new Pool(
  hasConnectionString
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: useSsl ? { rejectUnauthorized: false } : false
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'Lab_managment',
        ssl: useSsl ? { rejectUnauthorized: false } : false
      }
);

pool.on('error', (err) => {
  console.error('Unexpected PG pool error:', err);
});

module.exports = pool;
