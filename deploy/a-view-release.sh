#!/usr/bin/env bash
set -euo pipefail
umask 027

APP_ROOT=/opt/a-view
DATA_DIR=/var/lib/a-view
BACKUP_DIR=/var/backups/a-view
LOCK_FILE=/run/lock/a-view-deploy.lock
SWITCHING=0
PREVIOUS=
BACKUP_WORK=
BACKUP_PENDING=

die() { printf '%s\n' "$*" >&2; exit 1; }
set_link() {
    local name=$1 target=$2
    ln -s "$target" "$APP_ROOT/.$name-$$"
    mv -Tf "$APP_ROOT/.$name-$$" "$APP_ROOT/$name"
}
health() {
    local attempt
    for ((attempt = 0; attempt < 20; attempt++)); do
        if systemctl is-active --quiet a-view && \
            curl --fail --silent --max-time 2 http://127.0.0.1:4173/api/world | \
                "$APP_ROOT/node/bin/node" --input-type=module -e '
                    let input = "";
                    for await (const chunk of process.stdin) input += chunk;
                    const data = JSON.parse(input);
                    if (data.world?.id !== "stillwater" || !Number.isFinite(data.serverTime)) process.exit(1);
                ' 2>/dev/null && \
            curl --fail --silent --max-time 2 http://127.0.0.1:4173/ >/dev/null; then
            return 0
        fi
        sleep 1
    done
    return 1
}
backup() {
    [[ -f $DATA_DIR/world.sqlite ]] || { printf 'No world database yet; no backup needed.\n'; return; }
    local destination
    destination="$BACKUP_DIR/world-$(date -u +%Y%m%dT%H%M%SZ)-$$.sqlite"
    BACKUP_WORK=$(mktemp -d "$DATA_DIR/.backup.XXXXXXXXXX")
    chown a-view:a-view "$BACKUP_WORK"
    local temporary="$BACKUP_WORK/world.sqlite"
    # SQLite's online backup API includes committed WAL content safely.
    # Open the live DB as its owner so any WAL sidecars retain the right ownership.
    runuser -u a-view -- sqlite3 -readonly -cmd '.timeout 10000' "$DATA_DIR/world.sqlite" ".backup '$temporary'"
    # Validate a root-owned copy in the private backup directory, never a file
    # that the application account can replace while root is opening it.
    BACKUP_PENDING="$destination.partial"
    install -o root -g root -m 0600 "$temporary" "$BACKUP_PENDING"
    rm -rf -- "$BACKUP_WORK"
    BACKUP_WORK=
    temporary=$BACKUP_PENDING
    # Make each backup a standalone file with no WAL/SHM dependencies.
    [[ $(sqlite3 "$temporary" 'PRAGMA journal_mode=DELETE; PRAGMA quick_check;') == $'delete\nok' ]] || die "Backup integrity check failed: $temporary"
    mv "$temporary" "$destination"
    # Some SQLite builds retain an unused SHM file even after switching to DELETE.
    rm -f "$temporary-wal" "$temporary-shm"
    BACKUP_PENDING=
    printf 'Backup: %s\n' "$destination"
    find "$BACKUP_DIR" -maxdepth 1 -type f -name 'world-*.sqlite' -mtime +14 -delete
}
recover() {
    local status=$?
    trap - EXIT INT TERM
    if [[ -n $BACKUP_WORK ]]; then rm -rf -- "$BACKUP_WORK"; fi
    if [[ -n $BACKUP_PENDING ]]; then rm -f "$BACKUP_PENDING" "$BACKUP_PENDING-wal" "$BACKUP_PENDING-shm"; fi
    if [[ $SWITCHING == 1 ]]; then
        printf 'Activation failed; restoring the previous application release.\n' >&2
        if [[ -n $PREVIOUS ]]; then
            systemctl reset-failed a-view || true
            if set_link current "$PREVIOUS" && systemctl restart a-view && health; then
                printf 'Previous release restored and healthy.\n' >&2
            else
                printf 'Recovery failed. Inspect sudo journalctl -u a-view.\n' >&2
            fi
        else
            systemctl stop a-view || true
            rm -f "$APP_ROOT/current"
        fi
        status=1
    fi
    exit "$status"
}
activate() {
    local release=$1
    PREVIOUS=$(readlink -f "$APP_ROOT/current" || true)
    [[ -d $PREVIOUS ]] || PREVIOUS=
    backup
    SWITCHING=1
    set_link current "$release"
    systemctl reset-failed a-view || true
    systemctl restart a-view
    health || die 'Application health check failed.'
    if [[ -n $PREVIOUS ]]; then set_link previous "$PREVIOUS"; fi
    SWITCHING=0
    printf 'Active release: %s\n' "$release"
}
deploy() {
    local archive=${1:?Expected a release archive} release_id=${2:?Expected a release ID}
    [[ $release_id =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]+$ ]] || die 'Invalid release ID.'
    local release="$APP_ROOT/releases/$release_id"
    [[ ! -e $release ]] || die "Release already exists: $release"
    [[ -f $archive ]] || die "Archive not found: $archive"
    mkdir -m 0755 "$release"
    # Archives are produced by scripts/deploy.sh from the operator's trusted checkout.
    tar -xzf "$archive" -C "$release" --no-same-owner --no-same-permissions
    [[ -f $release/src/server.js && -f $release/public/index.html && -f $release/package.json ]] || die 'Incomplete release archive.'
    chown -R root:root "$release"
    chmod -R u=rwX,go=rX "$release"
    "$APP_ROOT/node/bin/node" --check "$release/src/server.js"
    activate "$release"
}
main() {
    [[ $EUID == 0 ]] || die 'Run this command with sudo.'
    [[ -x $APP_ROOT/node/bin/node ]] || die 'Run setup-ubuntu.sh first.'
    local command=${1:-status}
    shift || true
    exec 9>"$LOCK_FILE"
    flock -w 60 9 || die 'Another deployment or backup is running.'
    trap recover EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    case "$command" in
        deploy) [[ $# == 2 ]] || die 'Usage: a-view-release deploy ARCHIVE RELEASE_ID'; deploy "$@" ;;
        rollback)
            [[ $# == 0 ]] || die 'Usage: a-view-release rollback'
            local previous
            previous=$(readlink -f "$APP_ROOT/previous" || true)
            [[ -n $previous && -f $previous/src/server.js ]] || die 'No previous release is available.'
            activate "$previous"
            ;;
        backup) [[ $# == 0 ]] || die 'Usage: a-view-release backup'; backup ;;
        status)
            readlink -f "$APP_ROOT/current" || true
            systemctl --no-pager --full status a-view caddy a-view-backup.timer
            health
            ;;
        *) die 'Usage: a-view-release {deploy ARCHIVE RELEASE_ID|rollback|backup|status}' ;;
    esac
}

# The guard also allows the release lifecycle to be exercised in a temporary test directory.
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then main "$@"; fi
