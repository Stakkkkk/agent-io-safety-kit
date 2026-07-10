# Deploying the mechanism

[Russian version](01-DEPLOYMENT.ru.md)

## Requirements

- Node.js 18 or newer.
- The root directory of the target project.
- The agent entry-file name. `AGENTS.md` is used by default.

## Preview

```text
node scripts/deploy.mjs --target <project-root> --entry AGENTS.md --dry-run
```

The command prints a plan and changes nothing.

## Install or update

```text
node scripts/deploy.mjs --target <project-root> --entry AGENTS.md
```

The installer:

1. copies the rule, skills, and version into `<project-root>/.agent-io-safety/`;
2. creates or replaces the managed block in the entry file;
3. preserves UTF-8 BOM and line-ending style of an existing entry file;
4. writes a manifest with SHA-256 hashes of managed files;
5. does not delete unknown files in the destination directory.

If a managed copy was edited by hand, an update stops. After reviewing the change, restore the canonical version with:

```text
node scripts/deploy.mjs --target <project-root> --entry AGENTS.md --force
```

## Entry-file text normalization

By default, the installer preserves UTF-8 BOM and line-ending style of an existing entry file.

To explicitly normalize only the entry file to UTF-8 without BOM and LF:

```text
node scripts/deploy.mjs --target <project-root> --entry AGENTS.md --fix-entry-text
```

This option does not rewrite other project files.

## Language

English is the canonical language:

```text
node scripts/deploy.mjs --target <project-root> --entry AGENTS.md --lang en
```

Russian localized instructions can be installed with:

```text
node scripts/deploy.mjs --target <project-root> --entry AGENTS.md --lang ru
```

The destination layout is the same for both languages: the installed rule is still `.agent-io-safety/RULE.md`, and referenced skills keep their canonical paths. The manifest records the selected language.

## Installed helpers

The managed copy includes safe text helpers such as `skills/safe-text-io/scripts/read-text.mjs`, `skills/safe-text-io/scripts/list-paths.mjs`, and `skills/safe-text-io/scripts/inspect-text.mjs`. Use `list-paths.mjs` when terminal output corrupts non-ASCII file names in listings.

## Check an installed copy

```text
node scripts/deploy.mjs --target <project-root> --entry AGENTS.md --check
```

The exit code is non-zero if the managed snippet is missing, managed files differ, or the installed version/language is out of date.

More detailed diagnostics:

```text
node scripts/doctor.mjs --target <project-root> --entry AGENTS.md
```

`doctor` checks Node.js, the entry file, managed markers, `MANIFEST.json`, version, language, SHA-256 hashes, and basic text validity.

Optional external-tool recommendations:

```text
node scripts/doctor.mjs --target <project-root> --entry AGENTS.md --external
```

Missing external tools produce warnings, not errors. See `docs/external-tools.md`.

## Managed snippet

Templates live in `snippets/`. The installer replaces `{{RULE_PATH}}` with a relative path from the entry file to the installed rule.

Managed block markers:

```text
<!-- agent-io-safety:begin -->
...
<!-- agent-io-safety:end -->
```

The block is safe to update by rerunning the installer. Manual text outside the markers is preserved.

## Other platforms

Pass the desired entry file through `--entry`:

```text
node scripts/deploy.mjs --target <project-root> --entry CLAUDE.md
node scripts/deploy.mjs --target <project-root> --entry GEMINI.md
node scripts/deploy.mjs --target <project-root> --entry .github/copilot-instructions.md
```

The installer chooses a matching template for `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, and Cursor rule files. A custom fragment can be passed explicitly:

```text
node scripts/deploy.mjs --target <project-root> --entry CLAUDE.md --fragment snippets/CLAUDE.md.fragment
```

If the platform supports native skills, `.agent-io-safety/skills/` can also be registered with it. This can improve automatic triggering, but it is not required.

## Command spec schema

Command specs can use:

```text
schemas/command-spec.schema.json
```

Add it through `$schema` so editors can detect structural errors before `run-from-spec.mjs` runs.

## Updating the kit itself

1. Change the canonical rule, skills, scripts, docs, or snippets.
2. Run `node tests/run-tests.mjs`.
3. Run `node skills/safe-text-io/scripts/inspect-text.mjs --all-files --fail-on-bom --eol lf --ps51-safe .`.
4. Update `VERSION` and `CHANGELOG.md` if preparing a release.
5. Run `--dry-run`, then deploy normally into target projects.
