# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- Nothing yet.

## 0.2.0 - 2026-07-17

- Added compact `core` and complete `full` deployment profiles; `core` is now the default.
- Added tracked, conflict-aware `--uninstall` and atomic writes for managed files and helper outputs.
- Made `doctor` verify exact managed entry blocks, deployment profiles, and schema-v2 manifests; split external checks into detect-only `--external` and explicit execution with `--external-run`.
- Added shared text, process, deployment, and shell-policy modules to remove duplicated safety logic.
- Hardened command specs with unknown-field rejection, output/time limits, distinct output targets, strict decoding, and atomic redirected output.
- Hardened `run-node-utf8.mjs` against invalid script bytes, Markdown-as-script mistakes, inline eval flags, unknown fields, timeouts, and excessive output.
- Added bounded streaming, timeouts, `--` parsing, missing-script diagnostics, and explicit SSH environment diagnostics to `remote-bash.mjs`.
- Added a shared shell command policy, a thin Cursor adapter, and a Codex `PreToolUse` adapter; both default to strict deny behavior for review findings.
- Added `--` path terminators, unambiguous multi-file reads, and exact replacement-count assertions to text helpers.
- Reduced RULE/SKILL context size and made loading conditional on risky boundaries.
- Consolidated duplicate entry snippets into one English and one Russian template.
- Added release-metadata, localization-structure, and dependency-free skill checks, SHA-pinned GitHub Actions, macOS CI, and Windows PowerShell 5.1 smoke coverage.
- Added Cursor hook blocking for accidental `node *.md` execution and documented persistent JavaScript REPL name collisions.
- Added field-tested SSH authentication, PowerShell quoting, UTF-8 path, remote script, and secret-output guidance.

## 0.1.8 - 2026-07-10

- Added `safe-text-io/scripts/list-paths.mjs` for UTF-8 path listings through terminal/tool boundaries.
- Documented the Windows/PowerShell `rg --files` mojibake path-listing route.

## 0.1.7 - 2026-07-06

- Added hard routing rules for inline interpreter one-liners around config/env/secrets.
- Added Cursor hook detection for risky inline interpreter one-liners.

## 0.1.6 - 2026-07-02

- Added `run-node-utf8.mjs` and `remote-bash.mjs` helpers for Windows/PowerShell UTF-8 and SSH boundaries.
- Added field notes for PowerShell → Node literals, Windows CRLF into remote Bash, complex SSH command strings, remote-shell argv limits, Bash `set -u` with nginx-style `$...` variables, mojibake in filename output, and secret redaction.
- Added hook guidance for Bash nounset with `$...` inside double quotes.

## 0.1.5 - 2026-07-01

- Added `safe-text-io/scripts/read-text.mjs` for strict UTF-8 reads through terminal/tool boundaries.
- Documented that Windows agents must not fix terminal mojibake with inline PowerShell encoding commands; use `read-text.mjs`.

## 0.1.4 - 2026-06-29

- Added a ripgrep recipe for patterns that start with `-`, requiring `rg -- "-pattern"`.
- Added Cursor hook review for obvious `rg "-pattern"` commands without `--`.

## 0.1.3 - 2026-06-29

- Added a PowerShell + SSH newline escaping recipe for `\n` sequences that can degrade into `n...n` output.
- Added optional Cursor Hooks documentation and a dependency-free `beforeShellExecution` example hook.
- Added optional Codex Hooks documentation for using hooks as an enforcement layer around the kit.
- Routed agents from the central rule and safe-shell skill to the new newline and hooks guidance.
- Added tests for the Cursor hook example and deployed hook/newline docs.

## 0.1.2 - 2026-06-29

- Added field notes for real shell/text/remote I/O traps.
- Added remote I/O recipes for SSH, rsync, here-doc, SFTP rename, and long-running remote operations.
- Added PowerShell `Select-Object -Index` and remote script boundary examples.
- Added `safe-text-replace-ascii-bytes` for ASCII-safe byte replacement in non-UTF-8 or unknown-encoding files.
- Added explicit agent routing from the central rule and safe-shell skill to the new recipes and examples.
- Included `docs/` and `examples/` in deployed `.agent-io-safety/` copies so referenced recipes are available to target agents.
- Documented floating Docker tag migration risk.

## 0.1.1 - 2026-06-29

- Added explicit `deploy --fix-entry-text` mode for entry-file UTF-8-no-BOM/LF normalization.
- Added non-fatal `doctor` warnings for entry-file UTF-8 BOM and mixed line endings.
- Added a Windows + PowerShell + SSH example for the local argv / remote shell boundary.
- Documented how Agent I/O Safety Kit layers with existing project/domain skills.
- Changed the release workflow to publish notes for the tagged changelog section only.

## 0.1.0 - 2026-06-28

Initial public release.

- Added central shell/text I/O safety rule.
- Added `safe-shell-io` and `safe-text-io` skills.
- Added deterministic command runner, text inspector, and transcoder.
- Added idempotent deployer with manifest drift detection.
- Added tests, CI, README, license, and npm package metadata.
- Made English the canonical project language.
- Added maintained Russian localization files.
- Added `--lang en|ru` deployment support.
- Added localization checks to tests.
