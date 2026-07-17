# Agent I/O Safety Kit

Languages: [English](README.md) | [Russian](README.ru.md)

A dependency-free safety layer for coding agents that cross shell, text, PowerShell, SSH, encoding, and terminal-output boundaries.

The kit combines compact agent rules, deterministic Node.js helpers, optional lifecycle hooks, deployment integrity checks, and field-tested recipes. It does not replace project/domain instructions; it controls the lower I/O layer used to carry them out.

## What it prevents

- repeated shell-quoting guesses and accidental command re-parsing;
- mojibake being mistaken for damaged files or paths;
- silent UTF-8 replacement decoding, unwanted BOM/EOL changes, and unsafe legacy-file rewrites;
- inline interpreter one-liners around config, environment, regex, non-ASCII data, or secrets;
- common PowerShell, SSH, rsync, remote Bash, and persistent REPL mistakes.

## Requirements and distribution

- Node.js 18 or newer;
- no runtime npm dependencies.

The package is distributed by tagged GitHub releases. Each release contains source, a `.tgz` npm package, and its SHA-256 file. The npm name is reserved in metadata but is not currently published to the public npm registry, so bare `npx agent-io-safety-kit` is not a supported installation route yet.

## Install from a tagged GitHub release

After `v0.2.0` is published:

```sh
npx --yes --package github:Stakkkkk/agent-io-safety-kit#v0.2.0 agent-io-safety-kit --target /path/to/project
```

To avoid network resolution after downloading the release asset:

```sh
npx --yes --package ./agent-io-safety-kit-0.2.0.tgz agent-io-safety-kit --target /path/to/project
```

From a cloned repository:

```sh
node scripts/deploy.mjs --target /path/to/project
```

Preview first with `--dry-run`. The default entry file is `AGENTS.md`; override it with `--entry` for another agent platform.

## Deployment choices

The default `core` profile installs the rule, selected-language docs, skills, and helpers:

```sh
node scripts/deploy.mjs --target /path/to/project --profile core --lang en
node scripts/deploy.mjs --target /path/to/project --profile core --lang ru
```

Use `full` when the target also needs all examples, both documentation trees, and ready hook adapters:

```sh
node scripts/deploy.mjs --target /path/to/project --profile full
```

Other useful modes:

```sh
node scripts/deploy.mjs --target /path/to/project --dry-run
node scripts/deploy.mjs --target /path/to/project --check
node scripts/deploy.mjs --target /path/to/project --fix-entry-text
node scripts/deploy.mjs --target /path/to/project --uninstall
```

`--fix-entry-text` explicitly removes a UTF-8 BOM and normalizes only the entry file to LF. `--uninstall` removes only manifest-tracked files and the managed entry block; it refuses modified managed files unless `--force` is explicitly supplied and preserves unknown files.

Writes use same-directory temporary files and atomic rename. The manifest records hashes, language, profile, version, and the managed entry-block hash.

## Instruction for agents

Yes: the operative instruction belongs in the agent entry file, not only in README. Deployment inserts a compact managed block that tells the agent to load the central rule only at a risky boundary. Routine structured reads and patch/editor operations do not need it.

The key behavior is mechanical: after the first quoting, parsing, encoding, or mojibake failure, stop trying variants and switch to the deterministic helper route.

## Main helpers

Run exact argv from a strict JSON spec:

```sh
node .agent-io-safety/skills/safe-shell-io/scripts/run-from-spec.mjs command.json
```

Run a strict UTF-8 Node script with data kept outside inline PowerShell code:

```sh
node .agent-io-safety/skills/safe-shell-io/scripts/run-node-utf8.mjs --spec node-task.json
```

Normalize a local Bash file to LF and stream it through SSH:

```sh
node .agent-io-safety/skills/safe-shell-io/scripts/remote-bash.mjs host script.sh
```

Read text and list non-ASCII paths without PowerShell text cmdlets:

```sh
node .agent-io-safety/skills/safe-text-io/scripts/read-text.mjs -- RULE.md
node .agent-io-safety/skills/safe-text-io/scripts/read-text.mjs --json -- RULE.md skills/safe-text-io/SKILL.md
node .agent-io-safety/skills/safe-text-io/scripts/list-paths.mjs --json --recursive --files -- .
```

Inspect or explicitly transform bytes:

```sh
node .agent-io-safety/skills/safe-text-io/scripts/inspect-text.mjs --fail-on-bom --eol lf -- .
node .agent-io-safety/skills/safe-text-io/scripts/transcode-text.mjs --input source --output target --bom none
node .agent-io-safety/skills/safe-text-io/scripts/replace-ascii-bytes.mjs --input legacy --in-place --search old --replace new --expect-count 1
```

All execution helpers use `shell: false`, strict validation, time/output bounds, or bounded streaming as appropriate.

## Hooks

Rules and skills guide agent reasoning; hooks enforce narrow command shapes before execution. Install `--profile full`, then copy the matching example:

```sh
cp .agent-io-safety/examples/cursor-hooks/hooks.json .cursor/hooks.json
cp .agent-io-safety/examples/codex-hooks/hooks.json .codex/hooks.json
```

Read [Cursor hook guidance](docs/cursor-hooks.md) or [Codex hook guidance](docs/codex-hooks.md) before relying on enforcement. Hook coverage depends on the host and intercepted tool surface.

## Diagnose an installation

```sh
node scripts/doctor.mjs --target /path/to/project
node scripts/doctor.mjs --target /path/to/project --external
node scripts/doctor.mjs --target /path/to/project --external-run
```

`--external` only detects relevant optional linters/scanners on `PATH`; `--external-run` explicitly executes bounded version/module checks. Missing optional tools are warnings.

## Project checks

```sh
npm test
npm run check:text
npm run check:localization
npm run check:skills
npm run check:release
npm run pack:dry-run
```

CI runs Node.js 18/20/22/24 on Linux, Windows, and macOS, plus a Windows PowerShell 5.1 smoke test.

## Documentation

- [Mechanism](00-MECHANISM.md) and [deployment](01-DEPLOYMENT.md)
- [Field notes](docs/field-notes.md) and [remote I/O recipes](docs/remote-io-recipes.md)
- [External tools](docs/external-tools.md) and [project-skill layering](docs/project-skills-layering.md)
- [Security policy](SECURITY.md) and [changelog](CHANGELOG.md)

English is canonical; maintained Russian files preserve the same installed paths through `--lang ru`.
