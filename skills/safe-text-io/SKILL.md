---
name: safe-text-io
description: Inspect, read, create, edit, validate, and transcode text with explicit encoding, BOM, and line-ending semantics. Use for non-ASCII text, generated files, PowerShell 5.1 scripts, mojibake, UTF-8/UTF-16/legacy encoding questions, BOM problems, newline normalization, or any file operation where shell defaults could alter bytes.
---

# Safe text I/O

## Determine policy

Choose the format in this priority order:

1. explicit user requirement;
2. project instructions;
3. `.editorconfig`, `.gitattributes`, tool configuration, and existing file bytes;
4. for new text without policy — UTF-8 without BOM and LF.

Do not guess legacy encodings. Do not decode with replacement characters and save the result over the source.

## Choose the operation

- For normal edits, use a structured editor or patch API.
- For diagnostics, run `scripts/inspect-text.mjs`.
- For explicit transcoding, run `scripts/transcode-text.mjs`.
- For ASCII-only edits in non-UTF-8 or unknown-encoding files, run `scripts/replace-ascii-bytes.mjs`.
- For commands that generate text, also apply `safe-shell-io` and specify stdout encoding.

Do not use shell redirection, `Set-Content`, `Out-File`, `echo`, or implicit `Get-Content` unless their exact byte semantics are verified for the current shell version.

## Inspect files

Inspect one file or directory:

```text
node <skill-dir>/scripts/inspect-text.mjs <path> [<path> ...]
```

Useful strict flags:

- `--fail-on-bom` — forbid any BOM;
- `--eol lf|crlf` — check line endings;
- `--ps51-safe` — require ASCII-only or UTF-8 BOM for PowerShell 5.1 files;
- `--json` — return a machine-readable report.

Invalid UTF-8 and UTF-16 are always errors. Binary files are skipped.

## Transcode explicitly

```text
node <skill-dir>/scripts/transcode-text.mjs --input <source> --output <target> --source-encoding auto --target-encoding utf8 --bom none --eol preserve
```

Do not overwrite an existing target without `--force`. To modify the source in place, pass `--in-place` and do not pass `--output`. For a comparison-only check, add `--check`.

Read `references/encoding-policy.md` when working with PowerShell, UTF-16, or an existing project policy.

## Replace ASCII bytes without decoding

If a file fails strict UTF-8 inspection but the required edit is only an ASCII byte sequence, avoid whole-file decoding. Use the byte replacement tool:

```text
node <skill-dir>/scripts/replace-ascii-bytes.mjs --input <source> --output <target> --search old/ascii --replace new/ascii
```

Use `--in-place` only when you intentionally want to modify the source. Use `--search-hex` / `--replace-hex` for explicit byte sequences. Do not use this tool for non-ASCII semantic edits.

## PowerShell 5.1

For portable `.ps1` files, prefer ASCII-only UTF-8 without BOM. If a script must contain non-ASCII text and run in Windows PowerShell 5.1, use UTF-8 BOM as an explicitly documented exception. Do not generalize this exception to other files.

After writing, rerun `inspect-text.mjs` on affected files and run the consuming tool.
