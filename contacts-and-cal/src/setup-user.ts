import bcrypt from 'bcrypt';
import { pool, initDatabase } from './config/database';

async function createTestUser() {
  await initDatabase();
  
  const username = 'testuser';
  const password = 'testpass';
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING',
      [username, hashedPassword]
    );

    // Create default calendar for user
    const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    const userId = userResult.rows[0]?.id;

    if (userId) {
      await pool.query(
        'INSERT INTO calendars (user_id, name, description) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [userId, 'Default Calendar', 'Default calendar for syncing']
      );
    }

    console.log(`Test user created: ${username} / ${password}`);
    console.log('You can use these credentials for CalDAV/CardDAV authentication');
  } catch (error) {
    console.error('Error creating test user:', error);
  } finally {
    await pool.end();
  }
}

createTestUser();