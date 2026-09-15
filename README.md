# Dumas

Visual story development. This repository contains the application foundation only:
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
Named Docker volumes keep container `node_modules` and `.next` separate from the
host. The development image installs dependencies directly into the volume on
startup, avoiding a second copy in the image. It runs `npm ci` so the volume matches the lockfile;
restart the service after changing dependencies.

`./data` is mounted at `/app/data` for future project JSON files and backups.
Its contents are ignored by Git, except `.gitkeep`. Persistence is not implemented.

The service uses `restart: unless-stopped`. After starting it in the background,
it restarts with Docker unless explicitly stopped. Docker must itself be enabled
at boot for automatic startup.

### Checks inside Docker

```bash
docker compose exec dumas npm run lint
docker compose exec dumas npm run typecheck
```

Dependency versions are recorded in `package-lock.json` for reproducible installs.
