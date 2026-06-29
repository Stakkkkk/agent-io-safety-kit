# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

Nothing yet.

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
