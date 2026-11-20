# BorrowBuddy

**Borrow more. Buy less.** BorrowBuddy is a community borrowing platform. People list things they own, and neighbours request them for a date range. The owner approves the request, hands the item over, and marks it returned. Borrowing is free in v1.

PERN prototype: PostgreSQL · Express · React (Vite) · Node.js.

- [docs/SCOPE.md](docs/SCOPE.md): goals, scope, assumptions, backlog
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): stack, structure, request flow, ER diagram
- [docs/API.md](docs/API.md): every endpoint
- [docs/DATABASE.md](docs/DATABASE.md): tables, constraints, state machine
- [docs/TESTING.md](docs/TESTING.md): automated smoke test and manual checklist

## Run with Docker (quickest)

Requires Docker Desktop (or Docker Engine with Compose v2).

```bash
cp .env.example .env                      # then set JWT_SECRET (openssl rand -hex 32)
docker compose up -d --build
```

Open **http://localhost:8080**. On first start the server container applies migrations and loads the demo accounts (listed below) if the database is empty.

| Container | What it is | Host port |
| --- | --- | --- |
| `borrowbuddy-client` | nginx serving the built React app; proxies `/api` and `/uploads` to the server | **8080** (`WEB_PORT`) |
| `borrowbuddy-server` | Express API; runs `migrate` and `seed-if-empty` on start | not published |
| `borrowbuddy-db` | Postgres 16, database `borrowbuddy` | 5433 (for local dev tools only) |

Data lives in the named volumes `borrowbuddy_pgdata` (database) and `borrowbuddy_uploads` (photos), so it survives restarts and rebuilds.

Useful commands:

```bash
docker compose logs -f server                       # API logs
docker compose exec server npm run db:reset         # wipe and reseed demo data
docker compose up -d --build                        # rebuild after code changes
docker compose down                                 # stop and remove containers (data kept)
docker compose down -v                              # also delete the database and photos
```

Root `.env` variables (used only by Docker Compose):

| Variable | Default | Purpose |
| --- | --- | --- |
| `JWT_SECRET` | *(required)* | Token signing secret; Compose refuses to start without it |
| `WEB_PORT` | `8080` | Host port for the web app |
| `SEED_DEMO` | `true` | Seed demo users/items on first start when the DB is empty |

The rest of this README covers running without Docker for development.

## Prerequisites

- **Node.js 20+** (developed on Node 25) and npm
- **PostgreSQL 14+**, either:
  - **Docker** (easiest): `docker compose up -d` starts a dedicated Postgres 16 on **port 5433**, or
  - your own local or hosted Postgres where you can create a database named `borrowbuddy`

## Setup

```bash
# 1. Start only the dedicated database (skip if you use your own Postgres)
docker compose up -d db

# 2. Server
cd server
npm install
cp .env.example .env          # then set JWT_SECRET to a long random string
npm run db:create             # creates "borrowbuddy" if it does not exist
npm run db:migrate            # applies migrations/001_init.sql
npm run db:seed               # loads demo users and items

# 3. Client
cd ../client
npm install
cp .env.example .env
```

> With the Docker database, `borrowbuddy` is created on first start, so `db:create` just reports that it already exists. The Docker stack and local dev share the same database volume. Stop the `server`/`client` containers (`docker compose stop server client`) if you run the dev servers, so you don't have two copies of the app running.

## Environment variables

**server/.env**

| Variable | Example | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://borrowbuddy:borrowbuddy@localhost:5433/borrowbuddy` | Connection string. **The database name must be `borrowbuddy`**; migrate/reset refuse anything else |
| `JWT_SECRET` | `openssl rand -hex 32` | Secret used to sign login tokens |
| `PORT` | `5050` | API port |
| `CLIENT_URL` | `http://localhost:5173` | Origin allowed by CORS |
| `DB_SSL` | `false` | Set `true` for hosted Postgres that requires SSL |

**client/.env**

| Variable | Example | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:5050` | Base URL of the API |

## Database commands

Run these from `server/`. Each one prints the target host and database name before it runs.

| Command | Effect |
| --- | --- |
| `npm run db:create` | Create the `borrowbuddy` database if missing |
| `npm run db:migrate` | Apply any new files in `migrations/` (tracked in `schema_migrations`) |
| `npm run db:seed` | Insert demo data (use on an empty database) |
| `npm run db:reset` | **Drop all tables** in `borrowbuddy`, then migrate and seed again |

## Run

```bash
# terminal 1: API on http://localhost:5050
cd server && npm run dev

# terminal 2: web app on http://localhost:5173
cd client && npm run dev
```

Open http://localhost:5173.

API smoke test (with the API running, on freshly reset data):

```bash
cd server && npm run db:reset && npm run smoke
```

## Demo accounts

All demo accounts use the password **`password123`**.

| Name | Email | Lends |
| --- | --- | --- |
| Asha Kumar | asha@example.com | Power Drill (Tools) |
| Ben Carter | ben@example.com | Bicycle (Sports) |
| Chen Li | chen@example.com | Calculator (Study) |
| Divya Rao | divya@example.com | Camping Kit (Outdoor) |

Try it: log in as Ben and request Asha's Power Drill. Then, in a private window, log in as Asha and go to **My Items** to Approve → Mark borrowed → Mark returned.

## Project structure

```
borrowbuddy/
├── docker-compose.yml   # db + server + client (nginx) stack
├── .env.example         # Compose variables (JWT_SECRET, WEB_PORT, SEED_DEMO)
├── docs/                # scope, architecture, API, database, testing
├── server/              # Express API, SQL migrations, seeds, db scripts
└── client/              # React + Vite app
```

## Stopping and cleaning up

```bash
docker compose stop          # stop the database (data is kept)
docker compose down -v       # remove the container AND its data volume
```
