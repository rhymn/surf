# CalDAV/CardDAV Server

A Node.js-based CalDAV and CardDAV server using `webdav-server` with PostgreSQL as the backend database.

## Features

- **CalDAV Support**: Create, read, update, and delete calendar events
- **CardDAV Support**: Manage contacts and address books
- **PostgreSQL Backend**: Persistent storage for all calendar and contact data
- **HTTP Digest Authentication**: Secure user authentication
- **WebDAV Compliance**: Full WebDAV protocol support

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and configure your database and server settings:
   ```bash
   cp .env.example .env
   ```

4. Initialize the database:
   ```bash
   npm run init-db
   ```

## Usage

Start the server:
```bash
npm start
```

The server will be available at `http://localhost:1900` (or the port specified in your `.env` file).

## Configuration

Edit the `.env` file to configure:
- Database connection settings
- Server port and host
- Default admin credentials

## CalDAV/CardDAV Clients

You can connect to this server using any CalDAV/CardDAV compatible client:

### macOS Calendar/Contacts
1. Open Calendar/Contacts app
2. Add new account → Advanced
3. Server: `http://localhost:1900`
4. Username and password from your `.env` file

### Thunderbird
1. Install the "CardBook" and/or calendar add-ons
2. Add new CalDAV/CardDAV account
3. URL: `http://localhost:1900`

### iOS
1. Settings → Calendar/Contacts → Add Account → Other
2. Add CalDAV/CardDAV account
3. Server: `http://localhost:1900`

## API Endpoints

- `/calendars/{username}/` - Calendar collections
- `/contacts/{username}/` - Contact collections (addressbooks)

## Database Schema

The server uses the following tables:
- `users` - User accounts
- `calendars` - Calendar collections
- `events` - Calendar events (iCalendar data)
- `addressbooks` - Contact collections
- `contacts` - Contact cards (vCard data)

## Development

For development with auto-reload:
```bash
npm run dev
```

## License

MIT
