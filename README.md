# API Logs

Ingest and query HTTP API request metadata per **project**, with optional **caller** attribution, **trace** context, and separate **headers / body** storage.

## Stack

- **Runtime:** [Bun](https://bun.sh/)
- **HTTP:** [Hono](https://hono.dev/)
- **Database:** PostgreSQL + [Drizzle ORM](https://orm.drizzle.team/)

## Quick start

```bash
createdb api_logs
cp .env.example .env
# set DATABASE_URL

make install
cd server && bun run db:migrate
make dev
```

Server: `http://localhost:8080`

### Web UI (Vite + React + MUI)

Uses **TanStack Query** for server state and **TanStack Store** for UI preferences (selected project id, log filter draft vs applied state, with-count toggles).

```bash
make install-all   # or: cd frontend && bun install
make dev-ui        # http://localhost:5173 — proxies `/api` to :8080
```

Set `VITE_API_URL` when serving the built UI from another origin (see `frontend/.env.example`).

## API (v1)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/health` | Liveness |
| CRUD | `/api/v1/projects` | Manage projects & API keys |
| CRUD | `/api/v1/callers` | Per-project callers (`project_id` + unique `identifier`) |
| POST | `/api/v1/logs` | Ingest (requires `X-API-Key`, `X-Environment`) |
| POST | `/api/v1/logs/batch` | Batch ingest |
| GET | `/api/v1/logs` | List + filters |
| GET | `/api/v1/logs/:id` | One log |
| GET | `/api/v1/logs/:id/details` | Log + headers + body |

Primary keys are **UUID v7** (time-ordered), generated in the app.

## Layout

```
server/
  src/ …
  drizzle/
frontend/
  src/ …   # Dashboard, Projects, Users (callers), API logs
```

## License

MIT
