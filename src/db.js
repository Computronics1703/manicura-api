import pg from 'pg';
if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');
export const pool = new pg.Pool({connectionString:process.env.DATABASE_URL, max:8});
