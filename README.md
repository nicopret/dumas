# Dumas

Visual story development. Create and open series projects stored as portable JSON objects in Amazon S3. Built with
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

`./data` remains mounted at `/app/data` so existing local projects can be migrated,
but normal runtime reads and writes use S3 exclusively. Dumas does not fall back to
local storage when S3 is unavailable.

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

## AWS development configuration

Dumas uses Amazon S3 as the runtime source of truth for project persistence.

Create a private local environment file:

```bash
cp .env.example .env
```

Set `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`DUMAS_S3_BUCKET`, and `DUMAS_S3_PREFIX` in `.env`. The default prefix is
`projects/`. `AWS_SESSION_TOKEN` is optional and is used with temporary
credentials. Compose passes these values to the server at runtime; no AWS
configuration is exposed through `NEXT_PUBLIC_` variables.

Never commit `.env` or AWS credentials.

Rebuild and start the development container after configuring the environment:

```bash
docker compose build
docker compose up -d
```

Verify the CLI and, when credentials have been supplied, verify the caller and
bucket access:

```bash
docker compose exec dumas aws --version
docker compose exec dumas aws sts get-caller-identity
docker compose exec dumas sh -lc 'aws s3api head-bucket --bucket "$DUMAS_S3_BUCKET"'
```

The last two commands contact AWS and should only be run after credentials and a
bucket have been configured. `docker compose exec dumas ./scripts/check-aws.sh`
runs all three checks without displaying credentials.

The application needs only `s3:ListBucket`, `s3:GetObject`, and `s3:PutObject`.
The bucket must remain private. Project objects use
`{DUMAS_S3_PREFIX}{projectId}.json`; both `projects` and `projects/` normalize to,
for example, `projects/3bb48a8e-8914-42af-a978-ff3344c44991.json`.

### Migrate existing local projects

Migration is manual and never runs during startup:

```bash
docker compose exec dumas npm run migrate:projects-to-s3
```

The command validates `.json` files under `data/projects/`, uploads formatted JSON,
and skips keys that already exist. It uses a conditional put as additional
overwrite protection and never changes or deletes the local source files.

## Series projects

Use **+ New Series** to enter a title, or **Open** to load an existing series.
The project page contains Snowflake Step 1, the one-sentence premise editor, and
Step 2, the five-sentence summary editor.

Titles are trimmed and must not be blank. The form prevents duplicate submissions,
shows a recoverable error if saving fails, and opens the new project immediately
after creation. Existing series show their last-modified time and are listed with
the most recently updated first. Each project page links back to the launcher.

### Project files

```json
{
  "schemaVersion": 1,
  "id": "3bb48a8e-8914-42af-a978-ff3344c44991",
  "series": {
    "title": "The Example Series",
    "premise": "",
    "summary": {
      "setup": "",
      "disaster1": "",
      "disaster2": "",
      "disaster3": "",
      "resolution": ""
    }
  },
  "createdAt": "2026-09-15T20:15:00.000Z",
  "updatedAt": "2026-09-15T20:15:00.000Z"
}
```

The server-only S3 repository validates IDs and object contents. It writes formatted
UTF-8 JSON with `application/json`, uses paginated listings, and ignores unrelated
keys. Corrupt project objects are logged and skipped without preventing healthy
projects from appearing. Timestamps are stored as UTC ISO strings and displayed as
readable UTC dates and times. Pages and listing responses are dynamic.

| Endpoint | Behaviour |
| --- | --- |
| `GET /api/projects` | Metadata sorted by most recently updated |
| `POST /api/projects` | Accepts `{ "title": "My series" }`; returns 201 with the project, or 400 for invalid JSON/title |
| `GET /api/projects/{projectId}` | Complete project; 400 for malformed IDs, 404 for missing projects |
| `PATCH /api/projects/{projectId}/premise` | Save the Step 1 premise |
| `PATCH /api/projects/{projectId}/summary` | Save all five Step 2 summary fields |

S3 tests inject a mocked client and never contact AWS. They cover creation, loading,
missing objects, premise updates with unknown-field preservation, pagination,
sorting, unrelated keys, corrupt projects, and prefix normalization. The retained
local repository tests use temporary directories independent of `data/`.

### Code structure

```text
src/
├── app/
│   ├── page.tsx                         # Project launcher
│   ├── api/projects/                   # List, create, and load endpoints
│   └── projects/[projectId]/           # Snowflake workspace and not-found page
├── components/project-launcher.tsx    # Creation form and series list
└── lib/projects/
    ├── project-types.ts               # Versioned schema and list metadata
    ├── project-repository.ts          # Abstraction, validation, and migration-only local repository
    ├── s3-project-repository.ts       # Runtime S3 persistence
    ├── summary-payload.ts             # Step 2 API payload validation
    ├── *-repository.test.ts           # Isolated local and mocked-S3 tests
    └── format-date.ts                 # Human-readable UTC timestamps
