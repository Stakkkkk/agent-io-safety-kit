# Encoding matrix

## New text without project policy

- Encoding: UTF-8.
- BOM: none.
- Line endings: LF.
- Write method: patch API, structured editor, or deterministic Node.js script.

## Existing text

1. Check BOM and strict UTF-8 validity.
2. Check `.editorconfig`, `.gitattributes`, and project instructions.
3. Preserve confirmed encoding and line endings unless the task requires conversion.
4. If a legacy encoding is unknown, do not modify the file until an explicit choice is made.

## PowerShell

| Environment | Safe `.ps1` source |
|---|---|
| PowerShell 7+ | UTF-8 without BOM |
| Windows PowerShell 5.1, ASCII-only | UTF-8 without BOM |
| Windows PowerShell 5.1, contains non-ASCII | UTF-8 BOM as an explicit exception |

Native program output, `$OutputEncoding`, console code page, and file encoding are separate boundaries. Changing one of them does not automatically fix the others.

## Forbidden automatic actions

- Do not identify CP1251/CP866 only because the result “looks right”.
- Do not save text after decoding with `�`.
- Do not remove BOMs in bulk without checking the consumer.
- Do not normalize all line endings without a project requirement.
- Do not treat a binary file as text because of its extension.
