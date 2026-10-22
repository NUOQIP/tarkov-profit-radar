#!/usr/bin/env bash
set -euo pipefail
destination=/var/backups/tarkov-radar
umask 077
install -d -m 0700 "$destination"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="$destination/ledger-$stamp.tar.gz"
# Source files are atomically replaced by the collector. Back up finished days
# only; the current UTC day is still being updated and is backed up tomorrow.
mapfile -d '' files < <(find /var/lib/tarkov-radar/ledger -type f -name '*.json' ! -name "$(date -u +%F).json" -printf '%P\0')
if (( ${#files[@]} > 0 )); then
    tar -czf "$archive.partial" -C /var/lib/tarkov-radar/ledger -- "${files[@]}"
    mv -- "$archive.partial" "$archive"
fi
# Private admin settings include the SMTP authorization secret; keep this archive private.
if [[ -d /var/lib/tarkov-radar/admin ]]; then
    mapfile -d '' admin_files < <(find /var/lib/tarkov-radar/admin -maxdepth 1 -type f -name '*.json' -printf '%P\0')
    if (( ${#admin_files[@]} > 0 )); then
        admin_archive="$destination/admin-$stamp.tar.gz"
        tar -czf "$admin_archive.partial" -C /var/lib/tarkov-radar/admin -- "${admin_files[@]}"
        mv -- "$admin_archive.partial" "$admin_archive"
    fi
fi
if [[ -f /var/lib/tarkov-radar/community/comments.sqlite ]]; then
    /opt/tarkov-radar/node/bin/node /opt/tarkov-radar/current/scripts/backup-comments.mjs \
        /var/lib/tarkov-radar/community/comments.sqlite "$destination/comments-$stamp.sqlite"
fi
if [[ -f /var/lib/tarkov-radar/community/accounts.sqlite ]]; then
    /opt/tarkov-radar/node/bin/node /opt/tarkov-radar/current/scripts/backup-comments.mjs \
        /var/lib/tarkov-radar/community/accounts.sqlite "$destination/accounts-$stamp.sqlite"
fi
find "$destination" -maxdepth 1 -type f -name 'accounts-*.sqlite' -mtime +14 -delete
find "$destination" -maxdepth 1 -type f -name 'comments-*.sqlite' -mtime +14 -delete
find "$destination" -maxdepth 1 -type f -name 'ledger-*.tar.gz' -mtime +14 -delete
find "$destination" -maxdepth 1 -type f -name 'admin-*.tar.gz' -mtime +14 -delete