```

### Project launcher verification

- All eight repository tests, ESLint, and TypeScript checks passed.
- Browser checks covered creation, opening, validation, cancellation, duplicate
  submission prevention, recoverable creation errors, and mobile layout.
- A project created through the UI matched its host JSON file and remained
  available after `docker compose down` and `docker compose up -d --build`.
- Live browser hot reload worked through the Pi's LAN address. Temporary
  verification data and source edits were removed afterward.

The workspace currently supports the one-sentence premise and five-sentence
summary. Expanded sections, visual workflows, renaming, deletion, autosave, and
automatic backups are not implemented.

## Snowflake Step 1: one-sentence premise

Edit the textarea and choose **Save premise**, or press **Ctrl+S / Cmd+S** while
focused in the premise workspace. The live count uses whitespace-separated words.
Empty premises are valid; saves trim outer whitespace and preserve Unicode and
punctuation. The editor shows saved, unsaved, saving, and failure states. Failed
requests retain your text and can be retried. There is no autosave.

`PATCH /api/projects/{projectId}/premise` accepts `{ "premise": "Your sentence" }`
and returns the complete updated project (200). Invalid IDs/payloads return 400;
missing projects return 404; storage failures return a generic 500 error.

`series.premise` is a string in schema version 1. Legacy files without it load with
an empty premise in memory and are only updated when explicitly saved.
`updatePremise` loads the complete file, changes the premise and `updatedAt`, and
stores the complete object back in S3. It preserves `createdAt` and unrelated fields,
including fields not yet represented in the UI. The last completed simultaneous
save wins (no multi-user conflict detection).

The interactive component is `src/components/snowflake/premise-editor.tsx`.
Repository tests also cover premise updates, clearing, timestamp handling,
unknown-field preservation, legacy files, invalid payloads, and corrupt files.

Step 1 verification passed: all 12 repository tests, ESLint, and TypeScript;
browser checks covered word count, Unicode, trimming, save states, duplicate
prevention, failure recovery, clearing, Ctrl+S/Cmd+S, and mobile layout. Saved
JSON was inspected on the host and survived page reload and a Compose rebuild
and restart. Temporary verification data was removed.

## Snowflake Step 2: five-sentence summary

Step 2 provides separate textareas for setup, three major disasters or plot shifts,
and resolution. Empty values are valid. Saves trim outer whitespace and support
**Ctrl+S / Cmd+S** while focus is in the summary editor. The editor reports saved,
unsaved, saving, and failed states while retaining text after a failed request.

`PATCH /api/projects/{projectId}/summary` requires a `summary` object containing
`setup`, `disaster1`, `disaster2`, `disaster3`, and `resolution` strings. It loads
the complete S3 project, changes only `series.summary` and `updatedAt`, then writes
the complete document back to the existing object. Legacy projects without a
summary receive five empty strings in memory and are not rewritten merely by loading.
