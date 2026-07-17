# Deployment

## Requirements

Node.js 18+, a target project root, and an agent entry filename (`AGENTS.md` by default).

## Preview, install, update

```text
node scripts/deploy.mjs --target <project-root> --dry-run
node scripts/deploy.mjs --target <project-root>
node scripts/deploy.mjs --target <project-root> --check
```

Deployment writes `.agent-io-safety/`, inserts/replaces one managed block in the entry file, and records schema-v2 `MANIFEST.json` hashes. Re-running the same command is idempotent.

Managed files are written through same-directory temporary files and atomic rename. Existing entry-file BOM/EOL are preserved unless `--fix-entry-text` explicitly requests UTF-8 without BOM and LF.

If a managed file changed locally, update/check stops. Review it before using `--force`.

## Profiles and language

```text
node scripts/deploy.mjs --target <project-root> --profile core --lang en
node scripts/deploy.mjs --target <project-root> --profile core --lang ru
node scripts/deploy.mjs --target <project-root> --profile full --lang en
```

- `core` (default): central rule, selected-language docs, both skills, and runtime helpers;
- `full`: core plus all examples, hook adapters, and both documentation trees.

Localized rules/skills keep canonical installed paths such as `.agent-io-safety/RULE.md` and `.agent-io-safety/skills/.../SKILL.md`.

## Entry and fragment

```text
node scripts/deploy.mjs --target <project-root> --entry CLAUDE.md
node scripts/deploy.mjs --target <project-root> --entry .github/copilot-instructions.md
node scripts/deploy.mjs --target <project-root> --entry CUSTOM.md --fragment <fragment-file>
```

All entry names use the same compact language-specific fragment by default. A custom fragment must contain the managed markers and may use `{{RULE_PATH}}`, `{{RULE_FILE_PATH}}`, and `{{READ_TEXT_PATH}}`.

Manual text outside these markers is preserved:

```text
<!-- agent-io-safety:begin -->
...
<!-- agent-io-safety:end -->
```

The manifest records the exact rendered block hash. `doctor` detects malformed, duplicated, or modified blocks.

## Safe uninstall

```text
node scripts/deploy.mjs --target <project-root> --uninstall --dry-run
node scripts/deploy.mjs --target <project-root> --uninstall
```

Uninstall requires a valid manifest. It removes only tracked files and the managed entry block, preserves unknown files, and refuses modified tracked files unless `--force` is explicitly used.

## Doctor

```text
node scripts/doctor.mjs --target <project-root>
node scripts/doctor.mjs --target <project-root> --lang auto --profile auto
node scripts/doctor.mjs --target <project-root> --external
node scripts/doctor.mjs --target <project-root> --external-run
```

Doctor verifies Node.js, manifest structure, version/language/profile, exact managed block, managed hashes, and strict text validity.

`--external` is detect-only: it scans project file types and resolves relevant optional tools on `PATH` without executing them. `--external-run` explicitly runs bounded version/module checks. Missing external tools are warnings.

## Distribution

From a tagged GitHub package:

```text
npx --yes --package github:Stakkkkk/agent-io-safety-kit#v0.2.0 agent-io-safety-kit --target <project-root>
```

From a downloaded release asset:

```text
npx --yes --package ./agent-io-safety-kit-0.2.0.tgz agent-io-safety-kit --target <project-root>
```

The public npm registry is not currently the canonical distribution channel. Release assets include a SHA-256 file.

## Maintainer verification

```text
npm test
npm run check:text
npm run check:localization
npm run check:skills
npm run check:release
npm run pack:dry-run
```

For a tag, run `node scripts/check-release.mjs --tag vX.Y.Z` before pushing it.
