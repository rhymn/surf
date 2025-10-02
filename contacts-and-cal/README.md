# Calendar and Contacts Sync Server

A **standards-compliant** CalDAV/CardDAV server for syncing calendars and contacts with PostgreSQL backend.

## Features

✅ **CalDAV RFC 4791 Compliance**
- PROPFIND method for calendar discovery
- REPORT method for calendar-query
- MKCALENDAR for creating calendars
- Proper iCalendar (RFC 5545) parsing with ical.js
- WebDAV methods support

✅ **CardDAV RFC 6352 Compliance**
- PROPFIND for addressbook discovery
- vCard 3.0/4.0 support
- Contact CRUD operations

✅ **Security & Standards**
- HTTP Basic Authentication
- Proper WebDAV headers and status codes
- XML multistatus responses
- CORS support for web clients

## Setup

1. Copy `.env.example` to `.env` and configure your database URL
2. Install dependencies: `npm install`
3. Create a test user: `npm run setup-user`
4. Run in development: `npm run dev`
5. Build for production: `npm run build && npm start`

## Authentication

The server uses HTTP Basic Authentication. After running `npm run setup-user`, you can use:
- Username: `testuser`
- Password: `testpass`

## Endpoints

- **CalDAV**: `/calendars/` - RFC 4791 compliant
- **CardDAV**: `/contacts/` - RFC 6352 compliant  
- **Health check**: `/health`

## Phone Configuration

Configure your phone's calendar/contacts sync:
- **Server URL**: `https://your-render-app.onrender.com`
- **CalDAV path**: `/calendars/`
- **CardDAV path**: `/contacts/`
- **Username/Password**: Use the credentials from setup-user

### iOS Configuration
1. Settings → Mail → Accounts → Add Account → Other
2. Add CalDAV Account / Add CardDAV Account
3. Enter server details and credentials

### Android Configuration
1. Settings → Accounts → Add Account
2. CalDAV-Sync / CardDAV-Sync (may need third-party app)
3. Enter server details and credentials

## Multiple Calendar Support

✅ **Create Multiple Calendars**: The server supports creating multiple calendars per user

### Creating New Calendars

**Via CalDAV client** (iOS, Android, Thunderbird):
- Most CalDAV clients allow creating new calendars through their UI
- The server supports the MKCALENDAR WebDAV method

**Via API** (for testing):
```bash
# List calendars
curl -u testuser:testpass http://localhost:3000/calendars/

# Create a new calendar via MKCALENDAR
curl -u testuser:testpass -X MKCALENDAR \
  -H "Content-Type: application/xml" \
  http://localhost:3000/calendars/work-calendar

# Delete a calendar
curl -u testuser:testpass -X DELETE \
  http://localhost:3000/calendars/1
```

**Calendar Properties**:
- Each calendar has: name, description, color
- Calendars are isolated per user
- Events belong to specific calendars

## Standards Compliance

This server implements:
- **RFC 4791** (CalDAV) - Calendar access via WebDAV
- **RFC 6352** (CardDAV) - vCard extensions to WebDAV
- **RFC 4918** (WebDAV) - Web-based Distributed Authoring and Versioning
- **RFC 5545** (iCalendar) - Calendar data exchange format
- **RFC 6350** (vCard 4.0) - Contact data format

## Deploy to Render

1. Connect your GitHub repository to Render
2. Set the build command: `npm run build`
3. Set the start command: `npm start`  
4. Add environment variable: `DATABASE_URL` (Render will provide PostgreSQL URL)
5. After deployment, run the setup script to create users