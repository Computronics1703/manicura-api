import {pool} from './db.js';
export async function initSchema(){
 await pool.query(`
 CREATE TABLE IF NOT EXISTS clients (
 id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL,
 notes TEXT NOT NULL DEFAULT '', whatsapp_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS appointments (
 id BIGSERIAL PRIMARY KEY, client_id BIGINT NOT NULL REFERENCES clients(id),
 service TEXT NOT NULL, starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL,
 status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled','completed')),
 notes TEXT NOT NULL DEFAULT '', reminder_status TEXT NOT NULL DEFAULT 'pending'
 CHECK(reminder_status IN ('pending','processing','sent','failed','skipped')),
 reminder_sent_at TIMESTAMPTZ, reminder_error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT valid_appointment_period CHECK(ends_at > starts_at));
 CREATE INDEX IF NOT EXISTS appointment_time_idx ON appointments(starts_at,ends_at);
 CREATE INDEX IF NOT EXISTS reminder_due_idx ON appointments(starts_at,reminder_status);
 `);
}
