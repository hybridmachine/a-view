# Deploy A View to theplaces.online

Use one Ubuntu host running **Node.js 24 LTS + Caddy + systemd**. Keep the existing SQLite world on persistent disk. This application needs no build step, npm runtime packages, database server, Docker, or PM2.

```text
Visitors → TCP 80  → Caddy → redirect to HTTPS
         → TCP 443 → Caddy (TLS) → 127.0.0.1:4173 → Node.js
                                                    ↓
                                       /var/lib/a-view/world.sqlite
```

Caddy obtains and renews public certificates automatically. It supports the application's server-sent event stream without buffering. Node stays on loopback; only Caddy is exposed to visitors. The site remains branded “A View”; the public address is `theplaces.online`.

## Host and DNS prerequisites

- Ubuntu **24.04 or 26.04 LTS** recommended; the installer also accepts 22.04. Supported architectures: amd64 and arm64. Start with 1–2 GB RAM and enough persistent disk for the OS, artwork, retained releases, and backups; measure usage as traffic grows.
- SSH access for an administrative account with sudo. Password-protected sudo works from an interactive terminal; the scripts request a remote TTY. Use your existing SSH config alias for custom keys or SSH ports.
- An `A` record for `theplaces.online` pointing at the host's public IPv4 address. Add `AAAA` only when IPv6 is configured and reaches this same host. Remove stale records before certificate issuance.
- Allow inbound **TCP 80 and TCP 443** in the hosting provider's firewall/security group and any NAT. Preserve access to your actual SSH port. Outbound DNS and HTTPS must work for packages and certificates.
- This setup owns `/etc/caddy/Caddyfile` on a dedicated web host. It refuses to overwrite an unrelated Caddy configuration or take ports from another web server. If the host already serves other sites, merge the supplied site block into its existing proxy configuration instead.

Only the apex domain is configured. To add `www.theplaces.online`, first create its DNS record, then add a Caddy site block that redirects it to `https://theplaces.online{uri}`.

## First deployment

Run these commands **from this checkout on your computer**. Replace `YOUR_SSH_TARGET` with the target you already use, such as `ubuntu@theplaces.online` or an SSH config alias. Local requirements: Bash, Git, tar, OpenSSH (`ssh`/`scp`), Node.js 24+, and npm. Local `sqlite3` enables the backup integration test; CI always installs it.

```sh
ssh YOUR_SSH_TARGET 'cat /etc/os-release; uname -m'
bash scripts/deploy.sh setup YOUR_SSH_TARGET
bash scripts/deploy.sh deploy YOUR_SSH_TARGET
bash scripts/deploy.sh status YOUR_SSH_TARGET
```

`setup` installs Caddy from its official signed APT repository; downloads the latest Node 24 binary from nodejs.org and checks its SHA-256 against the official HTTPS manifest; creates the `a-view` service account, directories, services, and daily backup timer; and adds UFW allow rules for TCP 80/443. The checksum detects a mismatched download; it is not separate signature verification. The resolved Node version is printed. For a reproducible runtime, select an exact patch version:

```sh
NODE_VERSION=24.21.0 bash scripts/deploy.sh setup YOUR_SSH_TARGET
```

Setup does **not** enable UFW or edit SSH rules. If UFW is already active, the added web rules apply immediately. If you want to enable UFW, first allow your real SSH port, confirm provider console access, then enable it and verify a second SSH connection. Provider firewall rules must be configured separately.

Setup starts Caddy before the first app deployment; a temporary 502 is expected until the app starts. DNS must be correct and both public ports reachable for certificate issuance. No Certbot installation or certificate renewal cron job is needed.

`deploy` checks and tests the current checkout, uploads only `package.json`, `src/`, `shared/`, and `public/`, then creates a new release. It deploys your current files, including uncommitted edits; review `git status` before running. It does not upload `.env`, `.git`, `data/`, or `node_modules/`. It uses a timestamp, Git revision, and random suffix to identify the release.

The host takes a consistent world backup, switches the active release symlink atomically, restarts the single application service, and checks both `/` and a valid `/api/world` response. Failure restores the previous app release and reports whether recovery succeeded. A failed first deployment stops the service. Expect a short interruption during restarts; open browsers reconnect their event stream. This is not a zero-downtime, multi-process deployment.

## Choose the initial world

The default first deployment creates a **new shared world**. Later deployments and service restarts preserve that world. If you want to continue the development world, import a consistent snapshot **after setup and before the first deploy**:

```sh
# On your computer; use SQLite's backup command even if the local app is running.
sqlite3 data/world.sqlite ".backup '/tmp/a-view-initial.sqlite'"
scp /tmp/a-view-initial.sqlite YOUR_SSH_TARGET:a-view-initial.sqlite
ssh -t YOUR_SSH_TARGET
```

Then on the server:

```sh
sudo bash -c 'set -e; test ! -e /var/lib/a-view/world.sqlite; install -o a-view -g a-view -m 0640 "$1" /var/lib/a-view/world.sqlite' _ ~/a-view-initial.sqlite
rm ~/a-view-initial.sqlite
exit
```

Now run `deploy`. Never copy only the main SQLite file from a running world: committed data may still be in its WAL file. The app catches up from its stored epoch after downtime.

## Verify public access

```sh
curl -I http://theplaces.online
curl -I https://theplaces.online
curl --fail --silent --show-error https://theplaces.online/api/world
curl --no-buffer --max-time 6 https://theplaces.online/api/stream
```

Expect an HTTP 308 redirect to HTTPS, a valid trusted certificate and HTTP 200 over HTTPS, a JSON snapshot, and repeated `data:` stream messages about every two seconds. The final stream command deliberately ends with curl's timeout exit code 28 after six seconds. Also open the site on a phone or a separate network to verify the artwork, live updates, and controls. `/dev/` previews return 404 through the production proxy.

