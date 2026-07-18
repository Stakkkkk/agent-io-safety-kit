#!/usr/bin/env bash
set -eu

# Replace every fixed value during review. This script is intentionally read-only.
container='neo4j'
expected_uid='7474'
expected_gid='7474'
bind_paths=(
  '/srv/neo4j/data'
  '/srv/neo4j/logs'
)

if [ "$(id -u)" -eq 0 ]; then
  privilege='root'
elif command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
  privilege='sudo-noninteractive'
else
  printf '%s\n' 'STOP: root or non-interactive sudo is unavailable; no state was changed.' >&2
  exit 3
fi

if ! actual_uid=$(docker exec "$container" id -u); then
  printf '%s\n' 'STOP: could not read the effective container UID; no state was changed.' >&2
  exit 4
fi
if ! actual_gid=$(docker exec "$container" id -g); then
  printf '%s\n' 'STOP: could not read the effective container GID; no state was changed.' >&2
  exit 4
fi
printf 'container=%s actual_uid=%s actual_gid=%s expected_uid=%s expected_gid=%s privilege=%s\n' \
  "$container" "$actual_uid" "$actual_gid" "$expected_uid" "$expected_gid" "$privilege"

if [ "$actual_uid" != "$expected_uid" ] || [ "$actual_gid" != "$expected_gid" ]; then
  printf '%s\n' 'STOP: expected UID/GID does not match the running container; no state was changed.' >&2
  exit 5
fi

for target in "${bind_paths[@]}"; do
  if [ -e "$target" ]; then
    stat -c 'existing uid=%u gid=%g mode=%a path=%n' -- "$target"
  else
    parent=$(dirname -- "$target")
    if [ ! -d "$parent" ]; then
      printf 'STOP: parent directory does not exist: %s\n' "$parent" >&2
      exit 6
    fi
    stat -c 'planned-parent uid=%u gid=%g mode=%a path=%n' -- "$parent"
    printf 'planned-missing path=%s\n' "$target"
  fi
done

printf '%s\n' 'READY: read-only preflight passed; run the reviewed state-changing phase separately.'
