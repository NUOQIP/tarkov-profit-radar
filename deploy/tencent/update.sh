#!/usr/bin/env bash
# Upgrade an existing instance. Credentials, accounts and cached media stay on it.
set -Eeuo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Run with sudo bash publish.sh'; exit 1; }
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
base=/opt/tarkov-radar
data=/var/lib/tarkov-radar
node="$base/node/bin/node"
public_url=${1:-https://tarkovlootradar.lanluz.xin}
public_url=${public_url%/}
[[ -x "$node" && -L "$base/current" && -d "$data" ]] || { echo 'Existing radar installation not found.'; exit 1; }
for executable in python3 curl tar sha256sum systemctl nginx flock; do command -v "$executable" >/dev/null; done
exec 9>"$base/install.lock"
flock -n 9 || { echo 'Another deployment is running.'; exit 1; }
(cd "$source_dir" && sha256sum --check --quiet BUNDLE-SHA256SUMS)
nginx -t
previous=$(readlink -f "$base/current")
[[ $previous == "$base/releases/"* && -d "$previous" ]] || { echo 'Unexpected current release path.'; exit 1; }
stamp=$(date -u +%Y%m%dT%H%M%SZ)-$$
release="$base/releases/$stamp"
backup="/var/backups/tarkov-radar/deploy-$stamp"
install -d -m 0755 "$release"
tar -xzf "$source_dir/release.tar.gz" -C "$release" --no-same-owner --no-same-permissions
(cd "$release" && sha256sum --check --quiet SHA256SUMS)
"$node" --check "$release/app/server.mjs"
"$node" --input-type=module - "$release" "$previous" "$public_url" <<'NODE'
import {pathToFileURL} from 'node:url';
import {readFile,copyFile} from 'node:fs/promises';
import {basename} from 'node:path';
const [release,previous,publicUrl]=process.argv.slice(2),url=new URL(publicUrl);
if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Use a plain HTTPS website origin.');
const {clientAssets}=await import(pathToFileURL(release+'/app/client-assets.mjs'));
const assets=await clientAssets(release,new Map());
if(!assets.get('/')?.[2]?.body)throw new Error('Built client is missing.');
const {createAccountsStore}=await import(pathToFileURL(release+'/app/accounts-store.mjs'));
createAccountsStore(':memory:').close();
try{
  const old=JSON.parse(await readFile(previous+'/public/client/manifest.json','utf8'));
  for(const kind of ['script','style']){
    const name=basename(old[kind]?.path||'');
    if(!/^radar-[0-9a-f]{16}\.(?:js|css)$/.test(name))throw new Error('Invalid previous client asset.');
    await copyFile(previous+'/public/client/'+name,release+'/public/client/'+name);
  }
}catch(error){if(error.code!=='ENOENT')throw error;}
console.log('Release and browser assets verified.');
NODE
find "$release" -type d -exec chmod 0755 {} +
find "$release" -type f -exec chmod 0644 {} +
install -d -m 0700 "$backup"
printf '%s\n' "$previous" > "$backup/previous-release.txt"
cp -- /etc/systemd/system/tarkov-radar.service "$backup/radar.service"
for name in backup.service backup.timer; do
    if [[ -f "/etc/systemd/system/tarkov-radar-$name" ]]; then cp -- "/etc/systemd/system/tarkov-radar-$name" "$backup/$name"; fi
done
tar -czf "$backup/nginx.tar.gz" -C /etc/nginx sites-available sites-enabled
rollback() {
    trap - ERR INT TERM
    set +e
    systemctl stop tarkov-radar.service
    ln -s "$previous" "$base/rollback-$stamp"
    mv -Tf "$base/rollback-$stamp" "$base/current"
    cp -- "$backup/radar.service" /etc/systemd/system/tarkov-radar.service
    for name in backup.service backup.timer; do
        if [[ -f "$backup/$name" ]]; then cp -- "$backup/$name" "/etc/systemd/system/tarkov-radar-$name"; fi
    done
    systemctl daemon-reload
    systemctl start tarkov-radar.service
    printf '\nUPDATE_FAILED: previous version restored. Backup: %s\n' "$backup"
    exit 1
}
trap rollback ERR INT TERM
echo 'Backing up website data...'
systemctl stop tarkov-radar.service
# SQLite WAL files are copied together only after writes have stopped.
tar --exclude='./media' -czf "$backup/data.tar.gz" -C "$data" .
ln -s "$release" "$base/current-$stamp"
mv -Tf "$base/current-$stamp" "$base/current"
install -m 0644 "$release/deploy/tencent/radar.service" /etc/systemd/system/tarkov-radar.service
install -m 0644 "$release/deploy/tencent/backup.service" /etc/systemd/system/tarkov-radar-backup.service
install -m 0644 "$release/deploy/tencent/backup.timer" /etc/systemd/system/tarkov-radar-backup.timer
systemctl daemon-reload
systemctl start tarkov-radar.service
curl --silent --show-error --fail --retry 15 --retry-all-errors --retry-delay 1 --retry-max-time 40 --connect-timeout 3 --max-time 5 --noproxy '*' \
    http://127.0.0.1:8787/api/health -o "$backup/health.json"
"$node" --input-type=module - "$release" <<'NODE'
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const release=process.argv[2],base='http://127.0.0.1:8787';
const get=path=>fetch(base+path,{signal:AbortSignal.timeout(15000)});
assert.equal((await (await get('/api/health')).json()).service,'tarkov-profit-radar');
const session=await get('/api/account/session');assert.equal(session.headers.get('cache-control'),'no-store');assert.equal((await session.json()).user,null);
const manifest=JSON.parse(await readFile(release+'/public/client/manifest.json','utf8'));
for(const kind of ['script','style']){
  const response=await get(manifest[kind].path);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/immutable/);await response.arrayBuffer();
}
const html=await (await get('/')).text();assert(html.includes(manifest.script.path));assert(html.includes(manifest.style.path));
const comments=await (await get('/api/comments?market=pve&item=5c0530ee86f774697952d952&page=1')).json();assert.equal(comments.pageSize,5);
console.log('Account isolation, browser bundle and comments verified.');
NODE
domain=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.urlsplit(sys.argv[1]).hostname)' "$public_url")
curl --silent --show-error --fail --retry 5 --retry-all-errors --retry-delay 1 --max-time 5 --noproxy '*' \
    --resolve "$domain:443:127.0.0.1" "$public_url/api/health" -o "$backup/https-health.json"
systemctl enable --now tarkov-radar-backup.timer
trap - ERR INT TERM
printf '\nDEPLOY_OK: %s/\nBackup: %s\n' "$public_url" "$backup"
echo 'Checking public market data...'
if "$node" "$release/scripts/check-deployment.mjs" "$public_url"; then
    echo 'ALL_CHECKS_PASSED'
else
    echo 'Website is running. Public market checks need review; keep this output.'
fi
