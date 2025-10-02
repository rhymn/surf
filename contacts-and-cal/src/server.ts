import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { initDatabase } from './config/database';
import calendarRoutes from './routes/calendar';
import contactsRoutes from './routes/contacts';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PROPFIND', 'PROPPATCH', 'MKCOL', 'COPY', 'MOVE', 'LOCK', 'UNLOCK', 'REPORT', 'MKCALENDAR']
}));
app.use(express.json());
app.use(express.text({ type: 'text/calendar' }));
app.use(express.text({ type: 'text/vcard' }));
app.use(express.text({ type: 'application/xml' }));

// Routes
app.use('/calendars', calendarRoutes);
app.use('/contacts', contactsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Initialize database and start server
async function startServer() {
  try {
    console.log('🚀 Starting CalDAV/CardDAV Server...');
    await initDatabase();
    
    app.listen(PORT, () => {
      console.log(`\n🎉 Server running on http://localhost:${PORT}`);
      console.log('📅 CalDAV URL: http://localhost:' + PORT + '/calendars/');
      console.log('📇 CardDAV URL: http://localhost:' + PORT + '/contacts/');
      console.log('👤 Default user: admin / admin123');
      console.log('❤️  Health check: http://localhost:' + PORT + '/health');
    });
  } catch (error: any) {
    console.error('❌ Failed to start server:', error);
    
    // Provide helpful error messages
    if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
      console.log('\n💡 Possible solutions:');
      console.log('1. Install PostgreSQL: sudo apt install postgresql');
      console.log('2. Start PostgreSQL: sudo systemctl start postgresql');
      console.log('3. Create database: sudo -u postgres createdb caldav_db');
      console.log('4. Create user: sudo -u postgres psql -c "CREATE USER caldav_user WITH PASSWORD \'caldav_pass\';"');
      console.log('5. Grant privileges: sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE caldav_db TO caldav_user;"');
    }
    
    process.exit(1);
  }
}

startServer();