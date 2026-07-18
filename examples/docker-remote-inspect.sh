#!/usr/bin/env bash
set -eu

# Replace this fixed value during review. Do not inject it through an SSH string.
container='neo4j'

printf 'configured_user='
docker inspect --format '{{.Config.User}}' "$container"

printf 'label_keys:\n'
docker inspect --format '{{range $key, $_ := .Config.Labels}}{{println $key}}{{end}}' "$container"

# Print environment names only. Values may contain credentials or tokens.
printf 'environment_names:\n'
docker inspect --format '{{range .Config.Env}}{{println (index (split . "=") 0)}}{{end}}' "$container"
