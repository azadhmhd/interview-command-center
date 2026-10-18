# Backup and recovery

PostgreSQL holds every business record (including task state). Uploaded files live in `UPLOAD_DIR`
(`/data/uploads` in Docker, volume `appdata`). Redis holds only transient job messages: it does not need backups.

## What to back up

| Item | Where | How often |
|---|---|---|
| Database | `pgdata` volume / your Postgres | daily (and before upgrades) |
| Uploaded CVs & attachments | `appdata` volume → `/data/uploads` (or `./data/uploads` locally) | daily |
| `APP_ENCRYPTION_KEY` and `.env` | your password manager | on change |
| Agent workspace task folders | `agent-workspace/tasks` | optional (re-exportable from the app) |

## Backup

```bash
# Database (custom format, compressed)
docker exec icc-postgres-1 pg_dump -U icc -Fc icc > backups/icc-$(date +%F).dump
# Files
docker run --rm -v icc_appdata:/data -v "$PWD/backups":/b alpine tar czf /b/icc-files-$(date +%F).tgz -C /data uploads
```

Cron example (host): `0 3 * * * cd /srv/icc && ./scripts/backup.sh` — keep 14 daily copies off-host.

## Restore

```bash
docker compose stop api worker web
docker exec -i icc-postgres-1 psql -U icc -d postgres -c "CREATE DATABASE icc_restored"
docker exec -i icc-postgres-1 pg_restore -U icc -d icc_restored --no-owner < backups/icc-YYYY-MM-DD.dump
# point DATABASE_URL at icc_restored (or rename databases), then:
docker run --rm -v icc_appdata:/data -v "$PWD/backups":/b alpine tar xzf /b/icc-files-YYYY-MM-DD.tgz -C /data
docker compose up -d
```

After a restore the worker's first tick re-routes any `scheduled`/`retry_wait` tasks and recovers tasks that were
`running` (expired leases) — no manual queue repair is needed. Redis can start empty.

## Verification status

See [PROGRESS.md](PROGRESS.md) for the latest executed backup/restore check.
