import { Pool } from 'pg';

// Auto-detect environment and use appropriate database
const isProduction = process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('render.com');

const databaseConfig = isProduction ? {
  // Production (Render) - uses environment DATABASE_URL
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
} : {
  // Local development - use connection string with password
  connectionString: 'postgresql://postgres:postgres@localhost:5432/postgres'
};

console.log(`🔧 Using ${isProduction ? 'PRODUCTION' : 'LOCAL'} database configuration`);

export const pool = new Pool({
  ...databaseConfig,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10
});

export async function initDatabase() {
  let client;
  
  try {
    client = await pool.connect();
    console.log('✅ Connected to database');
    
    // Create tables with caldav_ prefix to avoid conflicts
    await client.query(`
      CREATE TABLE IF NOT EXISTS caldav_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS caldav_calendars (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES caldav_users(id),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        color VARCHAR(7) DEFAULT '#3174ad',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, name)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS caldav_events (
        id SERIAL PRIMARY KEY,
        calendar_id INTEGER REFERENCES caldav_calendars(id),
        uid VARCHAR(255) UNIQUE NOT NULL,
        summary VARCHAR(255),
        description TEXT,
        start_date TIMESTAMP,
        end_date TIMESTAMP,
        all_day BOOLEAN DEFAULT false,
        rrule TEXT,
        ical_data TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS caldav_contacts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES caldav_users(id),
        uid VARCHAR(255) UNIQUE NOT NULL,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(255),
        vcard_data TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Auto-create default user if none exists
    const userCount = await client.query('SELECT COUNT(*) FROM caldav_users');
    if (parseInt(userCount.rows[0].count) === 0) {
      const bcrypt = require('bcrypt');
      
      // Hardcoded credentials
      const username = 'admin';
      const password = 'admin123';
      const hashedPassword = await bcrypt.hash(password, 10);
      
      await client.query(
        'INSERT INTO caldav_users (username, password_hash) VALUES ($1, $2)',
        [username, hashedPassword]
      );
      
      console.log(`✅ Created default user: ${username} / ${password}`);
      
      // Create default calendar for the user
      const userResult = await client.query('SELECT id FROM caldav_users WHERE username = $1', [username]);
      const userId = userResult.rows[0].id;
      
      await client.query(
        'INSERT INTO caldav_calendars (user_id, name, description, color) VALUES ($1, $2, $3, $4)',
        [userId, 'Personal', 'Personal calendar', '#3174ad']
      );
      
      console.log('✅ Created default calendar');
    }

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}