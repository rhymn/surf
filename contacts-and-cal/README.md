# Calendar and Contacts Sync Server

A **Prerequisites**

Just PostgreSQL installed - that's it! 

- **Local dev**: Uses default `postgres` database (no setup needed)
- **Production**: Uses `DATABASE_URL` environment variable (Render sets this automatically)

**Install PostgreSQL** (if not already installed):
```bash
# Ubuntu/Debian
sudo apt install postgresql

# macOS  
brew install postgresql

# Start PostgreSQL
sudo systemctl start postgresql  # Linux
brew services start postgresql   # macOS
```

**Default credentials**:
- Username: `admin`
- Password: `admin123`mpliant** CalDAV/CardDAV server for syncing calendars and contacts with PostgreSQL backend.

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

## 🚀 Zero-Config Setup

**Just run the server** - everything happens automatically:

```bash
npm install
npm run dev
```

**That's it!** The server will automatically:
- ✅ Create database tables if they don't exist
- ✅ Create a default user (`testuser` / `testpass`)  
- ✅ Create a default calendar
- ✅ Show you the URLs to use

### Prerequisites

You just need PostgreSQL installed and a database available. The server uses these defaults:
- Database: `postgresql://caldav_user:caldav_pass@localhost:5432/caldav_db`
- Or set `DATABASE_URL` environment variable

**Quick PostgreSQL setup** (if needed):
```bash
# Ubuntu/Debian
sudo apt install postgresql
sudo -u postgres createdb caldav_db
sudo -u postgres psql -c "CREATE USER caldav_user WITH PASSWORD 'caldav_pass';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE caldav_db TO caldav_user;"
```

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