The default policy redirects HTTP to HTTPS. If you intentionally want the complete site served separately over both protocols, add `http://theplaces.online` to the Caddy site address list:

```caddyfile
http://theplaces.online, https://theplaces.online {
    # Keep the same encode, development-path matcher, and reverse_proxy directives.
}
```

Validate and reload any manual Caddy edits:

```sh
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

Rerunning setup regenerates the repository's Caddy configuration, so keep deliberate changes in `deploy/Caddyfile` too.

## Updates, rollback, and logs

```sh
bash scripts/deploy.sh deploy YOUR_SSH_TARGET
bash scripts/deploy.sh rollback YOUR_SSH_TARGET
bash scripts/deploy.sh backup YOUR_SSH_TARGET
bash scripts/deploy.sh status YOUR_SSH_TARGET
```

Rollback swaps the current and previous **application releases**. It does not rewind the world or the Node runtime. Future database schema changes need a compatible migration and rollback plan; the current app has no deployment migrations. Releases are retained for inspection. Monitor disk usage and manually remove old release directories only after checking that neither `current` nor `previous` points to them.

On the host:

```sh
sudo journalctl -u a-view -n 100 --no-pager
sudo journalctl -u caddy -n 100 --no-pager
sudo journalctl -u a-view-backup -n 50 --no-pager
sudo systemctl list-timers a-view-backup.timer
sudo ss -ltnp
sudo ufw status verbose
```

Node listens only on `127.0.0.1:4173`. Do not add a firewall rule for 4173. Caddy's admin API also stays on loopback. App and proxy diagnostic logs go to journald; per-request access logging is not enabled by this configuration.

To update Node, rerun setup with `NODE_VERSION=latest` (latest 24.x), then deploy to restart the service on that runtime. Setup alone does not restart an already-running app. Caddy and SQLite receive updates through APT; Node's official binary is maintained explicitly through setup. Schedule Ubuntu security updates and required host reboots. Services and the backup timer are enabled at boot.

## Backups and recovery

Backups run daily between 02:30 and 03:00 in the **host's timezone**, and before each activation or rollback. SQLite's online backup API includes committed WAL data while the app runs. Each result is checked and converted to a standalone file, owned by root with mode 0600. Successful backup runs prune matching backups older than 14 days. Deployment and backup operations share a lock.

Paths on the server:

| Path | Purpose |
| --- | --- |
| `/opt/a-view/releases/` | Root-owned application releases |
| `/opt/a-view/current` | Active release symlink |
| `/opt/a-view/previous` | Previous release symlink |
| `/opt/a-view/node` | Selected Node runtime symlink |
| `/var/lib/a-view/world.sqlite` | Live persistent world (plus SQLite sidecars) |
| `/var/backups/a-view/world-*.sqlite` | Standalone world backups |
| `/var/lib/caddy/` | Caddy certificate state managed by its package |
| `/etc/caddy/Caddyfile` | Public proxy configuration |

Copy backups to another machine or storage service. Local backups alone do not survive loss of the host. To download a selected backup without making the server's backup directory public, run on your computer:

```sh
ssh -t YOUR_SSH_TARGET 'sudo ls -lt /var/backups/a-view'
# Replace the filename below with the selected backup, then run on the host:
# sudo install -o "$(id -un)" -g "$(id -gn)" -m 0600 /var/backups/a-view/world-TIMESTAMP-PID.sqlite ~/world-backup.sqlite
scp YOUR_SSH_TARGET:world-backup.sqlite ./world-backup.sqlite
ssh YOUR_SSH_TARGET 'rm ~/world-backup.sqlite'
```

Restoring a backup intentionally replaces the current world's history. To recover on the host, select and validate the backup, stop the app, preserve all current database files together, then install the backup:

```sh
# Set this to an actual backup file before continuing.
backup_file=/var/backups/a-view/world-TIMESTAMP-PID.sqlite
sudo bash -s -- "$backup_file" <<'RESTORE'
set -euo pipefail
exec 9>/run/lock/a-view-deploy.lock
flock -w 60 9
backup_file=$1
test -f "$backup_file"
test "$(sqlite3 -readonly "$backup_file" 'PRAGMA quick_check;')" = ok
test "$(sqlite3 -readonly "$backup_file" 'SELECT id FROM world;')" = stillwater
systemctl stop a-view
recovery_dir="/var/backups/a-view/pre-restore-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 0700 "$recovery_dir"
for f in /var/lib/a-view/world.sqlite /var/lib/a-view/world.sqlite-wal /var/lib/a-view/world.sqlite-shm; do
    if [ -e "$f" ]; then mv "$f" "$recovery_dir/"; fi
done
install -o a-view -g a-view -m 0640 "$backup_file" /var/lib/a-view/world.sqlite
systemctl start a-view
RESTORE
sudo /usr/local/sbin/a-view-release status
```

Recovery holds the same lock as deployment and backup. If a step fails after the service stops, inspect the preserved files before restarting it. The saved epoch means restarting from a backup catches the simulation up to the current time.

## References

- [Node.js release support schedule](https://github.com/nodejs/Release#release-schedule)
- [Official Node.js distributions and checksums](https://nodejs.org/dist/latest-v24.x/)
- [Caddy installation on Ubuntu](https://caddyserver.com/docs/install#debian-ubuntu-raspbian)
- [Caddy automatic HTTPS and network requirements](https://caddyserver.com/docs/automatic-https)
- [Caddy streaming behavior](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#streaming)
- [SQLite online backup API](https://sqlite.org/backup.html)
- [Ubuntu firewall configuration](https://ubuntu.com/server/docs/how-to/security/firewalls/)
