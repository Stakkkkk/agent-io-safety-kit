---
name: safe-shell-io
description: Execute external commands with exact argv semantics and without accidental shell re-parsing. Use when commands contain user-controlled text, non-ASCII characters, spaces in paths, nested quotes, shell metacharacters, JSON/YAML/SQL/regex payloads, multiline values, stdin/stdout text, or after any quoting, parsing, or command-encoding failure.
---

# Safe command execution

## Choose the path

1. Use a native tool/API with an argument array when available.
2. For a simple command, use one shell layer, literal paths, and separate arguments.
3. For complex or user-controlled values, create a JSON spec and run `scripts/run-from-spec.mjs`.

After the first escaping or parsing failure, switch immediately to option 3. Do not spend attempts on new quoting combinations.

## Prevent re-parsing

- Do not build a command string from user data.
- Do not nest `powershell -Command`, `cmd /c`, `sh -c`, or `bash -c` unless unavoidable.
- Do not pass JSON, SQL, regex, or multiline text as shell syntax fragments.
- For CLI tools with option parsing, put `--` before user-controlled positional values that can start with `-`; for `rg`, use `rg -- "-pattern"` or `rg --fixed-strings -- "-literal"`.
- Do not use `eval`, `Invoke-Expression`, or `shell: true`.
- Do not put secrets in diagnostic output or specs that will be committed.

## Inline interpreter one-liners

Treat `node -e`, `node --eval`, `node -p`, `python -c`, `python3 -c`, `py -c`, `ruby -e`, `perl -e`, `powershell -Command`, `pwsh -Command`, `cmd /c`, `bash -c`, and `sh -c` as unsafe by default when they touch project files, config/env/secrets, JSON/YAML/TOML, regex, non-ASCII data, paths with spaces, or code containing `$`, quotes, backticks, braces, brackets, pipes, redirects, or command separators.

Do not use inline interpreter one-liners for redaction or transformation of config output. Use one of these routes:

- native MCP/API/tool access;
- a script file created with a structured editor or patch API;
- `scripts/run-from-spec.mjs`;
- `scripts/run-node-utf8.mjs --spec <spec.json>`;
- `node_repl`, when available and suitable.

The only normal exception is fixed ASCII diagnostics such as `node --version`, with no project data, no regex, no secrets, and no nested quoting.

## Config/env/secrets output

When reading `.env`, `.toml`, `.json`, `.yaml`, `.yml`, service configs, or files likely to contain tokens/passwords, do not redact by piping through shell regex or inline interpreter code. Parse structurally where possible and print only allowlisted metadata: section names, key presence, counts, server names, URL hostnames, or auth header shape. Never print raw values.

## Remote and PowerShell edge cases

Before SSH, rsync, SFTP, remote shell, here-doc, or long-running remote operations, read `../../docs/field-notes.md` and `../../docs/remote-io-recipes.md`.

Apply these routing rules:

- use `ssh -n` only when the SSH process must not consume parent stdin; do not put `ssh -n` inside `rsync -e`;
- do not send non-ASCII inline Node.js code or literals through PowerShell stdin; use `scripts/run-node-utf8.mjs --spec <spec.json>` or a script file plus JSON/Base64 payload;
- do not pass newlines as `\n` through PowerShell/SSH quoting; use repeated fixed `echo` only for tiny fixed text, otherwise upload/stream data or use JSON/Base64;
- when sending Bash from Windows to SSH, normalize CRLF to LF first; prefer `scripts/remote-bash.mjs <host> <script>`;
- if an SSH command contains pipes, `$`, regex, quotes, `sed`, `awk`, or `grep`, do not send it as one command string; use a script via stdin/file/spec;
- remember that `ssh host command args...` still runs through the remote shell; argv safety on the local side does not protect complex remote snippets;
- for complex remote scripts, upload a script file, stream bytes through stdin, or pass data as a file/Base64 payload instead of building multi-layer here-doc strings;
- under Bash `set -u`, do not put `$...` patterns such as nginx variables inside double quotes; use single quotes, fixed-string search, or a script file;
- for long SSH/rsync work, prefer remote supervision plus a log and polling instead of keeping the job tied to the local client;
- for PowerShell ranges, read `../../examples/powershell-select-object.md` and use `-Index (94..112)` or `-Skip/-First`;
- for PowerShell/SSH newline escapes, read `../../examples/powershell-ssh-newlines.md`;
- before embedding a script in a host-language string, read `../../examples/remote-script-boundaries.md`.

## Run Node with UTF-8 data

Do not paste non-ASCII paths or JavaScript literals into inline Node scripts sent through PowerShell stdin. Put code in a `.mjs` file and pass data through a UTF-8 JSON spec:

```text
node <skill-dir>/scripts/run-node-utf8.mjs --spec <spec.json>
```

Spec shape:

```json
{
  "script": "scripts/find-instruction.mjs",
  "args": ["Инструкция_агента.md"],
  "stdin": "{\"anchor\":\"Instruction\"}",
  "cwd": "."
}
```

Relative `script` and `cwd` are resolved from the spec directory. The helper runs Node with `shell: false`, sends stdin as UTF-8 bytes, and strictly decodes child stdout/stderr as UTF-8.

## Run remote Bash safely

When a Bash script is composed or stored on Windows, do not stream a PowerShell here-string directly to `ssh host bash -s`; CRLF can reach the remote parser. Use:

```text
node <skill-dir>/scripts/remote-bash.mjs <host> <script>
```

The helper reads the script as strict UTF-8, normalizes `CRLF`/`CR` to `LF`, and runs `ssh <host> bash -s` with the normalized bytes on stdin. Use `--print-normalized` to inspect the exact script bytes before sending.

## Run through a spec

Create the spec with a structured editor or patch API as UTF-8 without BOM:

```json
{
  "command": "node",
  "args": ["script.mjs", "Denis: \"exact argument\"", "$5 & 10%"],
  "cwd": ".",
  "stdin": "line 1\nline 2\n",
  "stdoutEncoding": "utf8",
  "stderrEncoding": "utf8",
  "timeoutMs": 30000
}
```

Run:

```text
node <skill-dir>/scripts/run-from-spec.mjs <spec.json>
```

The runner uses `spawn` with `shell: false`, passes each `args` item separately, and strictly decodes text stdout/stderr. Relative `cwd` and file fields are resolved from the spec directory.

Read `references/spec-format.md` only when using additional fields.

## Verify

Check the child exit code. For risky paths, run a canary containing a space, single and double quotes, `$`, `&`, a backslash, a newline, and a non-ASCII character. If the command writes a text file, also apply `safe-text-io`.
