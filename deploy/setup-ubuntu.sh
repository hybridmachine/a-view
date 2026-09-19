#!/usr/bin/env bash
set -euo pipefail
umask 022

die() { printf '%s\n' "$*" >&2; exit 1; }
[[ $EUID == 0 ]] || die 'Run this script with sudo.'
[[ $# -le 2 ]] || die 'Usage: setup-ubuntu.sh [domain] [Node 24 version or latest]'
domain=${1:-theplaces.online}
node_version=${2:-latest}
[[ $domain =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || die 'Expected a lowercase DNS hostname.'
[[ $node_version == latest || $node_version =~ ^24\.[0-9]+\.[0-9]+$ ]] || die 'Use a Node 24 release, for example 24.21.0, or latest.'
# shellcheck source=/dev/null
source /etc/os-release
[[ $ID == ubuntu ]] || die 'This installer requires Ubuntu.'
case "$VERSION_ID" in
    22.04|24.04|26.04) ;;
    *) die 'Use Ubuntu 22.04, 24.04, or 26.04 LTS.' ;;
esac
case "$(dpkg --print-architecture)" in
    amd64) node_arch=x64 ;;
    arm64) node_arch=arm64 ;;
    *) die 'Supported CPU architectures: amd64 and arm64.' ;;
esac
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

# Refuse to replace an unrelated site or web server on an existing host.
if [[ -f /etc/caddy/Caddyfile ]] && ! grep -q '^# Managed by a-view deployment scripts\.$' /etc/caddy/Caddyfile; then
    # A pristine package default is safe to replace, including after a partial setup.
    package_hash=$(dpkg-query -W -f='${Conffiles}\n' caddy 2>/dev/null | awk '$1 == "/etc/caddy/Caddyfile" { print $2 }' || true)
    current_hash=$(md5sum /etc/caddy/Caddyfile | cut -d ' ' -f 1)
    [[ -n $package_hash && $package_hash == "$current_hash" ]] || \
        die 'An unmanaged /etc/caddy/Caddyfile already exists. Merge the deploy/Caddyfile site block into your existing setup manually.'
fi
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg debian-keyring debian-archive-keyring apt-transport-https xz-utils sqlite3 util-linux iproute2 ufw

# Minimal Ubuntu images may lack ss; iproute2 above provides it. Check for
# conflicting listeners before installing Caddy, whose package starts its service.
listeners=$(ss -H -ltnp '( sport = :80 or sport = :443 )')
if [[ -n $listeners ]] && printf '%s\n' "$listeners" | grep -v '"caddy"' >/dev/null; then
    die 'Another service owns port 80 or 443. Resolve that conflict before setup.'
fi

work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    https://dl.cloudsmith.io/public/caddy/stable/gpg.key -o "$work/caddy.asc"
gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg "$work/caddy.asc"
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list
chmod 0644 /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

# Use the official Node distribution, independent of Ubuntu's older Node package.
# Resolve latest once from its checksum manifest so downloads cannot race a release.
node_base=https://nodejs.org/dist
if [[ $node_version == latest ]]; then
    curl -fsSL --proto '=https' --tlsv1.2 "$node_base/latest-v24.x/SHASUMS256.txt" -o "$work/SHASUMS256.txt"
    node_version=$(sed -n "s/.*  node-v\(24\.[0-9]*\.[0-9]*\)-linux-$node_arch.tar.xz$/\1/p" "$work/SHASUMS256.txt")
    [[ $node_version =~ ^24\.[0-9]+\.[0-9]+$ ]] || die 'Could not resolve the latest Node 24 release.'
else
    curl -fsSL --proto '=https' --tlsv1.2 "$node_base/v$node_version/SHASUMS256.txt" -o "$work/SHASUMS256.txt"
fi
node_archive="node-v$node_version-linux-$node_arch.tar.xz"
curl -fsSL --proto '=https' --tlsv1.2 "$node_base/v$node_version/$node_archive" -o "$work/$node_archive"
(cd "$work"; grep "  $node_archive\$" SHASUMS256.txt | sha256sum --check --strict -)
install -d -m 0755 /opt/a-view/releases /opt/a-view/runtimes
if [[ ! -d /opt/a-view/runtimes/node-v$node_version-linux-$node_arch ]]; then
    tar -xJf "$work/$node_archive" -C /opt/a-view/runtimes --no-same-owner
fi
ln -sfn "/opt/a-view/runtimes/node-v$node_version-linux-$node_arch" /opt/a-view/node
/opt/a-view/node/bin/node --input-type=module -e "import { DatabaseSync } from 'node:sqlite'; new DatabaseSync(':memory:').close();"

if ! id a-view >/dev/null 2>&1; then
    useradd --system --user-group --home-dir /var/lib/a-view --no-create-home --shell /usr/sbin/nologin a-view
fi
install -d -o a-view -g a-view -m 0750 /var/lib/a-view
install -d -o root -g root -m 0700 /var/backups/a-view
install -m 0755 "$source_dir/a-view-release.sh" /usr/local/sbin/a-view-release
install -m 0644 "$source_dir/a-view.service" /etc/systemd/system/a-view.service
install -m 0644 "$source_dir/a-view-backup.service" /etc/systemd/system/a-view-backup.service
install -m 0644 "$source_dir/a-view-backup.timer" /etc/systemd/system/a-view-backup.timer

sed "s/@DOMAIN@/$domain/g" "$source_dir/Caddyfile" > "$work/Caddyfile"
caddy validate --config "$work/Caddyfile" --adapter caddyfile
if [[ -f /etc/caddy/Caddyfile ]]; then
    cp -p /etc/caddy/Caddyfile "$work/Caddyfile.old"
fi
install -m 0644 "$work/Caddyfile" /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable a-view.service caddy.service
systemctl enable --now a-view-backup.timer
if ! systemctl reload-or-restart caddy; then
    if [[ -f $work/Caddyfile.old ]]; then
        install -m 0644 "$work/Caddyfile.old" /etc/caddy/Caddyfile
        systemctl reload-or-restart caddy || true
    fi
    die 'Caddy could not load the new configuration; inspect journalctl -u caddy.'
fi

# Open web traffic if UFW is active, but never enable it or change SSH rules here.
ufw allow 80/tcp
ufw allow 443/tcp
printf '\nConfigured %s with Node %s. Deploy the app next.\n' "$domain" "$node_version"
printf 'Ensure provider firewall and DNS allow public TCP 80/443. UFW status:\n'
ufw status
