#!/usr/bin/env bash
# Add the confirmed domain to the existing Tencent deployment.
set -Eeuo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Run with sudo bash setup-tarkov-domain.sh'; exit 1; }
domain=tarkovlootradar.lanluz.xin
site=/etc/nginx/sites-available/tarkov-radar-domain
link=/etc/nginx/sites-enabled/tarkov-radar-domain
cert_name=radar-domain
base=/opt/tarkov-radar
[[ -x /snap/bin/certbot && -L "$base/current" ]] || { echo 'Existing radar or Certbot installation not found.'; exit 1; }
for executable in nginx curl python3 systemctl flock; do command -v "$executable" >/dev/null; done
nginx -V 2>&1 | grep -q -- '--with-http_realip_module'
nginx -t
curl --silent --show-error --fail --max-time 10 http://127.0.0.1:8787/api/health >/dev/null
exec 9>"$base/install.lock"
flock -n 9 || { echo 'Another deployment is running.'; exit 1; }
if [[ -e "$link" || -L "$link" ]]; then
    [[ -L "$link" && $(readlink -f "$link") == "$site" ]] || { echo 'Domain site entry is occupied; no changes made.'; exit 1; }
fi
stamp=$(date -u +%Y%m%dT%H%M%SZ)-$$
backup="/var/backups/tarkov-radar/domain-$stamp"
install -d -m 0700 "$backup"
prior_site=0; prior_link=0; environment_changed=0; installed=0
if [[ -f "$site" ]]; then cp -p -- "$site" "$backup/site.conf"; prior_site=1; fi
if [[ -L "$link" ]]; then prior_link=1; fi
if [[ -f /etc/tarkov-radar.env ]]; then cp -p -- /etc/tarkov-radar.env "$backup/environment"; fi

# The existing IP site's webroot already serves this path on port 80.
install -d -m 0755 /var/www/tarkov-acme/.well-known/acme-challenge
token=$(python3 -c 'import secrets; print(secrets.token_hex(24))')
probe="/var/www/tarkov-acme/.well-known/acme-challenge/radar-domain-$token"
printf '%s' "$token" > "$probe"
chmod 0644 "$probe"
cleanup() { [[ ! -f "$probe" ]] || rm -f -- "$probe"; }
trap cleanup EXIT
if [[ $(curl --silent --show-error --fail --max-time 25 "http://$domain/.well-known/acme-challenge/radar-domain-$token") != "$token" ]]; then
    echo 'Domain validation path is not reaching this server. Check the DNS target and Cloudflare redirect/cache rules; existing site unchanged.'
    exit 1
fi

# Trust client-IP headers only from Cloudflare's official published networks.
curl --fail --silent --show-error --proto '=https' --connect-timeout 10 --max-time 30 https://www.cloudflare.com/ips-v4/ -o "$backup/ips-v4"
curl --fail --silent --show-error --proto '=https' --connect-timeout 10 --max-time 30 https://www.cloudflare.com/ips-v6/ -o "$backup/ips-v6"
python3 - "$backup" "$domain" <<'PY'
from pathlib import Path
import ipaddress, sys
folder, domain = Path(sys.argv[1]), sys.argv[2]
networks = []
for version in (4, 6):
    rows = (folder / f'ips-v{version}').read_text().splitlines()
    if not 3 <= len(rows) <= 100:
        raise RuntimeError('Unexpected Cloudflare network list')
    for row in rows:
        network = ipaddress.ip_network(row.strip(), strict=True)
        if network.version != version or network.prefixlen < (8 if version == 4 else 16):
            raise RuntimeError('Unsafe proxy network')
        networks.append(str(network))
