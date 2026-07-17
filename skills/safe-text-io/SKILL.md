---
name: safe-text-io
description: Inspect, read, create, edit, validate, and transcode text with explicit encoding, BOM, and line-ending semantics. Use for non-ASCII text, generated files, PowerShell 5.1 scripts, mojibake, UTF-8/UTF-16/legacy encoding questions, BOM problems, newline normalization, or any file operation where shell defaults could alter bytes.
---

# Safe text I/O

## Policy and route

Choose format by explicit user requirement, project policy, `.editorconfig`/`.gitattributes`/existing bytes, then UTF-8 without BOM and LF for new text.

Use a structured editor/patch for normal edits. Never guess a legacy encoding, save replacement-decoded text, or rely on shell/PowerShell text defaults.

## Read text safely

```text
node <skill-dir>/scripts/read-text.mjs [--] <path>
node <skill-dir>/scripts/read-text.mjs --json [--] <path> <path> ...
```

The reader accepts UTF-8 with/without BOM and rejects UTF-16 BOM or invalid UTF-8. Multiple files require `--json` or explicit `--concat`. Do not use `Get-Content` plus inline `OutputEncoding` fixes.

## List paths safely

```text
node <skill-dir>/scripts/list-paths.mjs --json --recursive --files -- <path>
```

Use this when terminal listings show mojibake/non-ASCII `????`. Display corruption is not proof of damaged names.

## Inspect

```text
node <skill-dir>/scripts/inspect-text.mjs -- <path> [<path> ...]
```

Useful flags: `--fail-on-bom`, `--eol lf|crlf`, `--ps51-safe`, and `--json`. Invalid UTF-8 and UTF-16 are errors.

## Transcode explicitly

```text
node <skill-dir>/scripts/transcode-text.mjs --input <source> --output <target> --source-encoding auto --target-encoding utf8 --bom none --eol preserve
```

Use `--in-place` deliberately, `--check` for comparison, and `--force` only after reviewing an existing target. Writes are atomic.

## Replace bytes without decoding

For an ASCII-only edit in a non-UTF-8 or unknown file:

```text
node <skill-dir>/scripts/replace-ascii-bytes.mjs --input <source> --in-place --search old --replace new --expect-count 1
```

Use hex flags only for explicit raw bytes. Do not use this helper for semantic non-ASCII edits.

For portable Windows PowerShell 5.1 scripts, prefer ASCII-only; document and verify any BOM-based non-ASCII exception. See `references/encoding-policy.md` for the full matrix.

After writing, rerun `inspect-text.mjs` and the consuming tool.
