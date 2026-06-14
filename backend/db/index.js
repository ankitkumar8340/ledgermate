import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

// PostgreSQL connection config using unified DATABASE_URL or individual credentials
const connectionString = process.env.DATABASE_URL || 
  `postgresql://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || 'postgres'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || 'ledgermate'}`;

console.log('Connecting to PostgreSQL database...');

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export const query = (text, params) => pool.query(text, params);

export const getClient = () => pool.connect();

export const initDB = async () => {
  const client = await getClient();
  try {
    console.log('Initializing database tables on PostgreSQL...');
    await client.query('BEGIN');

    // 1. Create Users Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE,
        joined_at TIMESTAMP NOT NULL,
        left_at TIMESTAMP,
        password_hash VARCHAR(255)
      );
    `);

    // Ensure password_hash exists if database is already created
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
    `);

    // 2. Create Groups Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS groups (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Create Group Memberships Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS group_memberships (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        group_id VARCHAR(50) NOT NULL,
        joined_at TIMESTAMP NOT NULL,
        left_at TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
        CONSTRAINT unique_user_group UNIQUE (user_id, group_id)
      );
    `);

    // 4. Create Expenses Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id VARCHAR(50) PRIMARY KEY,
        group_id VARCHAR(50) NOT NULL,
        description VARCHAR(255) NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'INR',
        exchange_rate DECIMAL(12, 6) DEFAULT 1.0,
        date TIMESTAMP NOT NULL,
        paid_by_id VARCHAR(50) NOT NULL,
        split_type VARCHAR(50) NOT NULL,
        split_details TEXT,
        notes TEXT,
        is_settlement BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
        FOREIGN KEY (paid_by_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // 5. Create Expense Splits Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS expense_splits (
        id VARCHAR(50) PRIMARY KEY,
        expense_id VARCHAR(50) NOT NULL,
        user_id VARCHAR(50) NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT unique_expense_user UNIQUE (expense_id, user_id)
      );
    `);

    // 6. Create Sessions Table for Database-backed Auth
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        token VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // 7. Create Audit Logs Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        action VARCHAR(50) NOT NULL,
        table_name VARCHAR(50) NOT NULL,
        row_id VARCHAR(50) NOT NULL,
        old_values TEXT,
        new_values TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 8. Create Foreign Key Performance Indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_memberships_user ON group_memberships(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_memberships_group ON group_memberships(group_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses(group_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_expenses_payer ON expenses(paid_by_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_splits_expense ON expense_splits(expense_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_splits_user ON expense_splits(user_id);`);

    await client.query('COMMIT');
    console.log('PostgreSQL tables initialized successfully.');

    // Seed default users if table is empty
    const usersCount = await client.query('SELECT COUNT(*) FROM users');
    const defaultUsers = [
      { id: 'u_aisha', name: 'Aisha', joined_at: '2026-02-01', left_at: null, password: 'aisha' },
      { id: 'u_rohan', name: 'Rohan', joined_at: '2026-02-01', left_at: null, password: 'rohan' },
      { id: 'u_priya', name: 'Priya', joined_at: '2026-02-01', left_at: null, password: 'priya' },
      { id: 'u_meera', name: 'Meera', joined_at: '2026-02-01', left_at: '2026-03-31', password: 'meera' },
      { id: 'u_sam', name: 'Sam', joined_at: '2026-04-15', left_at: null, password: 'sam' },
      { id: 'u_dev', name: 'Dev', joined_at: '2026-02-01', left_at: null, password: 'dev' },
      { id: 'u_kabir', name: 'Kabir', joined_at: '2026-03-11', left_at: '2026-03-11', password: 'kabir' }
    ];
    
    const salt = 'ledgermate-salt-1234';

    if (parseInt(usersCount.rows[0].count, 10) === 0) {
      console.log('Seeding default flatmates...');
      for (const u of defaultUsers) {
        const hash = crypto.scryptSync(u.password, salt, 64).toString('hex');
        await client.query(
          'INSERT INTO users (id, name, joined_at, left_at, password_hash) VALUES ($1, $2, $3, $4, $5)',
          [u.id, u.name, u.joined_at, u.left_at, hash]
        );
      }
      
      // Seed default group
      await client.query(
        'INSERT INTO groups (id, name, description) VALUES ($1, $2, $3)',
        ['g_flat', 'Flat 204 Sharing', 'Shared expenses tracker for Aisha, Rohan, Priya, Meera, and Sam']
      );
      
      // Seed memberships
      for (const u of defaultUsers) {
        await client.query(
          'INSERT INTO group_memberships (id, user_id, group_id, joined_at, left_at) VALUES ($1, $2, $3, $4, $5)',
          [`m_${u.id}`, u.id, 'g_flat', u.joined_at, u.left_at]
        );
      }
      console.log('Seeding completed.');
    } else {
      // Ensure existing users have a password hash
      for (const u of defaultUsers) {
        const hash = crypto.scryptSync(u.password, salt, 64).toString('hex');
        await client.query(
          'UPDATE users SET password_hash = $1 WHERE id = $2 AND password_hash IS NULL',
          [hash, u.id]
        );
      }
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error initializing PostgreSQL tables:', err.message);
    throw err;
  } finally {
    client.release();
  }
};
export default pool;
