#!/usr/bin/env bash
# Run on a dedicated Ubuntu 24.04 x86_64 server, from the unpacked release.
set -euo pipefail
if [[ $EUID -ne 0 ]]; then echo 'Run with sudo.' >&2; exit 1; fi
source /etc/os-release
if [[ ${ID:-} != ubuntu || ${VERSION_ID:-} != 24.04 || $(uname -m) != x86_64 ]]; then
    echo 'This installer targets Ubuntu 24.04 x86_64.' >&2; exit 1
fi
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
[[ -f "$source_dir/app/server.mjs" && -f "$source_dir/RELEASE.json" && -f "$source_dir/SHA256SUMS" ]] || { echo 'Use the packaged release.' >&2; exit 1; }
(cd "$source_dir" && sha256sum --check --quiet SHA256SUMS)
base=/opt/tarkov-radar
install -d -m 0755 "$base/releases"
exec 9>"$base/install.lock"
flock -n 9 || { echo 'Another installation is running.' >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl xz-utils nginx

# Fetch one current Node 24 LTS archive from the official source and verify it.
if [[ ! -x "$base/node/bin/node" ]]; then
    scratch=$(mktemp -d "$base/node-download.XXXXXX")
    curl --fail --location --retry 3 --connect-timeout 15 --max-time 180 \
        https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$scratch/SHASUMS256.txt"
    read -r digest archive < <(awk '$2 ~ /^node-v24\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$/ { print $1, $2 }' "$scratch/SHASUMS256.txt")
    [[ $digest =~ ^[a-f0-9]{64}$ && $archive =~ ^node-v24\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$ ]]
    version=${archive%-linux-x64.tar.xz}
    curl --fail --location --retry 3 --connect-timeout 15 --max-time 300 \
        "https://nodejs.org/dist/${version#node-}/$archive" -o "$scratch/$archive"
    (cd "$scratch" && printf '%s  %s\n' "$digest" "$archive" | sha256sum --check -)
    tar -xJf "$scratch/$archive" -C "$scratch"
    install -d "$base/runtimes"
    mv -- "$scratch/${archive%.tar.xz}" "$base/runtimes/${archive%.tar.xz}"
    ln -s "$base/runtimes/${archive%.tar.xz}" "$base/node"
    # Remove only the exact scratch directory allocated above.
    case "$scratch" in "$base"/node-download.*) rm -rf -- "$scratch" ;; esac
fi
"$base/node/bin/node" -e 'if(Number(process.versions.node.split(".")[0])<24)process.exit(1)'
getent passwd tarkov-radar >/dev/null || useradd --system --home-dir /var/lib/tarkov-radar --shell /usr/sbin/nologin tarkov-radar
install -d -o tarkov-radar -g tarkov-radar -m 0750 /var/lib/tarkov-radar /var/lib/tarkov-radar/ledger
install -d -m 0700 /var/backups/tarkov-radar
release="$base/releases/$(date -u +%Y%m%dT%H%M%SZ)-$$"
install -d -m 0755 "$release"
cp -R -- "$source_dir/app" "$source_dir/public" "$source_dir/deploy" "$source_dir/scripts" "$source_dir/RELEASE.json" "$release/"
find "$release" -type d -exec chmod 0755 {} +
find "$release" -type f -exec chmod 0644 {} +
previous=$(readlink -f "$base/current" || true)
ln -s "$release" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"
install -m 0644 "$release/deploy/tencent/radar.service" /etc/systemd/system/tarkov-radar.service
install -m 0644 "$release/deploy/tencent/backup.service" /etc/systemd/system/tarkov-radar-backup.service
install -m 0644 "$release/deploy/tencent/backup.timer" /etc/systemd/system/tarkov-radar-backup.timer
systemctl daemon-reload
systemctl enable tarkov-radar.service
systemctl restart tarkov-radar.service
ready=0
for (( i=0; i<20; i++ )); do
    if curl --silent --fail --max-time 2 http://127.0.0.1:8787/api/health | grep -q 'tarkov-profit-radar'; then ready=1; break; fi
    sleep 1
done
if [[ $ready != 1 ]]; then
    if [[ -n "$previous" && -d "$previous" ]]; then
        ln -s "$previous" "$base/current.rollback"
        mv -Tf "$base/current.rollback" "$base/current"
        systemctl restart tarkov-radar.service
    fi
    echo 'Service failed its health check; inspect journalctl -u tarkov-radar.' >&2; exit 1
fi
# Keep an existing public site configuration on upgrades.
if [[ ! -e /etc/nginx/sites-available/tarkov-radar ]]; then
    install -m 0644 "$release/deploy/tencent/nginx-private.conf" /etc/nginx/sites-available/tarkov-radar
fi
ln -sfn /etc/nginx/sites-available/tarkov-radar /etc/nginx/sites-enabled/tarkov-radar
nginx -t
systemctl enable --now nginx.service
systemctl reload nginx.service
systemctl enable --now tarkov-radar-backup.timer
echo 'Service ready. Validate at http://127.0.0.1:8080 using an SSH tunnel before public cutover.'
echo "Installed: $release"
