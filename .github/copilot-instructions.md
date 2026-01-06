# Surf Repository - GitHub Copilot Instructions

## Repository Overview

This is a monorepo containing multiple web applications and services, primarily focused on surfing-related services and other web applications. The repository is deployed to Render.com with different services in separate directories.

### Project Structure

- **surf/** - A simple service that fetches data from SMHI (Swedish Meteorological and Hydrological Institute) for selected surf spots and displays when surf's up in a calendar (ICS format). Node.js application.
- **chat/** - A SvelteKit application with chat functionality, using Drizzle ORM with PostgreSQL database and Tailwind CSS for styling.
- **contacts-and-cal/** - A WebDAV server for calendars and contacts with JSON storage, built with Express and TypeScript.
- **simple-chat/** - A simple Node.js chat application using a basic database.
- **monsters-and-trees/** - A Node.js web application.
- **unplastech/** - A static HTML website.

## Technology Stack

- **Primary Languages**: TypeScript, JavaScript (ES Modules)
- **Frontend**: SvelteKit 5, Svelte 5, Tailwind CSS
- **Backend**: Node.js, Express
- **Databases**: PostgreSQL (with Drizzle ORM), JSON file storage
- **Build Tools**: Vite, TypeScript Compiler (tsc)
- **Testing**: Jest (for TypeScript projects)
- **Linting**: ESLint with Prettier
- **Deployment**: Render.com (configured via render.yaml)

## Building and Running

### Individual Projects

Each project directory contains its own `package.json` and can be built/run independently:

#### chat/
```bash
cd chat
npm install
npm run dev          # Development server
npm run build        # Production build
npm run lint         # Lint and format check
npm run format       # Format code
npm run check        # Type checking with svelte-check
```

#### contacts-and-cal/
```bash
cd contacts-and-cal
npm install --include=dev
npm run build        # Compile TypeScript
npm run dev          # Development with watch mode
npm start            # Start production server
npm test             # Run Jest tests
npm run lint         # Lint TypeScript files
```

#### surf/
```bash
cd surf
npm install
npm start            # Start with nodemon
```

#### simple-chat/ and monsters-and-trees/
```bash
cd simple-chat  # or cd monsters-and-trees
npm install
node server.js       # Start the server
```

### Root Level

The root `package-lock.json` is minimal and most work happens in individual project directories.

## Coding Standards and Conventions

### General Guidelines
- Use ES Modules (`"type": "module"` in package.json)
- Follow existing code style and patterns within each project
- Always run linters and formatters before committing
- Write type-safe code using TypeScript where applicable

### TypeScript Projects (chat, contacts-and-cal)
- Use strict TypeScript configuration
- Prefer explicit typing over `any`
- Follow the project's specific TypeScript configurations in `tsconfig.json`

### SvelteKit Projects (chat)
- Follow Svelte 5 best practices and component conventions
- Use SvelteKit's file-based routing
- Apply Tailwind CSS utility classes for styling
- Run `npm run check` for Svelte type checking

### Styling
- **chat/**: Uses Tailwind CSS with Prettier plugin for class sorting
- Use Prettier for code formatting with project-specific configurations
- Follow ESLint rules defined in each project's `eslint.config.js`

### Database
- **chat/**: Uses Drizzle ORM with PostgreSQL. Run `npm run db:push` to sync schema changes. Note: This project is in development and not currently deployed to Render - it's configured for local development with database credentials in `.env` file.
- **simple-chat/** and **contacts-and-cal/**: Connect to PostgreSQL database via DATABASE_URL environment variable provided by Render
- **contacts-and-cal/**: Also uses JSON file storage via fs-extra for some data
- Database migrations should be handled through Drizzle Kit for the chat project

## Testing

- **contacts-and-cal/**: Uses Jest with ts-jest for TypeScript testing
- Run `npm test` in the respective project directory
- Follow existing test patterns in the `tests/` directories
- Write tests for new functionality when adding features

## Contribution Guidelines

### When Working on Issues
1. Identify which project directory the issue relates to
2. Navigate to that specific directory for development
3. Run the appropriate build and test commands for that project
4. Ensure linting passes before submitting changes
5. Test changes locally using the dev server
6. Update documentation if changing functionality

### Code Changes
- Make minimal, focused changes that address the specific issue
- Maintain consistency with existing code patterns
- Run linters and formatters: `npm run lint` and `npm run format` where available
- Run type checking for TypeScript projects: `npm run check` or `npm run build`
- Test the specific component or feature affected by changes

### Pull Requests
- Ensure CI/CD checks pass (linting, type checking, tests)
- Each project should build successfully
- Update relevant README files if changing setup or usage
- Keep changes scoped to the relevant project directory

## Deployment

- The repository uses Render.com for deployment, configured in `render.yaml`
- **Deployed services with PR previews enabled**: surf, monsters-and-trees, simple-chat, contacts-and-cal-server
- **Deployed static site (no PR previews)**: unplastech
- **Not currently deployed**: chat (development only)
- All services are deployed to Frankfurt region
- PostgreSQL database (named "db") is shared by simple-chat and contacts-and-cal services via DATABASE_URL environment variable

## Important Notes

- This is a monorepo with independent projects - changes in one should not affect others
- Each project has its own dependencies and build process
- The root directory contains configuration for Render deployment
- Always work within the specific project directory for the task at hand
- Environment variables are managed through Render.com dashboard or `.env` files (see `.env.example` where provided)
