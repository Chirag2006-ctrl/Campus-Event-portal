# Campus Event Portal

A college web development project by Chirag Bhardwaj. The interface extends the supplied Campus Events frontend with a real Node.js backend, SQLite for local development and PostgreSQL for the free Render deployment.

## What works

- Three sample campus events loaded from the database through an API.
- Responsive event cards, title search and category filters.
- Registration form with browser and server validation.
- Persistent registration records, generated receipt IDs and remaining capacity.
- Duplicate email/event protection, closed-event checks and capacity limits.
- Administrator page protected with a secret access key.
- Eight automated API test groups, including persistence after restart.

Events and screenshots use sample data. This is an academic demonstration, not an institutional registration service. There are no student accounts, email verification, notification emails or event editing screens.

## Run locally

Install Node.js 24 or newer from https://nodejs.org/.

1. Download or clone this repository and open its folder in a terminal.
2. Copy `.env.example` to `.env`.
3. Generate an administrator key with the command below and replace `ADMIN_TOKEN` in `.env`.
4. Run `npm start`, then open http://127.0.0.1:3000.

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
npm start
```

Open `/admin` and enter your key to view saved registrations. The key is held only in page memory and cleared on sign-out/reload. Never commit `.env` or place the key in screenshots, URLs or frontend JavaScript. Without a key of at least 24 characters, the admin API denies access.

With no `DATABASE_URL`, the database is created automatically at `data/campus.db`, with sample events seeded only when absent. When `DATABASE_URL` is set, the same application uses PostgreSQL and creates its tables and sample events automatically. The application does not store registration data in localStorage. The original sample events are dated 20, 22 and 24 September 2026; registration closes after each scheduled start. For demonstrations after those dates, update event dates deliberately in the seed data before creating a fresh demonstration database.

## Tests

```sh
npm test
```

In restricted environments that disallow test-worker spawning:

```sh
node --test --test-isolation=none test/api.test.js
```

Tests use isolated temporary databases and future event dates. They do not modify the application's database.

## Architecture

Browser HTML/CSS/JavaScript calls the Node.js HTTP API. The server validates requests and uses prepared SQLite statements locally or parameterized PostgreSQL queries on Render. A transaction checks event capacity and saves a registration. A unique `(event_id, email)` constraint rejects duplicates, with case-insensitive email comparison. A foreign key links each registration to its event.

| Route | Method | Purpose |
| --- | --- | --- |
| `/` | GET | Event listing and registration form |
| `/admin` | GET | Administrator login and records page |
| `/api/events` | GET | Event data, registration counts and remaining capacity |
| `/api/registrations` | POST | Validate and save `{name,email,eventId}` |
| `/api/admin/registrations` | GET | Registration details; requires `Authorization: Bearer <ADMIN_TOKEN>` |
| `/api/health` | GET | Server and database health |

Registration responses include 201 for success, 400 for invalid fields, 404 for missing events, 409 for duplicates/full/closed events, 413 for oversized requests, 415 for an unsupported content type, and 429 for excessive attempts.

## Files

```text
public/           Frontend pages, scripts, styles and favicon
server.js         HTTP routes, SQLite setup, validation and storage selection
postgres.js       PostgreSQL storage adapter used by the Render deployment
test/api.test.js  Automated API and persistence tests
.env.example      Environment variable template without live secrets
Dockerfile        Container deployment definition
render.yaml       Render web-service and PostgreSQL deployment configuration
```

## Deployment

The source repository is https://github.com/Chirag2006-ctrl/Campus-Event-portal.

The included `render.yaml` uses Render's free web service and free PostgreSQL database. `DATABASE_URL` is supplied from the database connection, so registrations persist separately from the web service filesystem. The web service must be in the same Render region as the database. The blueprint generates `ADMIN_TOKEN` as a server secret; retrieve it privately from the Render dashboard if administrator access is needed.

Render's free web services can sleep after inactivity, so the first request may take longer. The free PostgreSQL offer is time-limited by Render; check its dashboard before a final demonstration and export records if you need to retain them after that period. Use `/api/health` for the health check. Render terminates HTTPS in front of the application.

Docker alternative (create `.env` first):

```sh
docker build -t campus-events .
docker run --env-file .env -e HOST=0.0.0.0 -e DB_PATH=/app/data/campus.db -p 3000:3000 -v campus-data:/app/data campus-events
```

## Limits and maintenance

The administrator key gives access to all registration records, so keep it private and use HTTPS on a public deployment. The basic per-process rate limiter uses the socket address; a reverse proxy may cause users to share a limit. Use an edge rate limiter before accepting real traffic. This small academic demonstration does not include institutional login, audit logs, backups, email verification or a full accessibility audit. Define a retention policy before collecting real student information.

## References

- Node.js SQLite API: https://nodejs.org/docs/latest-v24.x/api/sqlite.html
- Render web services: https://render.com/docs/web-services
- Render PostgreSQL: https://render.com/docs/databases
- Render free service limitations: https://render.com/docs/free

## Viva explanation

The frontend displays data and collects input. The API validates every registration independently of the browser. SQLite stores shared records beyond a page reload or server restart. GitHub stores the source, while hosting runs the source on an online server. Deployment and source hosting are separate steps.