trust = '\n'.join('    set_real_ip_from ' + network + ';' for network in networks)
config = '''server {
    listen 80;
    server_name DOMAIN;
    server_tokens off;
    location ^~ /.well-known/acme-challenge/ { root /var/www/tarkov-acme; }
    location / { return 301 https://DOMAIN$request_uri; }
}
server {
    listen 443 ssl;
    server_name DOMAIN;
    ssl_certificate /etc/letsencrypt/live/radar-domain/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/radar-domain/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    server_tokens off;
    client_max_body_size 512k;
TRUST
    real_ip_header CF-Connecting-IP;
    real_ip_recursive on;
    access_log /var/log/nginx/tarkov-radar.access.log;
    error_log /var/log/nginx/tarkov-radar.error.log;
    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
    }
}
'''.replace('DOMAIN', domain).replace('TRUST', trust)
(folder / 'new-site.conf').write_text(config)
environment = folder / 'environment'
if environment.exists():
    import re
    text = environment.read_text()
    pattern = r'(?m)^[ \t]*ADMIN_ORIGIN[ \t]*=[ \t]*[\'"]?https://101\.33\.32\.33/?[\'"]?[ \t]*$'
    changed, count = re.subn(pattern, 'ADMIN_ORIGIN=https://' + domain, text)
    if count:
        (folder / 'new-environment').write_text(changed)
PY

echo 'Requesting the domain certificate using the existing ACME account...'
/snap/bin/certbot certonly --non-interactive --webroot --webroot-path /var/www/tarkov-acme \
    --preferred-challenges http --cert-name "$cert_name" -d "$domain" --keep-until-expiring

rollback() {
    trap - ERR INT TERM
    set +e
    if [[ $installed == 1 ]]; then
        if [[ $prior_link == 0 && -L "$link" ]]; then unlink "$link"; fi
        if [[ $prior_site == 1 ]]; then cp -p -- "$backup/site.conf" "$site";
        elif [[ -f "$site" ]]; then mv -- "$site" "$backup/failed-site.conf"; fi
        if [[ $environment_changed == 1 ]]; then
            cp -p -- "$backup/environment" /etc/tarkov-radar.env
            systemctl restart tarkov-radar.service
        fi
        nginx -t && systemctl reload nginx.service
    fi
    echo "DOMAIN_SETUP_FAILED: previous website configuration restored. Backup: $backup"
    exit 1
}
trap rollback ERR INT TERM
installed=1
install -m 0644 "$backup/new-site.conf" "$site"
if [[ $prior_link == 0 ]]; then ln -s "$site" "$link"; fi
nginx -t
if [[ -f "$backup/new-environment" ]]; then
    environment_changed=1
    install -m 0600 "$backup/new-environment" /etc/tarkov-radar.env
    systemctl restart tarkov-radar.service
fi
systemctl reload nginx.service
# Reload is asynchronous: the old worker can briefly serve the IP certificate.
# Retry the read-only probe without bypassing TLS or using an outbound proxy.
curl --silent --show-error --fail --retry 15 --retry-all-errors --retry-delay 1 --retry-max-time 40 --connect-timeout 3 --max-time 5 --noproxy '*' \
    --resolve "$domain:443:127.0.0.1" "https://$domain/api/health" -o "$backup/health.json"
python3 - "$backup/health.json" <<'PY'
import json, sys
assert json.load(open(sys.argv[1]))['service'] == 'tarkov-profit-radar'
PY
install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
install -m 0755 "$base/current/deploy/tencent/renew-hook.sh" /etc/letsencrypt/renewal-hooks/deploy/radar-nginx
systemctl enable --now snap.certbot.renew.timer
trap - ERR INT TERM
echo "ORIGIN_DOMAIN_OK: https://$domain/"
echo 'Checking public access...'
if curl --silent --show-error --fail --location --max-redirs 3 --max-time 30 "https://$domain/api/health" -o "$backup/public-health.json" \
    && python3 -c 'import json,sys; assert json.load(open(sys.argv[1]))["service"] == "tarkov-profit-radar"' "$backup/public-health.json"; then
    echo "DOMAIN_OK: https://$domain/"
else
    echo 'Origin HTTPS is ready. For proxied DNS, set Cloudflare SSL/TLS to Full (strict), then check public access again.'
fi
echo 'Checking automatic certificate renewal...'
if /snap/bin/certbot renew --cert-name "$cert_name" --dry-run; then
    echo 'RENEWAL_OK'
else
    echo 'Certificate installed, but renewal validation needs review. Keep this output for troubleshooting.'
fi
echo "Configuration backup: $backup"
