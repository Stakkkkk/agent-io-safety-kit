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

## Remote and PowerShell edge cases

Before SSH, rsync, SFTP, remote shell, here-doc, or long-running remote operations, read `../../docs/field-notes.md` and `../../docs/remote-io-recipes.md`.

Apply these routing rules:

- use `ssh -n` only when the SSH process must not consume parent stdin; do not put `ssh -n` inside `rsync -e`;
- do not pass newlines as `\n` through PowerShell/SSH quoting; use repeated fixed `echo` only for tiny fixed text, otherwise upload/stream data or use JSON/Base64;
- for complex remote scripts, upload a script file, stream bytes through stdin, or pass data as a file/Base64 payload instead of building multi-layer here-doc strings;
- for long SSH/rsync work, prefer remote supervision plus a log and polling instead of keeping the job tied to the local client;
- for PowerShell ranges, read `../../examples/powershell-select-object.md` and use `-Index (94..112)` or `-Skip/-First`;
- for PowerShell/SSH newline escapes, read `../../examples/powershell-ssh-newlines.md`;
- before embedding a script in a host-language string, read `../../examples/remote-script-boundaries.md`.

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
