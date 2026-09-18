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

For AI rewrites, also set `GEMINI_API_KEY`. `GEMINI_MODEL` is optional and
defaults to `gemini-3.8-flash`. Both variables remain server-side and must never
use a `NEXT_PUBLIC_` prefix.

For story expansion, set `OPENAI_API_KEY`. `OPENAI_MODEL` is optional and defaults
to `gpt-5.6`. These variables are also server-side only.

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

The application needs only `s3:ListBucket`, `s3:GetObject`, `s3:PutObject`, and
`s3:DeleteObject`. Delete permission should be scoped to project objects under
`projects/*` (or the equivalently configured `DUMAS_S3_PREFIX`); no broader
bucket deletion permission is required.
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
A new project opens with the story-idea editor. After its idea is saved, the
project page uses the vertical Main Story workflow as its primary workspace.
Premise and five-sentence summary data remain in the project JSON and continue to
provide each node's read-only preview, but their initial setup forms are hidden.

Titles are trimmed and must not be blank. The form prevents duplicate submissions,
shows a recoverable error if saving fails, and opens the new project immediately
after creation. Existing series show their last-modified time and are listed with
the most recently updated first. Each project page links back to the launcher.

### Project files

```json
{
  "schemaVersion": 4,
  "id": "3bb48a8e-8914-42af-a978-ff3344c44991",
  "series": {
    "title": "The Example Series",
    "idea": "",
    "premise": "",
    "summary": {
      "setup": "",
      "disaster1": "",
      "disaster2": "",
      "disaster3": "",
      "resolution": ""
    },
    "mainStory": { "sections": {} },
    "storyFlows": {
      "primaryFlowId": "main",
      "flows": { "main": { "id": "main", "title": "Main Story", "placements": [] } },
      "links": {}
    }
  },
  "characters": {},
  "places": {},
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
| `PATCH /api/projects/{projectId}/main-story` | Save the vertical Main Story workflow order |
| `PATCH /api/projects/{projectId}/main-story/{sectionId}` | Save one section's custom title and expanded detail text |
| `POST /api/projects/{projectId}/main-story/{sectionId}/expand-suggestions` | Generate ordered OpenAI story-beat headings without modifying S3 |
| `POST /api/projects/{projectId}/main-story/{sectionId}/expand` | Replace an active parent with selected child headings in one project save |
| `POST /api/projects/{projectId}/main-story/{sectionId}/associations` | Associate an existing character or place with a section |
| `POST /api/projects/{projectId}/story-flows` | Create an empty named story flow |
| `POST /api/projects/{projectId}/story-flows/move` | Atomically move a stable section UUID into an existing or new flow |
| `POST /api/projects/{projectId}/story-links` | Create a section-to-section or section-to-flow link |
| `DELETE /api/projects/{projectId}/story-links/{linkId}` | Remove a link without deleting its sections or flow |

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

The workspace retains the one-sentence premise and five-sentence summary as source
data while focusing its visible editing experience on the Main Story workflow.

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

## Main Story visual workflow

Schema v4 stores section objects once in `mainStory.sections` and keeps sparse grid positions in
`storyFlows.flows[*].placements` as `{ sectionId, row }`. Existing ordered flows normalize into
rows 1, 3, 5, and so on without changing section UUIDs or content. No competing order is
stored in `mainStory`. New and missing workflows remain empty; no fallback sections are generated. Each section
stores its own title, detail, optional parent/child lineage, and character/place
association IDs. Legacy sections missing association arrays receive empty arrays
in memory without being rewritten merely by loading. Headings expand and collapse client-side.

Flows render as columns on one horizontally and vertically scrollable story grid, with the
primary Main Story column visually identified. Sections can be moved to an exact flow and
positive row with pointer or keyboard drag-and-drop, the accessible move form, or explicit
one-row controls. Empty rows and flows remain valid and visible.
Moves preserve the section object and save the complete project once.

The **Link** action enters target-selection mode for another section or a flow
header. Links reference stable IDs, remain valid when sections move, and render as
secondary SVG arrows that do not intercept pointer interaction. Exact duplicates
are ignored. The Story links list removes links independently of sections and flows.

The workflow has its own scrollable viewport and a single CSS-zoomed canvas containing
all lanes, cards, avatars, vertical arrows, and cross-flow SVG connectors. Controls
support 25–150% zoom, 10% steps, width-based **Fit**, and a **100%** reset. While the
viewport is focused, Ctrl/Cmd with `+`, `-`, or `0` controls workflow zoom; Ctrl/Cmd
plus wheel zooms only while the pointer is over the viewport. Ordinary scrolling and
typing shortcuts are left untouched. Zoom is client-only state and never enters the
project document or S3 writes. Section drag transforms are divided by the zoom factor
before dnd-kit applies them inside the scaled canvas; Story Context entity drags remain
unmodified because their source is outside that canvas.
Each section has a visible and editable title. Expanded nodes contain that title
input and an independent plain-text detail editor with live word count, save status,
and **Ctrl+S / Cmd+S** support. One save updates
the section title and detail atomically. The original five titles are also kept in
sync with `series.summary` for backward compatibility.

Schema-version-1 projects are normalized to version 2 in memory: existing summary
titles become section titles, and all existing details and ordering are retained.
Loading alone does not rewrite S3; the normalized schema is persisted with the
next successful project update.

## AI section rewrites

Expanded Main Story nodes can send their current unsaved detail draft to Gemini
with **Rewrite with AI**. The server loads the project from S3 and supplies only
the immediately preceding and following populated sections according to the visual
workflow order. Rewrite rules are sent as a system instruction; titles, drafts,
adjacent context, and rejected suggestions are separately delimited as author data.

Gemini returns structured JSON containing the rewritten detail and up to two
optional concise title suggestions. **Accept rewrite** immediately updates the
visible detail and autosaves only that detail field. A successful rewrite save closes
the preview; accepting only a title leaves it open. Autosave failures retain
the accepted content and provide a retry without calling Gemini again.

**Try another** reuses the original draft, identifies the rejected rewrite, and
replaces both the preview and title suggestions. **Cancel** leaves unaccepted draft
content unchanged. Missing details are marked by a derived red, accessible
exclamation indicator and no incomplete flag is persisted.

Rewrite responses stream newline-delimited JSON progress events so the editor can
show context loading, prompt creation, Gemini submission/waiting, response receipt,
and completion or failure without guessed timers. Gemini requests use an explicit
60-second SDK HTTP timeout. Common authentication, permission, model, quota,
timeout, and service errors are mapped to safe user-facing messages.

Each request also writes structured server logs containing a generated request ID,
project and section IDs, model, prompt/response lengths, duration, and available
HTTP status. Logs never include the prompt, novel text, API key, or AWS credentials.

## OpenAI story expansion

**Expand with AI** sends the current, potentially unsaved section title and detail
to the server-only OpenAI Responses API. Requests use `store: false` and strict
Structured Outputs to return between two and ten chronological story-beat headings.
Generating or regenerating suggestions never changes S3.

Authors may select individual headings, select all, cancel, regenerate, or replace
the active section with at least two selected beats. Replacement creates new UUID
sections in AI order with empty details and `parentId`, records their IDs on the
retained original parent, swaps the parent out at the same active-order position,
and saves the complete project once. Any generated child can be expanded again.
If the S3 save fails, the visible workflow and selection remain available for retry.

The request includes a compact catalogue of the project's existing characters and
places: permanent ID, name, and description only. The structured result identifies
each extracted entity with a temporary reference and either a validated existing
project ID or `null`. Server-side reconciliation rejects invented or wrong-type IDs
and reuses exact trimmed, case-insensitive name matches as a fallback.

Per-heading references to existing entities are immediately eligible for mapping to
their permanent UUIDs. References to genuinely new suggestions are mapped only after
the author adds them. Selected child sections persist only resolved `characterIds`
and `placeIds`; unresolved temporary references never enter project storage. Existing
results show an **Already in project** label and a **View** action instead of an Add
button.

The project workspace uses a workflow pane plus a sticky, independently scrolling
Story Context pane containing only persisted characters and places. They can be selected without changing the
expanded workflow section. On narrow screens the panes stack vertically. Accepting
a suggestion creates a UUID-backed project-level entity and performs one complete
project save. Names are matched case-insensitively after trimming; an existing match
is selected instead of creating a duplicate. Failed saves keep the AI suggestion
available for retry.

Persisted Story Context characters and places can also be dragged onto any collapsed
or expanded active workflow card. Typed drag data keeps entity association separate
from section sorting; a successful drop saves the complete project once and displays
the existing compact association chip. Duplicate drops do not write to storage.
Expanded cards provide keyboard-accessible **Add character** and **Add place**
selectors that use the same association endpoint. Failed saves leave the visible
workflow unchanged so the operation can be retried.

Story Context entities support an optional nullable `imageUrl`. The shared circular
avatar uses that image when available and falls back to deterministic initials if it
is absent or cannot load. Medium avatars appear beside names in Story Context, while
small interactive avatars appear in workflow headers with characters before places.
Each type shows at most five avatars followed by an accessible `+N` overflow marker;
the underlying section associations remain unchanged.
