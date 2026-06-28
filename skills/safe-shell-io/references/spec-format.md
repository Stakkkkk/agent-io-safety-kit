# Command spec format

The JSON file must be UTF-8 without BOM. Do not keep secrets in it longer than the task requires.

For editor hints, add:

```json
{
  "$schema": "../../../schemas/command-spec.schema.json"
}
```

The canonical schema lives at `schemas/command-spec.schema.json` in the kit root.

## Fields

- `command` — required non-empty string with the program or executable.
- `args` — array of strings; each item is passed as a separate argv item without shell parsing.
- `cwd` — working directory. A relative path is resolved from the spec directory.
- `env` — object with additional environment variables. A string sets a value, `null` removes a variable from the child process environment.
- `stdin` — string passed to the process as UTF-8.
- `stdinFile` — path to a file whose bytes become stdin. Mutually exclusive with `stdin`.
- `stdoutEncoding`, `stderrEncoding` — `utf8`, another `TextDecoder` encoding label, or `raw`. Defaults to strict `utf8`.
- `stdoutFile`, `stderrFile` — write the normalized stream to a file instead of the terminal. Relative paths are resolved from `cwd`.
- `timeoutMs` — positive timeout. Default: 30000 ms.
- `maxOutputBytes` — maximum size of each output stream. Default: 16 MiB.

## Semantics

- The runner always uses `shell: false`.
- Text streams are strictly decoded from the specified encoding and re-emitted as UTF-8 without BOM.
- `raw` mode does not decode the stream. Use it for binary data or together with file output.
- The runner exit code matches the child exit code. A timeout returns 124.
- `.cmd` files and shell built-ins are not portable executables. Prefer a real binary or separate script instead of including a shell.
