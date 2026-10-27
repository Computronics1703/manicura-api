import { pool } from './db.js';

export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      whatsapp_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id BIGSERIAL PRIMARY KEY,
      client_id BIGINT NOT NULL REFERENCES clients(id),
      service TEXT NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed'
        CHECK (status IN ('confirmed','cancelled','completed')),
      notes TEXT NOT NULL DEFAULT '',
      reminder_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (reminder_status IN
          ('pending','processing','sent','failed','skipped')),
      reminder_sent_at TIMESTAMPTZ,
      reminder_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT valid_appointment_period
        CHECK (ends_at > starts_at)
    );

    CREATE INDEX IF NOT EXISTS appointment_time_idx
      ON appointments(starts_at, ends_at);

    CREATE INDEX IF NOT EXISTS reminder_due_idx
      ON appointments(starts_at, reminder_status);

    CREATE TABLE IF NOT EXISTS staff_users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL
        CHECK (role IN ('admin','staff')),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS staff_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL
        REFERENCES staff_users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS staff_sessions_expiry_idx
      ON staff_sessions(expires_at);
  `);

  // Primer aviso: confirmación inmediata
  // Las citas existentes no se reenvían automáticamente.
  await pool.query(`
    ALTER TABLE appointments
      ADD COLUMN IF NOT EXISTS confirmation_status
      TEXT NOT NULL DEFAULT 'skipped';

    ALTER TABLE appointments
      ADD COLUMN IF NOT EXISTS confirmation_sent_at
      TIMESTAMPTZ;

    ALTER TABLE appointments
      ADD COLUMN IF NOT EXISTS confirmation_error
      TEXT;

    ALTER TABLE appointments
      ADD COLUMN IF NOT EXISTS reminder_4h_status
      TEXT NOT NULL DEFAULT 'pending';

    ALTER TABLE appointments
      ADD COLUMN IF NOT EXISTS reminder_4h_sent_at
      TIMESTAMPTZ;

    ALTER TABLE appointments
      ADD COLUMN IF NOT EXISTS reminder_4h_error
      TEXT;

    CREATE INDEX IF NOT EXISTS reminder_4h_due_idx
      ON appointments(starts_at, reminder_4h_status);
  `);
}



Cómo reemplazarlo
1. En GitHub, abre src/schema.js.
2. Selecciona todo el código con Ctrl + A.
3. Elimínalo y pega el código completo anterior.
4. Presiona Commit changes.
5. Espera a que Render termine el despliegue.
Este archivo solamente prepara la base de datos. Todavía no activa los nuevos envíos.

Cuando hayas guardado los cambios, dime «Listo» y continuaremos con server.js y reminders.js para implementar el aviso inmediato y el recordatorio 4 horas antes.
