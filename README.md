# Agent I/O Safety Kit

Languages: [English](README.md) | [Russian](README.ru.md)

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
- `skills/safe-text-io` — instructions and utilities for text inspection, transcoding, and ASCII-safe byte replacement.
- `schemas/command-spec.schema.json` — JSON Schema for command specs.
- `scripts/deploy.mjs` — an idempotent installer for target projects.
- `scripts/doctor.mjs` — a diagnostic command for installed copies.
- `snippets/` — managed instruction fragments for common agent entry files.
- `examples/` — small copy-pasteable examples.
- `docs/external-tools.md` — optional integrations with mature linters, scanners, and validators.
- `docs/language-policy.md` — why the core stays dependency-free Node.js.
- `docs/localization.md` — how English canonical files and Russian localization are maintained.
- `docs/project-skills-layering.md` — how to use the kit next to existing project/domain skills.
- `docs/field-notes.md` — real shell/text/remote I/O traps observed in agent work.
- `docs/remote-io-recipes.md` — safer patterns for SSH, rsync, here-docs, SFTP, and long remote jobs.
- `docs/cursor-hooks.md` — optional Cursor Hooks enforcement layer.
- `docs/codex-hooks.md` — optional Codex Hooks enforcement layer.
- `tests/run-tests.mjs` — a self-contained test suite with no npm dependencies.

Design overview: [`00-MECHANISM.md`](00-MECHANISM.md). Deployment guide: [`01-DEPLOYMENT.md`](01-DEPLOYMENT.md).

## Language policy

English is the canonical language for project files, GitHub/npm metadata, rules, skills, snippets, docs, and examples. Russian is maintained as a first-class localization:

- `README.ru.md`
- `00-MECHANISM.ru.md`
- `01-DEPLOYMENT.ru.md`
- `RULE.ru.md`
- `skills/**/SKILL.ru.md`
- `skills/**/references/*.ru.md`
- `docs/ru/`

The installer can deploy either language while preserving the same target paths:

```sh
node scripts/deploy.mjs --target /path/to/project --entry AGENTS.md --lang en
node scripts/deploy.mjs --target /path/to/project --entry AGENTS.md --lang ru
```

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

Install Russian localized agent instructions:

```sh
node scripts/deploy.mjs --target /path/to/project --entry AGENTS.md --lang ru
```

Normalize the entry file explicitly during deployment:

```sh
node scripts/deploy.mjs --target /path/to/project --entry AGENTS.md --fix-entry-text
```

This removes UTF-8 BOM from the entry file and normalizes its line endings to LF. It is opt-in because the default installer preserves existing entry-file bytes where possible.

Check an installed copy:

```sh
node scripts/deploy.mjs --target /path/to/project --entry AGENTS.md --check
node scripts/doctor.mjs --target /path/to/project --entry AGENTS.md
node scripts/doctor.mjs --target /path/to/project --entry AGENTS.md --external
```

By default, the installer creates or updates a managed block in `AGENTS.md` and copies the kit to `.agent-io-safety/`.

## Instruction for agents

Put the operative instruction in the agent entry file. The README can document the policy, but the entry file is where agents are expected to read and follow it. The most important rule is not “always use this tool”; it is “stop guessing after the first quoting or encoding failure and switch to the deterministic path”.

Minimal instruction for a root-level agent entry file:

```md
## Shell and text I/O safety

Before the first operation that uses shell, reads or writes text, passes user-controlled values, paths, JSON/YAML/SQL/regex, non-ASCII characters, encodings, BOM, or line endings, read and follow `.agent-io-safety/RULE.md`.

Read the referenced skill file before the matching operation:

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
npm run doctor -- --target /path/to/project --entry AGENTS.md --external
```

`--external` only reports optional third-party tools. Missing tools are warnings, not failures.

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

## Example: ASCII-safe byte replacement

When a file is not valid UTF-8 but the required edit is ASCII-only, avoid decoding it with replacement characters. Replace raw ASCII byte sequences instead:

```sh
node skills/safe-text-io/scripts/replace-ascii-bytes.mjs --input legacy.sh --in-place --search old/path --replace new/path
```

This preserves all non-target bytes and is intentionally limited to ASCII strings or explicit hex bytes.

## Guarantees and boundaries

The kit makes fragile operations deterministic:

- exact argument passing through `argv`;
- strict UTF-8 validation instead of silent replacement characters;
- explicit BOM and line-ending policy;
- safe managed-copy updates with SHA-256 drift detection;
- symlink-aware deployment writes.

It does not guess legacy encodings, auto-heal mojibake, process binary formats as text, or override higher-priority system/user/project instructions.

## External tools

This kit is not trying to replace mature linters or scanners. It defines the safety boundary, then lets existing tools do domain-specific work. See [`docs/external-tools.md`](docs/external-tools.md) and [`docs/language-policy.md`](docs/language-policy.md).

## Layering with project skills

The kit does not replace project-specific or domain-specific instructions. It sits below them and handles shell/text I/O boundaries. See [`docs/project-skills-layering.md`](docs/project-skills-layering.md).

## Field-tested recipes

See [`docs/field-notes.md`](docs/field-notes.md), [`docs/remote-io-recipes.md`](docs/remote-io-recipes.md), [`examples/powershell-select-object.md`](examples/powershell-select-object.md), [`examples/powershell-ssh-newlines.md`](examples/powershell-ssh-newlines.md), and [`examples/remote-script-boundaries.md`](examples/remote-script-boundaries.md) for cases such as terminal mojibake with valid UTF-8 bytes, `ssh -n` vs `rsync -e`, PowerShell/SSH newline escaping, remote here-doc escaping, Paramiko SFTP rename behavior, long SSH jobs, and floating Docker tags.

## Optional hook enforcement

Rules and skills teach the agent what to do. Hooks can enforce the most mechanical parts around tool calls. See [`docs/cursor-hooks.md`](docs/cursor-hooks.md) and [`docs/codex-hooks.md`](docs/codex-hooks.md). A ready-to-copy Cursor example is in [`examples/cursor-hooks/`](examples/cursor-hooks/).

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
