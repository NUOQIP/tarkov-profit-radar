#!/usr/bin/env bash
set -euo pipefail
destination=/var/backups/tarkov-radar
install -d -m 0700 "$destination"
archive="$destination/ledger-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
# Source files are atomically replaced by the collector. Back up finished days
# only; the current UTC day is still being updated and is backed up tomorrow.
mapfile -d '' files < <(find /var/lib/tarkov-radar/ledger -type f -name '*.json' ! -name "$(date -u +%F).json" -printf '%P\0')
if (( ${#files[@]} == 0 )); then exit 0; fi
tar -czf "$archive" -C /var/lib/tarkov-radar/ledger -- "${files[@]}"
chmod 0600 "$archive"
find "$destination" -maxdepth 1 -type f -name 'ledger-*.tar.gz' -mtime +14 -delete
