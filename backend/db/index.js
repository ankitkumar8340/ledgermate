import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

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
        left_at TIMESTAMP
      );
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

    await client.query('COMMIT');
    console.log('PostgreSQL tables initialized successfully.');

    // Seed default users if table is empty
    const usersCount = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(usersCount.rows[0].count, 10) === 0) {
      console.log('Seeding default flatmates...');
      const defaultUsers = [
        { id: 'u_aisha', name: 'Aisha', joined_at: '2026-02-01', left_at: null },
        { id: 'u_rohan', name: 'Rohan', joined_at: '2026-02-01', left_at: null },
        { id: 'u_priya', name: 'Priya', joined_at: '2026-02-01', left_at: null },
        { id: 'u_meera', name: 'Meera', joined_at: '2026-02-01', left_at: '2026-03-31' },
        { id: 'u_sam', name: 'Sam', joined_at: '2026-04-15', left_at: null },
        { id: 'u_dev', name: 'Dev', joined_at: '2026-02-01', left_at: null },
        { id: 'u_kabir', name: 'Kabir', joined_at: '2026-03-11', left_at: '2026-03-11' }
      ];
      for (const u of defaultUsers) {
        await client.query(
          'INSERT INTO users (id, name, joined_at, left_at) VALUES ($1, $2, $3, $4)',
          [u.id, u.name, u.joined_at, u.left_at]
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
