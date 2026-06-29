---
name: safe-shell-io
description: Execute external commands with exact argv semantics and without accidental shell re-parsing. Use when commands contain user-controlled text, non-ASCII characters, spaces in paths, nested quotes, shell metacharacters, JSON/YAML/SQL/regex payloads, multiline values, stdin/stdout text, or after any quoting, parsing, or command-encoding failure.
---

# Безопасный запуск команд

## Выбрать путь

1. Использовать нативный tool/API с массивом аргументов, если он доступен.
2. Для простой команды использовать один shell-слой, literal path и отдельные аргументы.
3. Для сложных или пользовательских значений создать JSON-spec и выполнить `scripts/run-from-spec.mjs`.

После первой ошибки escaping или парсинга немедленно перейти к пункту 3. Не тратить попытки на новые комбинации кавычек.

## Не допускать повторный парсинг

- Не собирать строку команды из пользовательских данных.
- Не вкладывать `powershell -Command`, `cmd /c`, `sh -c` или `bash -c` без необходимости.
- Не передавать JSON, SQL, regex или многострочный текст как фрагмент shell-синтаксиса.
- Для CLI tools с option parsing ставить `--` перед user-controlled positional values, которые могут начинаться с `-`; для `rg` используйте `rg -- "-pattern"` или `rg --fixed-strings -- "-literal"`.
- Не использовать `eval`, `Invoke-Expression` и `shell: true`.
- Не помещать секреты в диагностический вывод или spec, который будет сохранён в репозитории.

## Remote и PowerShell edge cases

Перед SSH, rsync, SFTP, remote shell, here-doc или долгими remote-операциями прочитайте `../../docs/ru/field-notes.md` и `../../docs/ru/remote-io-recipes.md`.

Применяйте эти правила маршрутизации:

- используйте `ssh -n` только когда SSH-процесс не должен читать stdin родительского процесса; не кладите `ssh -n` внутрь `rsync -e`;
- не передавайте переводы строк как `\n` через PowerShell/SSH quoting; repeated fixed `echo` допустим только для маленького fixed text, иначе загружайте/стримьте данные или используйте JSON/Base64;
- для сложных remote scripts загружайте script file, передавайте байты через stdin или передавайте данные файлом/Base64 payload вместо многоуровневых here-doc strings;
- для долгих SSH/rsync-задач предпочитайте remote supervision + log + polling, а не привязку процесса к локальному клиенту;
- для PowerShell ranges прочитайте `../../examples/powershell-select-object.md` и используйте `-Index (94..112)` или `-Skip/-First`;
- для PowerShell/SSH newline escapes прочитайте `../../examples/powershell-ssh-newlines.md`;
- перед встраиванием скрипта в строку host-языка прочитайте `../../examples/remote-script-boundaries.md`.

## Запустить через spec

Создать spec структурированным редактором или patch API в UTF-8 без BOM:

```json
{
  "command": "node",
  "args": ["script.mjs", "Денис: \"точный аргумент\"", "$5 & 10%"],
  "cwd": ".",
  "stdin": "строка 1\nстрока 2\n",
  "stdoutEncoding": "utf8",
  "stderrEncoding": "utf8",
  "timeoutMs": 30000
}
```

Выполнить:

```text
node <skill-dir>/scripts/run-from-spec.mjs <spec.json>
```

Runner использует `spawn` с `shell: false`, передаёт каждый элемент `args` отдельно и строго декодирует текстовый stdout/stderr. Относительные `cwd` и файловые поля разрешаются от каталога spec.

Полную схему читать в `references/spec-format.md` только при использовании дополнительных полей.

## Проверить

Проверить код возврата процесса. Для рискованного пути прогнать канарейку с пробелом, одинарной и двойной кавычкой, `$`, `&`, обратным слешем, переводом строки и не-ASCII символом. Если команда пишет текстовый файл, дополнительно применить `safe-text-io`.
