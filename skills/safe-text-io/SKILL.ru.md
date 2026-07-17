---
name: safe-text-io
description: Inspect, read, create, edit, validate, and transcode text with explicit encoding, BOM, and line-ending semantics. Use for non-ASCII text, generated files, PowerShell 5.1 scripts, mojibake, UTF-8/UTF-16/legacy encoding questions, BOM problems, newline normalization, or any file operation where shell defaults could alter bytes.
---

# Безопасный текстовый I/O

## Политика и маршрут

Выбирай формат по явному требованию пользователя, политике проекта, `.editorconfig`/`.gitattributes`/существующим байтам, затем UTF-8 без BOM и LF для нового текста.

Для обычной правки используй структурированный editor/patch. Не угадывай legacy-кодировку, не сохраняй replacement-decoded text и не полагайся на shell/PowerShell text defaults.

## Безопасное чтение текста

```text
node <skill-dir>/scripts/read-text.mjs [--] <path>
node <skill-dir>/scripts/read-text.mjs --json [--] <path> <path> ...
```

Reader принимает UTF-8 с BOM и без него, отклоняет UTF-16 BOM и invalid UTF-8. Несколько файлов требуют `--json` или явный `--concat`. Не используй `Get-Content` плюс inline `OutputEncoding` fixes.

## Безопасный листинг путей

```text
node <skill-dir>/scripts/list-paths.mjs --json --recursive --files -- <path>
```

Используй этот маршрут, когда terminal listing показывает mojibake/non-ASCII `????`. Искажение отображения не доказывает повреждение имён.

## Проверка

```text
node <skill-dir>/scripts/inspect-text.mjs -- <path> [<path> ...]
```

Полезные flags: `--fail-on-bom`, `--eol lf|crlf`, `--ps51-safe` и `--json`. Invalid UTF-8 и UTF-16 считаются ошибками.

## Явное транскодирование

```text
node <skill-dir>/scripts/transcode-text.mjs --input <source> --output <target> --source-encoding auto --target-encoding utf8 --bom none --eol preserve
```

Используй `--in-place` осознанно, `--check` для сравнения и `--force` только после проверки существующего target. Записи атомарны.

## Замена байтов без декодирования

Для ASCII-only правки в non-UTF-8 или unknown-файле:

```text
node <skill-dir>/scripts/replace-ascii-bytes.mjs --input <source> --in-place --search old --replace new --expect-count 1
```

Hex flags используй только для явных raw bytes. Helper не подходит для смысловых non-ASCII правок.

Для переносимых Windows PowerShell 5.1 scripts предпочитай ASCII-only; документируй и проверяй BOM-based исключения для не-ASCII. Полная матрица — в `references/encoding-policy.md`.

После записи снова запусти `inspect-text.mjs` и потребляющий инструмент.
