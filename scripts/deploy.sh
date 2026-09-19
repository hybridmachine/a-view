#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat <<'USAGE'
Usage: scripts/deploy.sh COMMAND SSH_TARGET

Commands:
  setup     Install Node 24, Caddy, systemd services and web firewall rules.
  deploy    Check and upload this checkout, back up the world, activate a release.
  rollback  Activate the previous release (keeps the current world database).
  backup    Make a consistent SQLite backup on the server.
  status    Show services and check the application.

Use an SSH config alias for a custom port or identity. Sudo may prompt on the host.
Setup options: DOMAIN=theplaces.online NODE_VERSION=latest (or an exact 24.x.y).
USAGE
}
die() { printf '%s\n' "$*" >&2; exit 1; }
if [[ ${1:-} == --help || ${1:-} == -h ]]; then usage; exit 0; fi
[[ $# == 2 ]] || { usage >&2; exit 1; }
command=$1
target=$2
case "$command" in setup|deploy|rollback|backup|status) ;; *) usage >&2; exit 1 ;; esac
# These strings cross the SSH command boundary; restrict them before interpolation.
[[ $target =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.@-]*$ ]] || die 'Use user@hostname or an SSH config alias.'
domain=${DOMAIN:-theplaces.online}
node_version=${NODE_VERSION:-latest}
[[ $domain =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || die 'Invalid DOMAIN.'
[[ $node_version == latest || $node_version =~ ^24\.[0-9]+\.[0-9]+$ ]] || die 'NODE_VERSION must be latest or 24.x.y.'
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
local_work=
remote_work=
cleanup() {
    local status=$?
    trap - EXIT
    if [[ -n $remote_work ]]; then ssh -o BatchMode=yes "$target" "rm -rf -- '$remote_work'" || true; fi
    if [[ -n $local_work ]]; then rm -rf -- "$local_work"; fi
    exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

case "$command" in
    setup|deploy)
        local_work=$(mktemp -d)
        if [[ $command == deploy ]]; then
            cd "$root"
            npm run check
            npm test
            # Deliberately exclude data/, .env, .git, and development dependencies.
            # Runtime symlinks could accidentally bundle outside files; reject them.
            [[ -z $(find src shared public -type l -print) ]] || die 'Runtime directories must not contain symbolic links.'
            COPYFILE_DISABLE=1 tar -czf "$local_work/release.tar.gz" package.json src shared public
        else
            COPYFILE_DISABLE=1 tar -czf "$local_work/release.tar.gz" -C "$root" deploy
        fi
        remote_work=$(ssh "$target" 'mktemp -d /tmp/a-view-upload.XXXXXXXXXX')
        [[ $remote_work =~ ^/tmp/a-view-upload\.[a-zA-Z0-9]+$ ]] || { remote_work=; die 'Unexpected remote staging path.'; }
        scp "$local_work/release.tar.gz" "$target:$remote_work/release.tar.gz"
        if [[ $command == setup ]]; then
            # Expansion is intentional; the remote path was strictly validated above.
            # shellcheck disable=SC2029
            ssh "$target" "tar -xzf '$remote_work/release.tar.gz' -C '$remote_work'"
            ssh -t "$target" "sudo bash '$remote_work/deploy/setup-ubuntu.sh' '$domain' '$node_version'"
        else
            revision=$(git -C "$root" rev-parse --short HEAD)
            release_id="$(date -u +%Y%m%dT%H%M%SZ)-$revision-$RANDOM"
            ssh -t "$target" "sudo /usr/local/sbin/a-view-release deploy '$remote_work/release.tar.gz' '$release_id'"
            printf '\nApplication is healthy on the host. Verify public DNS/TLS with:\n'
            printf '  curl -I http://%s\n  curl -I https://%s\n' "$domain" "$domain"
        fi
        ;;
    rollback|backup|status)
        ssh -t "$target" "sudo /usr/local/sbin/a-view-release $command"
        ;;
esac
