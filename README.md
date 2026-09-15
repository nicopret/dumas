# Dumas

Visual story development. Create and open series projects stored as portable JSON files. Built with
Next.js 16.3.5, TypeScript, App Router, and ESLint, with minimal CSS.

## Development

Install Docker Engine and the Docker Compose plugin. No host Node.js or npm is
needed. The official Node 24 LTS image supports Raspberry Pi ARM64 and uses the
host architecture automatically.

### Start Dumas

```bash
docker compose up --build
```

### Start in the background

```bash
docker compose up -d --build
```

### Stop

```bash
docker compose down
```

### View logs

```bash
docker compose logs -f
```

Open http://localhost:9000 on the host, or
http://<raspberry-pi-ip>:9000 from another machine on the local network. Next.js
listens on `0.0.0.0:3000`; Compose publishes port `9000` on the host.

Changes under `src/` automatically reload without rebuilding the image. Development
uses webpack with `WATCHPACK_POLLING=true` for reliable bind-mount file watching.
`next.config.ts` permits development assets from loopback and private IPv4 LAN
addresses so browser hot reload also works through the Pi’s IP address.
Named Docker volumes keep container `node_modules` and `.next` separate from the
host. The development image installs dependencies directly into the volume on
startup, avoiding a second copy in the image. It runs `npm ci` so the volume matches the lockfile;
restart the service after changing dependencies.

`./data` is mounted at `/app/data`. Each series is stored in
`data/projects/<uuid>.json` and survives container rebuilds and restarts.
The directory is created automatically. Its contents are ignored by Git, except `.gitkeep`.

The service uses `restart: unless-stopped`. After starting it in the background,
it restarts with Docker unless explicitly stopped. Docker must itself be enabled
at boot for automatic startup.

### Checks inside Docker

```bash
docker compose exec dumas npm run lint
docker compose exec dumas npm run typecheck
docker compose exec dumas npm test
```

Dependency versions are recorded in `package-lock.json` for reproducible installs.

## Series projects

Use **+ New Series** to enter a title, or **Open** to load an existing series.
The project page confirms which file was loaded; the story editor is not implemented yet.

Titles are trimmed and must not be blank. The form prevents duplicate submissions,
shows a recoverable error if saving fails, and opens the new project immediately
after creation. Existing series show their last-modified time and are listed with
the most recently updated first. Each project page links back to the launcher.

### Project files

```json
{
  "schemaVersion": 1,
  "id": "3bb48a8e-8914-42af-a978-ff3344c44991",
  "series": { "title": "The Example Series" },
  "createdAt": "2026-09-15T20:15:00.000Z",
  "updatedAt": "2026-09-15T20:15:00.000Z"
}
```

The server-only repository validates IDs and file contents, writes UTF-8 JSON to a
same-directory temporary file, flushes it, then renames it atomically. Corrupt files
are logged and skipped in listings, never overwritten. Timestamps are stored as
UTC ISO strings and displayed as readable UTC dates and times. Pages and listing
responses are dynamic so changes are read from disk.

| Endpoint | Behaviour |
| --- | --- |
| `GET /api/projects` | Metadata sorted by most recently updated |
| `POST /api/projects` | Accepts `{ "title": "My series" }`; returns 201 with the project, or 400 for invalid JSON/title |
| `GET /api/projects/{projectId}` | Complete project; 400 for malformed IDs, 404 for missing projects |

Tests use temporary directories independent of `data/`. They cover creation,
loading, sorting, invalid inputs, corrupt files, filesystem failures, symlink
protection, and concurrent creation. No database or browser storage is used.

### Code structure

```text
src/
├── app/
│   ├── page.tsx                         # Project launcher
│   ├── api/projects/                   # List, create, and load endpoints
│   └── projects/[projectId]/           # Project details and not-found page
├── components/project-launcher.tsx    # Creation form and series list
└── lib/projects/
    ├── project-types.ts               # Versioned schema and list metadata
    ├── project-repository.ts          # Server-only filesystem persistence
    ├── project-repository.test.ts     # Isolated repository tests
    └── format-date.ts                 # Human-readable UTC timestamps
```

### Verification completed for this step

- All eight repository tests, ESLint, and TypeScript checks passed.
- Browser checks covered creation, opening, validation, cancellation, duplicate
  submission prevention, recoverable creation errors, and mobile layout.
- A project created through the UI matched its host JSON file and remained
  available after `docker compose down` and `docker compose up -d --build`.
- Live browser hot reload worked through the Pi's LAN address. Temporary
  verification data and source edits were removed afterward.

This step provides project creation and loading only. Snowflake editing, renaming,
deletion, autosave, and automatic backups are not implemented yet.
