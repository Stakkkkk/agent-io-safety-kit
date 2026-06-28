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
- Do not use `eval`, `Invoke-Expression`, or `shell: true`.
- Do not put secrets in diagnostic output or specs that will be committed.

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
