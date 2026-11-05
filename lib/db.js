// Server-only PostgreSQL connector. DATABASE_URL must be a server environment variable.
const { Pool } = require('pg');
let pool;
function db() {
  if (!process.env.DATABASE_URL) throw new Error('Database not configured');
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 10000 });
  return pool;
}
function entriesEnabled() {
  // Both gates must be explicitly enabled after regulatory authorization.
  return process.env.SALES_ENABLED === 'true' &&
    process.env.RAFFLE_AUTHORIZATION_CONFIRMED === 'true';
}
module.exports = {db,entriesEnabled};
