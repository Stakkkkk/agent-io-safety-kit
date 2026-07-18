---
name: safe-shell-io
description: Execute external commands with exact argv semantics and without accidental shell re-parsing. Use when commands contain user-controlled text, non-ASCII characters, spaces in paths, nested quotes, shell metacharacters, JSON/YAML/SQL/regex payloads, multiline values, stdin/stdout text, or after any quoting, parsing, or command-encoding failure.
---

# Безопасный запуск команд

## Маршрут

1. Предпочитай native API/tool с массивом аргументов.
2. Для фиксированной простой команды используй один shell-слой и отдельные argv items.
3. Для пользовательских или сложных значений создай UTF-8 JSON spec и запусти `scripts/run-from-spec.mjs`.
4. После одной ошибки escaping/parsing перейди на маршрут 3; не перебирай комбинации кавычек.

Не собирай command string из данных, не используй `shell: true`, `eval` или `Invoke-Expression`. Ставь `--` перед позиционными данными, которые могут начинаться с `-`.

## Никакого inline-кода для реальных данных

Не используй `node -e`, `python -c`, `powershell -Command`, `cmd /c`, `bash -c` и аналоги для project files, structured data, regex, не-ASCII текста, config, environment или secrets. Используй проверенный script file, `scripts/run-from-spec.mjs` или `scripts/run-node-utf8.mjs --spec`.

Не редактируй secret-bearing output inline. Печатай только allowlisted metadata.

## Структурированный command spec

```json
{
  "command": "node",
  "args": ["script.mjs", "точный аргумент", "$5 & не-ASCII"],
  "cwd": ".",
  "stdin": "строка 1\nстрока 2\n",
  "timeoutMs": 30000,
  "maxOutputBytes": 16777216
}
```

```text
node <skill-dir>/scripts/run-from-spec.mjs <spec.json>
```

Runner отклоняет неизвестные поля, использует `shell: false`, ограничивает output/time, строго декодирует текст и атомарно пишет перенаправленный output. Необязательные поля описаны в `references/spec-format.md`.

## Node и PowerShell UTF-8 boundary

Храни код в strict UTF-8 `.mjs`, а данные — в argv/stdin/spec:

```text
node <skill-dir>/scripts/run-node-utf8.mjs --spec <spec.json>
```

Helper отклоняет invalid UTF-8, Markdown-as-script, inline eval flags, неизвестные поля, чрезмерный output и timeouts.

## Remote Bash boundary

Не собирай сложную SSH-команду в одну quoted string. Храни Bash в UTF-8 файле и запускай:

```text
node <skill-dir>/scripts/remote-bash.mjs <host> <script>
```

Helper проверяет локальный файл, нормализует CRLF/CR в LF, стримит ограниченный output и запускает `ssh <host> bash -s`. При необходимости используй `--print-normalized`, `--diagnose-ssh`, `--ssh`, повторяемый `--ssh-arg`, `--timeout-ms` и `--max-output-bytes`.

Не используй `ssh -n` внутри `rsync -e`. Локальный argv array не устраняет remote shell boundary. Долгие задачи запускай под remote supervision с логом и polling.

Считай Docker Go templates сложным remote syntax. Не помещай `docker inspect --format '{{...}}'` в inline PowerShell/SSH command; храни template в проверенном локальном Bash-файле и отправляй через `remote-bash.mjs`.

Перед остановкой контейнеров ради изменения ownership или каталогов bind mount выполни отдельный read-only preflight: проверь эффективные UID/GID контейнера, текущие ownership/modes на host и доступность non-interactive root/sudo. Не начинай `down`, backup/move, `mkdir`, `chown` или `chmod`, пока не пройдены все проверки. Если privilege недоступен, остановись и обратись к пользователю/админу. См. Docker-разделы в `../../docs/ru/remote-io-recipes.md` и preflight example в deployment-профиле `full`.

`../../docs/ru/field-notes.md` и `../../docs/ru/remote-io-recipes.md` читай только для подходящих remote/PowerShell кейсов.

## Проверка

Проверь exit status. Для рискованного маршрута используй канарейку с пробелом, обоими типами кавычек, `$`, `&`, backslash, newline и не-ASCII текстом. Если команда пишет текст, примени также `safe-text-io`.
