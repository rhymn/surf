import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { initDatabase } from './config/database';
import { authenticate } from './middleware/auth';
import calendarRoutes from './routes/calendar';
import contactsRoutes from './routes/contacts';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);
const HOST = process.env.HOST || '0.0.0.0'; // Listen on all interfaces

// Middleware
app.use(helmet());
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PROPFIND', 'PROPPATCH', 'MKCOL', 'COPY', 'MOVE', 'LOCK', 'UNLOCK', 'REPORT', 'MKCALENDAR']
}));

// WebDAV request logging middleware
app.use((req: Request, res: Response, next) => {
  const timestamp = new Date().toISOString();
  console.log(`\n🔍 [${timestamp}] ${req.method} ${req.path}`);
  console.log(`📋 Headers:`, {
    'user-agent': req.get('User-Agent'),
    'authorization': req.get('Authorization') ? 'Present' : 'Missing',
    'content-type': req.get('Content-Type'),
    'depth': req.get('Depth'),
    'destination': req.get('Destination')
  });
  
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`📝 Body:`, req.body);
  }
  
  next();
});

// Add proper WebDAV headers per RFC 4918
app.use((req: Request, res: Response, next) => {
  // RFC 4918: DAV compliance classes
  res.setHeader('DAV', '1, 2, 3, calendar-access, addressbook');
  // RFC 2518: MS-Author-Via for Microsoft compatibility
  res.setHeader('MS-Author-Via', 'DAV');
  next();
});

app.use(express.json());
app.use(express.text({ type: 'text/calendar' }));
app.use(express.text({ type: 'text/vcard' }));
app.use(express.text({ type: 'application/xml' }));

// RFC 5785: Well-Known URIs for CalDAV/CardDAV discovery
app.get('/.well-known/caldav', (req: Request, res: Response) => {
  console.log('✅ CalDAV discovery: redirecting to /calendars/');
  // RFC 6764: Should redirect to calendar home collection
  res.redirect(301, '/calendars/');
});

app.get('/.well-known/carddav', (req: Request, res: Response) => {
  console.log('✅ CardDAV discovery: redirecting to /contacts/');
  // RFC 6764: Should redirect to addressbook home collection  
  res.redirect(301, '/contacts/');
});

// Principal collection - RFC 3744 (WebDAV Access Control Protocol)
app.use('/principals/*', (req: Request, res: Response) => {
  if (req.method === 'PROPFIND') {
    const path = req.path;
    res.set('Content-Type', 'application/xml; charset=utf-8');
    
    if (path === '/principals/' || path === '/principals') {
      // Principal collection root
      res.status(207).send(`<?xml version="1.0" encoding="UTF-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/principals/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection/></d:resourcetype>
        <d:displayname>Principal Collection</d:displayname>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/principals/users/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection/></d:resourcetype>
        <d:displayname>Users</d:displayname>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`);
    } else if (path === '/principals/users/' || path === '/principals/users') {
      // Users collection
      res.status(207).send(`<?xml version="1.0" encoding="UTF-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/principals/users/admin/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:principal/></d:resourcetype>
        <d:displayname>Administrator</d:displayname>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`);
    } else if (path === '/principals/users/admin/' || path === '/principals/users/admin') {
      // Individual principal - RFC 4791 Section 6.2.1 & RFC 6352 Section 7.1.1
      res.status(207).send(`<?xml version="1.0" encoding="UTF-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:response>
    <d:href>/principals/users/admin/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:principal/></d:resourcetype>
        <d:displayname>Administrator</d:displayname>
        <c:calendar-home-set>
          <d:href>/calendars/</d:href>
        </c:calendar-home-set>
        <card:addressbook-home-set>
          <d:href>/contacts/</d:href>
        </card:addressbook-home-set>
        <d:principal-URL>
          <d:href>/principals/users/admin/</d:href>
        </d:principal-URL>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`);
    } else {
      res.status(404).send('Not Found');
    }
  } else if (req.method === 'OPTIONS') {
    res.set('Allow', 'OPTIONS, PROPFIND');
    res.set('DAV', '1, 3, access-control');
    res.status(200).send();
  } else {
    res.status(405).send('Method Not Allowed');
  }
});

// Root WebDAV handler - RFC 4918/4791/6352 compliant
app.use('/', (req: Request, res: Response, next) => {
  if (req.method === 'PROPFIND' && req.path === '/') {
    console.log('✅ Root PROPFIND: sending WebDAV discovery response');
    // WebDAV PROPFIND for CalDAV/CardDAV discovery
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.status(207).send(`<?xml version="1.0" encoding="UTF-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:response>
    <d:href>/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection/></d:resourcetype>
        <d:displayname>WebDAV Root</d:displayname>
        <d:current-user-principal>
          <d:href>/principals/users/admin/</d:href>
        </d:current-user-principal>
        <d:principal-collection-set>
          <d:href>/principals/</d:href>
        </d:principal-collection-set>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`);
  } else if (req.method === 'OPTIONS') {
    console.log('✅ Root OPTIONS: sending WebDAV capabilities');
    // RFC 4918: WebDAV OPTIONS response
    res.set('Allow', 'OPTIONS, GET, HEAD, POST, PUT, DELETE, COPY, MOVE, MKCOL, PROPFIND, PROPPATCH, LOCK, UNLOCK, REPORT');
    res.set('DAV', '1, 2, 3, calendar-access, addressbook');
    res.status(200).send();
  } else {
    next();
  }
});

// Routes
app.use('/calendars', calendarRoutes);
app.use('/contacts', contactsRoutes);

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Catch-all handler for unmatched requests
app.use('*', (req: Request, res: Response) => {
  console.log(`❌ Unhandled request: ${req.method} ${req.originalUrl}`);
  console.log(`❌ Available routes: /calendars/, /contacts/, /principals/, /.well-known/caldav, /.well-known/carddav, /health`);
  res.status(404).send(`Cannot ${req.method} ${req.originalUrl}`);
});

// Initialize database and start server
async function startServer() {
  try {
    console.log('🚀 Starting CalDAV/CardDAV Server...');
    await initDatabase();
    
    app.listen(PORT, HOST, () => {
      console.log(`\n🎉 Server running on http://${HOST}:${PORT}`);
      console.log(`📅 CalDAV URL: http://127.0.0.1:${PORT}/calendars/`);
      console.log(`📇 CardDAV URL: http://127.0.0.1:${PORT}/contacts/`);
      console.log(`🌐 Also try: http://localhost:${PORT}/ or http://$(hostname -I | awk '{print $1}'):${PORT}/`);
      console.log('👤 Default user: admin / admin123');
      console.log('❤️  Health check available on all above URLs + /health');
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