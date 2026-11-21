# Presales Workspace

A private, full-stack workspace for managing presales property visits, opportunity stages, discovery notes, team access, and CSV data exchange.

## What is included

- Secure server-side sessions with HTTP-only cookies and CSRF protection
- Role-based access for administrators, managers, members, and viewers
- Opportunity creation, editing, filtering, deletion, and stage tracking
- Quarterly dashboard metrics and recent activity
- Atomic CSV import, safe CSV export, and a downloadable template
- User profile, role, and account-status administration
- Responsive desktop and mobile interface
- SQLite persistence with no external database service required

## Requirements

- Node.js 22.12 or newer
- npm

## Local development

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

On macOS, Linux, or Git Bash, use `cp .env.example .env` instead of `Copy-Item`.

Open `http://127.0.0.1:5173`.

The default local administrator is:

- Email: `admin@presales.local`
- Password: `Presales@2026`

The Vite development server proxies `/api` requests to the API at `http://127.0.0.1:4174`.

## Configuration

The server loads `.env` automatically. Available variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4174` | API and production web-server port |
| `NODE_ENV` | `development` | Runtime environment |
| `DATABASE_PATH` | `./data/presales.db` | SQLite database path |
| `SESSION_TTL_HOURS` | `12` | Session lifetime |
| `ADMIN_EMAIL` | `admin@presales.local` | Initial administrator email |
| `ADMIN_PASSWORD` | Local default only | Initial administrator password |
| `ADMIN_NAME` | `Workspace Admin` | Initial administrator name |
| `APP_ORIGIN` | Not set | Additional allowed browser origin |

The initial administrator is seeded only when its email does not already exist. Changing the environment variables later does not overwrite an existing account.

## Production

1. Set a strong, unique `ADMIN_PASSWORD`. Production startup stops if this variable is missing or still uses the local demo password when the initial administrator needs to be created.
2. Set `NODE_ENV=production` and `APP_ORIGIN` to the HTTPS application origin.
3. Build and start the application:

```bash
npm ci
npm run build
npm start
```

The Express server serves the compiled client from `dist` and listens on `127.0.0.1`. Place it behind an HTTPS reverse proxy. Production session cookies are marked `Secure`, so HTTPS is required.

## Roles

| Capability | Admin | Manager | Member | Viewer |
| --- | :---: | :---: | :---: | :---: |
| View dashboard and opportunities | Yes | Yes | Yes | Yes |
| Create and edit opportunities | Yes | Yes | Yes | No |
| Delete opportunities | Yes | Yes | No | No |
| Import CSV data | Yes | Yes | No | No |
| Export CSV data | Yes | Yes | Yes | Yes |
| Manage users | Yes | No | No | No |

The final active administrator cannot be demoted or disabled.

## CSV import

Download the template from **Import / Export** and keep these headers unchanged:

```text
visitDate,startTime,endTime,propertyName,propertyLocation,presalerName,stage,softwareType,propertyCategory,wonAmount,currentPms,attendees,requirementDescription,issuesFaced
```

- Dates use `YYYY-MM-DD`.
- Times use 24-hour `HH:MM`, and the end time must be after the start time.
- Accepted stages: `Discovery`, `Demo`, `Proposal`, `Negotiation`, `Won`, `Lost`.
- Accepted software types: `Cloud PMS`, `On-premise PMS`, `POS`, `CRM`, `Other`.
- Accepted property categories: `Hotel`, `Resort`, `Hostel`, `Serviced Apartment`, `Restaurant`, `Other`.
- Imports are limited to 1,000 rows and 2 MB.
- The import is atomic: if any row fails validation, no rows are saved.

## Quality checks

```bash
npm test
npm run build
npm run check
npm audit
```

For an interactive browser smoke test, keep `npm run dev` running in one terminal and run the following in another:

```bash
npm run smoke:browser
```

The browser smoke test uses the installed Microsoft Edge browser, signs in, creates and removes a temporary opportunity, visits the main authenticated pages, checks browser/API errors, and writes screenshots to the operating system's temporary directory.

`npm test` runs API integration coverage for authentication, CSRF and origin checks, role permissions, opportunity CRUD, search, CSV transfer, user administration, and production configuration safeguards.

## Data and backups

SQLite data is stored at `DATABASE_PATH`. The default `data/` database files and local `.env` files are ignored by Git. Back up the database file and its `-wal`/`-shm` companions together while the service is stopped, or use SQLite's supported online backup tooling while it is running.
