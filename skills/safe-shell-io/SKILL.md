---
name: safe-shell-io
description: Execute external commands with exact argv semantics and without accidental shell re-parsing. Use when commands contain user-controlled text, non-ASCII characters, spaces in paths, nested quotes, shell metacharacters, JSON/YAML/SQL/regex payloads, multiline values, stdin/stdout text, or after any quoting, parsing, or command-encoding failure.
---

# Safe command execution

## Route

1. Prefer a native API/tool with an argument array.
2. For a fixed simple command, use one shell layer and separate argv items.
3. For user-controlled or complex values, create a UTF-8 JSON spec and run `scripts/run-from-spec.mjs`.
4. After one escaping/parsing failure, switch to route 3; do not try new quoting combinations.

Never build command strings from data, use `shell: true`, `eval`, or `Invoke-Expression`. Put `--` before positional data that may begin with `-`.

## No inline code for real data

Do not use `node -e`, `python -c`, `powershell -Command`, `cmd /c`, `bash -c`, or similar for project files, structured data, regex, non-ASCII text, config, environment, or secrets. Use a reviewed script file, `scripts/run-from-spec.mjs`, or `scripts/run-node-utf8.mjs --spec`.

Never redact secret-bearing output inline. Print only allowlisted metadata.

## Structured command spec

```json
{
  "command": "node",
  "args": ["script.mjs", "exact argument", "$5 & non-ASCII"],
  "cwd": ".",
  "stdin": "line 1\nline 2\n",
  "timeoutMs": 30000,
  "maxOutputBytes": 16777216
}
```

```text
node <skill-dir>/scripts/run-from-spec.mjs <spec.json>
```

The runner rejects unknown fields, uses `shell: false`, limits output/time, strictly decodes text, and writes redirected output atomically. See `references/spec-format.md` for optional fields.

## Node and PowerShell UTF-8 boundary

Put code in a strict UTF-8 `.mjs` file and data in argv/stdin/spec:

```text
node <skill-dir>/scripts/run-node-utf8.mjs --spec <spec.json>
```

The helper rejects invalid UTF-8, Markdown-as-script, inline eval flags, unknown fields, excessive output, and timeouts.

## Remote Bash boundary

Do not compose complex SSH commands as one quoted string. Store Bash in a UTF-8 file and run:

```text
node <skill-dir>/scripts/remote-bash.mjs <host> <script>
```

It verifies the local file, normalizes CRLF/CR to LF, streams bounded output, and runs `ssh <host> bash -s`. Use `--print-normalized`, `--diagnose-ssh`, `--ssh`, repeated `--ssh-arg`, `--timeout-ms`, and `--max-output-bytes` when needed.

Never use `ssh -n` inside `rsync -e`. Local argv arrays do not remove the remote shell boundary. For long jobs, use remote supervision, logs, and polling.

Treat Docker Go templates as complex remote syntax. Do not put `docker inspect --format '{{...}}'` inside an inline PowerShell/SSH command; keep the template in a reviewed local Bash file and send it with `remote-bash.mjs`.

Before stopping containers for bind-mount ownership or directory changes, complete a separate read-only preflight: verify the effective container UID/GID, inspect current host ownership/modes, and prove non-interactive root/sudo availability. Do not begin `down`, backup/move, `mkdir`, `chown`, or `chmod` until every check passes. If privilege is unavailable, stop and ask the user/admin. See the Docker sections in `../../docs/remote-io-recipes.md` and the preflight example in a `full` deployment.

Read `../../docs/field-notes.md` and `../../docs/remote-io-recipes.md` only for relevant remote/PowerShell cases.

## Verify

Check exit status. For a risky route, test a canary with a space, both quote types, `$`, `&`, backslash, newline, and non-ASCII text. If a command writes text, also apply `safe-text-io`.
