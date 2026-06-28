# Agent I/O Safety Kit

[Русская версия](README.ru.md)

Stop AI agents from losing data to shell quoting, encodings, BOMs, and line endings.

Agent I/O Safety Kit is a small, dependency-free bundle of rules, skills, and Node.js scripts for safer agent command execution and text file handling. It is meant to be copied into any repository that uses coding agents, regardless of the agent platform.

Use it when an agent frequently:

- runs commands with user-controlled text, spaces in paths, quotes, shell metacharacters, JSON/YAML/SQL/regex, multiline values, or non-ASCII characters;
- reads, creates, edits, or transcodes text files;
- works on Windows or PowerShell and risks mojibake;
- wastes time trying different quoting combinations after the first failure.

## What is included

- `RULE.md` — the central policy for safe shell and text I/O.
- `skills/safe-shell-io` — instructions and a spec runner for exact `argv` execution.
- `skills/safe-text-io` — instructions and utilities for text inspection and transcoding.
- `schemas/command-spec.schema.json` — JSON Schema for command specs.
- `scripts/deploy.mjs` — an idempotent installer for target projects.
- `scripts/doctor.mjs` — a diagnostic command for installed copies.
- `snippets/` — managed instruction fragments for common agent entry files.
- `examples/` — small copy-pasteable examples.
- `tests/run-tests.mjs` — a self-contained test suite with no npm dependencies.

Design overview: [`00-MECHANISM.md`](00-MECHANISM.md). Deployment guide: [`01-DEPLOYMENT.md`](01-DEPLOYMENT.md).

## Requirements

- Node.js 18 or newer.
- A target project where `.agent-io-safety/` should be installed.

No external npm dependencies are required.

## Quick start

Preview an installation:

```sh
node scripts/deploy.mjs --target /path/to/project --entry AGENTS.md --dry-run
```

Install or update the managed copy:

```sh
node scripts/deploy.mjs --target /path/to/project --entry AGENTS.md
```

Check an installed copy:

```sh
node scripts/deploy.mjs --target /path/to/project --entry AGENTS.md --check
node scripts/doctor.mjs --target /path/to/project --entry AGENTS.md
```

By default, the installer creates or updates a managed block in `AGENTS.md` and copies the kit to `.agent-io-safety/`.

## Instruction for agents

Yes: you should put a short agent-facing instruction in the project README or entry file. The most important rule is not “always use this tool”; it is “stop guessing after the first quoting or encoding failure and switch to the deterministic path”.

Minimal instruction to copy into an agent entry file:

```md
## Shell and text I/O safety

Before the first operation that uses shell, reads or writes text, passes user-controlled values, paths, JSON/YAML/SQL/regex, non-ASCII characters, encodings, BOM, or line endings, read and follow `.agent-io-safety/RULE.md`.

Load the referenced skill before the matching operation:

- `.agent-io-safety/skills/safe-shell-io/SKILL.md` for complex commands, user values, quoting, shell metacharacters, structured payloads, stdin/stdout, or command-encoding failures.
- `.agent-io-safety/skills/safe-text-io/SKILL.md` for text files, UTF-8/UTF-16, BOM, line endings, PowerShell 5.1, or mojibake.

Do not repair quoting or mojibake by repeated trial and error. After the first failure, use the deterministic script/spec path from the skill.
```

The installer uses the shorter managed snippets from [`snippets/`](snippets/) so the root instruction stays small.

## Supported entry files

The same mechanism can be installed into different agent entry files:

```sh
node scripts/deploy.mjs --target /path/to/project --entry AGENTS.md
node scripts/deploy.mjs --target /path/to/project --entry CLAUDE.md
node scripts/deploy.mjs --target /path/to/project --entry GEMINI.md
node scripts/deploy.mjs --target /path/to/project --entry .github/copilot-instructions.md
```

Manual fragments are available in [`snippets/`](snippets/).

## Run checks

```sh
npm test
npm run check:text
```

The same checks without npm:

```sh
node tests/run-tests.mjs
node skills/safe-text-io/scripts/inspect-text.mjs --all-files --fail-on-bom --eol lf --ps51-safe .
```

After installing the kit into a target project, run:

```sh
npm run doctor -- --target /path/to/project --entry AGENTS.md
```

## Example: safe command execution

Create a UTF-8, no-BOM command spec:

```json
{
  "command": "node",
  "args": ["script.mjs", "Denis: \"exact argument\"", "$5 & 10%"],
  "cwd": ".",
  "stdin": "line 1\nline 2\n",
  "stdoutEncoding": "utf8",
  "stderrEncoding": "utf8"
}
```

Run it:

```sh
node skills/safe-shell-io/scripts/run-from-spec.mjs command.json
```

The runner uses `spawn` with `shell: false` and passes every argument as a separate `argv` item.

## Example: text inspection

```sh
node skills/safe-text-io/scripts/inspect-text.mjs --fail-on-bom --eol lf README.md
```

The inspector strictly checks UTF-8, BOM, line endings, suspicious UTF-16 without BOM, and PowerShell 5.1 safety for `.ps1/.psd1/.psm1`.

## Guarantees and boundaries

The kit makes fragile operations deterministic:

- exact argument passing through `argv`;
- strict UTF-8 validation instead of silent replacement characters;
- explicit BOM and line-ending policy;
- safe managed-copy updates with SHA-256 drift detection;
- symlink-aware deployment writes.

It does not guess legacy encodings, auto-heal mojibake, process binary formats as text, or override higher-priority system/user/project instructions.

## npm status

The package is npm-ready but not automatically published by this repository. If the package name is available, publishing can be done manually after a tagged release:

```sh
npm publish --access public
```

Useful local commands:

```sh
npx agent-io-safety-kit --target /path/to/project --entry AGENTS.md --dry-run
npx safe-text-inspect --fail-on-bom --eol lf README.md
```

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Encoding and quoting bug reports are especially welcome; please include the exact bytes, shell, OS, command, and expected/actual behavior when possible.

## License

MIT — see [`LICENSE`](LICENSE).
