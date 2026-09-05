# Chess Managers

A full-stack web application for managing chess clubs, players, tournaments, and ratings. Built with React, Express.js, and PostgreSQL.

**Table of Contents:**
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Environment Setup](#environment-setup)
- [Development](#development)
- [Production](#production)
- [Database](#database)
- [API Documentation](#api-documentation)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Node.js**: ≥20.0.0 ([Download](https://nodejs.org/))
- **npm**: ≥10.0.0 (included with Node.js)
- **PostgreSQL**: ≥12 ([Download](https://www.postgresql.org/download/))
- **Git**: For version control

Verify installations:
```bash
node --version    # v20.x or higher
npm --version     # 10.x or higher
psql --version    # PostgreSQL 12+ or higher
```

---

## Quick Start

### 1. Clone & Install

```bash
git clone <repository-url>
cd chessmanagers

# Install root dependencies (client build tools, utilities)
npm install

# Install server dependencies
cd server
npm install
cd ..
```

### 2. Configure Environment

```bash
# Copy example files to actual env files
cp .env.example .env
cp server/.env.example server/.env
```

See [Environment Setup](#environment-setup) below for detailed configuration.

### 3. Setup Database

Create a PostgreSQL database and update `DATABASE_URL` in `server/.env`:

```bash
# Create database (via psql or GUI tool)
createdb chessmanagers

# Update server/.env with connection string:
# DATABASE_URL=postgresql://user:password@localhost:5432/chess_managers
```

Schema is auto-initialized on server startup.

### 4. Run Development Server

```bash
npm run dev
```

This concurrently starts:
- **Client**: http://localhost:3000 (Vite dev server)
- **API through Vite**: http://localhost:3000/api/v1 (proxied to Express on port 5000)
- **Express directly**: http://localhost:5000 (with `PORT=5000` from `server/.env.example`)

### 5. Open Browser

Navigate to http://localhost:3000

---

## Environment Setup

### Client Environment (`.env`)

Located at project root. Used by Vite during build and dev.

```bash
# Leave empty in development. Vite proxies /api/v1 to the API server.
VITE_API_URL=
```

**Development defaults:**
- API server runs on same origin with `/api/v1` proxy (see `vite.config.js`)

**Production:**
- Keep `VITE_API_URL` empty when Express serves the frontend from the same origin
- Set `VITE_API_URL` only when the frontend and API are deployed separately
- Example: `VITE_API_URL = https://api.example.com/api/v1`

---

### Server Environment (`server/.env`)

Core settings for Express server and database.

#### Required Fields

```bash
# Server Configuration
PORT=5000                                    # API port used by the local Vite proxy
NODE_ENV=development                        # 'development' or 'production'
JWT_SECRET=your-secret-key-min-32-chars    # Must be ≥32 characters; use strong secret in production

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/chess_managers

# CORS - allowed origin(s) for frontend requests
# Can be single URL or comma-separated list
CORS_ORIGIN=http://localhost:3000          # In dev; in prod, use your frontend URL
```

#### Important Optional Fields

```bash
# JWT Token Expiry
JWT_EXPIRES_IN=7d                           # JWT expiration time (default: 7 days)
REFRESH_TOKEN_EXPIRY_DAYS=30                # Refresh token expiry (default: 30 days)

# Club Configuration

# Frontend Serving (production only)
SERVE_FRONTEND=false                        # Set true to serve built frontend from server
FRONTEND_URL=https://example.com            # Browser-facing frontend URL
COOKIE_SAME_SITE=lax                        # Use none for a truly cross-site frontend/API pair

# Google OAuth (callback must exactly match Google Cloud Console)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/v1/auth/google/callback

# Email/SMTP (optional - features disabled if not configured)
SMTP_HOST=smtp.gmail.com                    # SMTP server
SMTP_PORT=587                               # SMTP port (usually 587 or 465)
SMTP_SECURE=false                           # true for port 465, false for 587
SMTP_USER=your-email@gmail.com              # SMTP username
SMTP_PASS=your-app-password                 # SMTP app password (not regular password)
SMTP_FROM=noreply@example.com               # From address for emails
```

#### Security Notes

- **JWT_SECRET**: Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- **Never commit `.env`** files; they contain secrets
- Use strong, random values for production
- See `.env.example` for template

---

## Development

### Run Full Stack (Recommended)

Concurrently run client + server with hot reload:

```bash
npm run dev
```

Access:
- **Client**: http://localhost:3000
- **API Health**: http://localhost:5000/health (direct Express URL; Vite does not proxy `/health`)

### Run Components Separately

**Client only:**
```bash
npm start
# Runs Vite on http://localhost:3000
# API proxy sends requests to server (requires server running separately)
```

**Server only:**
```bash
npm run server:dev
# Runs on PORT (5000 in server/.env.example) with nodemon auto-reload
# Good for backend-only development
```

### Other Commands

```bash
# Code quality
npm run lint                # Run ESLint on all files
npm run lint -- --fix      # Auto-fix linting issues

# Testing
npm test                   # Run tests in watch mode
npm run test:ui            # Run tests with UI
npm run test:coverage      # Generate coverage report

# Production build
npm run build              # Build client to dist/
npm run build:prod         # Build + optimize server (removes devDependencies)
```

---

## Production

### 1. Build Client

```bash
npm run build
# Output: dist/ (ready to deploy or serve from server)
```

### 2. Configure for Production

Update `server/.env`:

```bash
NODE_ENV=production
PORT=5000
SERVE_FRONTEND=true                  # Enable serving frontend from server
CORS_ORIGIN=https://example.com      # Your production domain
FRONTEND_URL=https://example.com     # OAuth returns here after the callback
GOOGLE_REDIRECT_URI=https://example.com/api/v1/auth/google/callback
JWT_SECRET=your-strong-production-secret      # Must be 32+ chars
DATABASE_URL=postgresql://user:pass@db-host:5432/chess_managers
```

### 3. Start Server

```bash
cd server
npm install --omit=dev     # Remove dev dependencies for smaller footprint
npm start                  # Start production server
# Serves frontend from dist/ + API on /api/v1
```

Set `VITE_API_URL` in the root build environment before building, not in `server/.env`. Leave it empty for this same-origin deployment.

Server listens on `PORT` (5000 above; code fallback is 3000 if unset) and serves:
- Static frontend files from `dist/`
- API routes at `/api/v1/*`
- Health check at `/health`

### 4. Deployment Options

**Option A: Docker**
The checked-in `Dockerfile` builds the frontend in one stage, installs production server dependencies in another, and starts Express. `.dockerignore` excludes local secrets and uploads.

```bash
docker build -t chessmanagers .
docker run -d --name chessmanagers --env-file server/.env \
  -e NODE_ENV=production -e SERVE_FRONTEND=true -e PORT=5000 \
  -p 5000:5000 -v chessmanagers-uploads:/app/server/uploads chessmanagers
curl http://localhost:5000/health
```

Supply production database, JWT, domain, and email settings through the environment. The database must be reachable from the container; `localhost` inside it is not the host database. Keep the uploads volume for durable attachments. Use an HTTPS reverse proxy for the public domain and secure production cookies.

**Option B: Traditional VPS/Railway/Heroku**
- Push to git repo
- Set environment variables (avoid committing `.env`)
- Build: `npm ci && npm run build && npm --prefix server ci --omit=dev`
- Start: `npm --prefix server start` with `NODE_ENV=production` and `SERVE_FRONTEND=true`
- Health: `/health`; API: `/api/v1`; frontend: `/`

---

## Database

### Schema

The PostgreSQL schema is auto-initialized on server startup via the migrations in `server/src/database/migrations/`. Tables include:

- **users** — User accounts with email, password hash, role
- **clubs** — Chess clubs owned by users
- **players** — Players in each club with ratings
- **matches** — Match results and ratings changes
- **tournaments** — Tournament metadata
- **user_clubs** — User→Club membership links

### Setup Database Locally

Using `psql`:
```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE chessmanagers;

# Verify
\l
```

Using GUI (pgAdmin, DBeaver):
1. Open your PostgreSQL client
2. Create new database: `chessmanagers`
3. Update `DATABASE_URL` in `server/.env`

### Reset Database (Dev Only)

**Warning: This deletes all data.**

```bash
# Connect to database
psql -U postgres chessmanagers

# Drop schema and recreate
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

# Server will reinitialize schema on next startup
npm run server:dev
```

Or automate:
```bash
dropdb chessmanagers
createdb chessmanagers
npm run server:dev   # Auto-initializes schema
```

---

## API Documentation

### Base URL

- **Development**: `http://localhost:3000/api/v1`
- **Production, same origin**: `https://example.com/api/v1`
- **Production, separate API**: `https://api.example.com/api/v1` (set `VITE_API_URL` at build time)

### Health Check

```bash
GET /health
# Response: { status: 'ok', timestamp: '2025-01-08T...' }
```

### Authentication

All protected endpoints require JWT bearer token:

```bash
Authorization: Bearer <token>
```

**Obtain token via login:**
```bash
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password"
}

# Response:
{
  "user": { "id": "...", "email": "...", "role": "..." },
  "token": "eyJhbGc..."
}
```

### Main Endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/auth/login` | ✗ | User login |
| POST | `/auth/register` | ✗ | User registration |
| GET | `/auth/me` | ✓ | Get current user |
| POST | `/clubs` | ✓ | Create club |
| GET | `/clubs/mine` | ✓ | Get user's clubs |
| GET | `/clubs/:clubId/players` | ✓ | List players |
| POST | `/clubs/:clubId/matches` | ✓ | Submit match result |
| GET | `/clubs/:clubId/leaderboard` | ✓ | Get club leaderboard |

Full API routes defined in `server/src/routes/`.

---

## Project Structure

```
chessmanagers/
├── .env                         # Client env (VITE_API_URL) — IGNORED BY GIT
├── .env.example                 # Template for client env
├── .gitignore                   # Git ignore rules
├── package.json                 # Client scripts, client-only deps
├── vite.config.js              # Vite config + API proxy
├── eslint.config.js            # ESLint rules
├── index.html                   # HTML entry point
├── README.md                    # This file
│
├── src/                         # React frontend
│   ├── main.jsx                # Entry point
│   ├── app/
│   │   ├── App.jsx             # Root component
│   │   ├── providers.jsx       # Auth, Theme, Club, Notifications contexts
│   │   └── routes.jsx          # Route definitions with guards
│   ├── config/
│   │   └── api.js              # Fetch wrapper with JWT, error handling
│   ├── pages/                  # Page components
│   ├── features/               # Feature modules (leaderboard, players, etc.)
│   ├── shared/                 # Shared components, hooks, layouts
│   └── styles/                 # Global CSS
│
├── server/                      # Express backend
│   ├── index.js                # Server entry point
│   ├── .env                    # Server env — IGNORED BY GIT
│   ├── .env.example            # Template for server env
│   ├── package.json            # Server-only deps + scripts
│   │
│   └── src/
│       ├── config/
│       │   └── env.js          # Environment validation (Zod)
│       ├── database/
│       │   ├── database.js     # Query wrapper + JSON field normalization
│       │   ├── pg_database.js  # PostgreSQL pool + schema init
│       │   └── schema.sql      # Database schema
│       ├── middleware/
│       │   ├── auth.js         # JWT verification
│       │   ├── errorHandler.js # Error response formatter
│       │   ├── requireRole.js  # Role-based access
│       │   └── validate.js     # Request validation
│       ├── models/             # ORM-like model classes
│       ├── controllers/        # Route handlers
│       ├── routes/             # Route definitions
│       └── utils/              # Helpers (ratings calculation, etc.)
│
└── dist/                        # Built frontend (created by npm run build)
```

---

## Troubleshooting

### Port Already in Use

```bash
# Error: listen EADDRINUSE: address already in use :::3000

# Find process using port 3000
lsof -i :3000        # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Kill process (example PID 1234)
kill -9 1234          # macOS/Linux
taskkill /PID 1234    # Windows
```

### Database Connection Error

```bash
# Error: connect ECONNREFUSED 127.0.0.1:5432

# Verify PostgreSQL is running
psql -U postgres -c "SELECT version();"

# Check DATABASE_URL format
# Format: postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE
# Example: postgresql://postgres:mypassword@localhost:5432/chessmanagers
```

### API Calls Fail / 404 Errors

1. **Verify server is running:**
   ```bash
   curl http://localhost:5000/health
   ```

2. **Check VITE_API_URL in `.env`:**
   ```bash
   cat .env | grep VITE_API_URL
   # Should be empty in dev, or an absolute API URL for a separate production API
   ```

3. **Clear browser cache:**
   - DevTools → Application → Storage → Clear Site Data
   - Or open in private/incognito window

### JWT / Auth Issues

```bash
# Error: 401 Unauthorized or "Session expired"

# Check JWT_SECRET in server/.env
# - Must be set
# - Must be ≥32 characters
# - If changed, existing tokens are invalidated

# Generate new secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Update server/.env and restart
npm run server:dev
```

### Environment Variables Not Loading

**Client:**
```bash
# Vite only loads vars prefixed with VITE_ from .env
# Verify in browser console:
console.log(import.meta.env.VITE_API_URL)

# If undefined, check:
# 1. .env file exists at project root
# 2. Contains: VITE_API_URL=...
# 3. Restart dev server (npm run dev)
```

**Server:**
```bash
# dotenv loads from server/.env
# Verify vars are set:
node -e "require('dotenv').config({ path: 'server/.env' }); console.log(process.env.JWT_SECRET ? 'JWT_SECRET set' : 'JWT_SECRET missing')"
```

### ESLint Errors

```bash
# Fix linting issues automatically
npm run lint -- --fix

# If issues persist, check eslint.config.js
```

---

## Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Commit with clear messages: `git commit -m "Add feature description"`
3. Run linter: `npm run lint -- --fix`
4. Push: `git push origin feature/your-feature`
5. Open a pull request

---

## Support

For issues, questions, or suggestions, please open an issue on GitHub or contact the team.

---

**Last Updated**: April 2026
