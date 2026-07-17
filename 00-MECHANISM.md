# Agent I/O Safety mechanism

[Russian version](00-MECHANISM.ru.md)

## Purpose

This kit prevents recurring failures around quotes, shell escaping, encodings, BOM, line endings, and structured data transport. It is not tied to a specific project or agent platform.

## Components

1. **Managed entry-file snippet** — a short controlled block in `AGENTS.md`, `CLAUDE.md`, or another agent entry file. It stays small and points the agent to the central rule.
2. **Central rule `RULE.md`** — one policy for choosing safe command execution and text I/O paths.
3. **Skills** — detailed instructions loaded only for the relevant operation:
   - `safe-shell-io` for exact argument passing without accidental shell re-parsing;
   - `safe-text-io` for explicit encoding, BOM, and line-ending handling.
4. **Deterministic scripts** — reusable implementations for fragile operations that agents should not re-invent ad hoc.
5. **Installer** — idempotently deploys a compact `core` or complete `full` profile, creates or updates the managed snippet, detects drift, and safely uninstalls tracked files.
6. **Doctor** — checks the exact entry block, manifest/profile/version, managed files, text validity, and optional external-tool availability.
7. **Schema and examples** — make command specs editor-friendly and show common quoting/encoding cases.
8. **External tools guide** — connects the kit to mature linters, scanners, and validators without turning the core into a heavyweight meta-linter.

## Control flow

`entry instructions → managed snippet → central rule → relevant skill → deterministic script → doctor/result check`

Native skill discovery by a platform is not required. The central rule contains relative paths to `SKILL.md`, so an agent can read them as normal files. Native skill registration can be added on top as an optimization.

One compact fragment per maintained language lives in `snippets/`; it is independent of the entry filename. Custom fragments are explicit.

External tools run after I/O boundaries are stabilized. Their absence does not break the core mechanism; `doctor --external` detects them without execution and `--external-run` explicitly performs bounded checks.

## Why this saves tokens

- The normal context contains only a short entry-file snippet.
- The central rule is read only before the first matching risky shell/text boundary; routine structured reads and patch/editor operations do not load it.
- Case-specific details live in one of two skills.
- After the first quoting, parsing, or mojibake failure, the agent must switch to a deterministic argv/spec or byte-processing path.
- Repeated logic lives once in scripts.

## Guarantees and boundaries

The mechanism guarantees exact argv transfer when `shell: false` is used, strict UTF-8 validation, and controlled deployment. It does not guess legacy encodings and does not rewrite unknown text automatically.

Explicit project policy has priority over defaults. Higher-priority system and user instructions override this kit. Binary formats are outside text I/O.

## Lifecycle

The canonical version lives in this repository. Target projects receive a managed copy in `.agent-io-safety/`. Changes should be made in the canonical kit, tested, and then redeployed. Installed managed copies should not be edited by hand.
