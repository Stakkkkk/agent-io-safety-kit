# Правило безопасного shell и текстового I/O

## Загружать только на рискованной границе

Перед первой подходящей операцией прочитай skill относительно этого файла:

- `skills/safe-shell-io/SKILL.md`, если команда содержит пользовательские/проектные данные, не-ASCII текст, пробелы, вложенные кавычки, shell-метасимволы, структурированные данные, regex, многострочный ввод, удалённое выполнение или секреты;
- `skills/safe-text-io/SKILL.md`, если важны кодировка, BOM, окончания строк, отображение текста в терминале, не-ASCII пути, транскодирование или неизвестные байты;
- оба skill, если команда генерирует или переносит текст.

Обычные структурированные чтения и правки через patch/editor без shell- или encoding-границы не требуют повторной загрузки skills.

## Механические маршруты

1. Предпочитай нативные API/tools и структурированные редакторы. Для простой команды используй один shell-слой и отдельные аргументы.
2. Не интерполируй пользовательские/проектные данные в command string, regex, JSON или script. Сложный argv положи в UTF-8 JSON spec и запусти `safe-shell-io/scripts/run-from-spec.mjs`.
3. Считай `node -e`, `python -c`, `powershell -Command`, `cmd /c`, `bash -c` и похожие inline interpreters небезопасными, если они затрагивают файлы, структурированные данные, не-ASCII текст, regex, config, environment или secrets. Используй проверенный script file/spec. Узкое исключение — фиксированная ASCII-диагностика вроде `node --version`.
4. Не редактируй секреты inline. Безопасно парси и печатай только allowlisted metadata: наличие ключей, counts, hosts, имена секций или форму auth, но не значения.
5. Читай UTF-8 инструкции через terminal boundary с `safe-text-io/scripts/read-text.mjs`; не запускай Markdown через Node и не чини PowerShell output inline-командами `OutputEncoding`.
6. Если CLI-листинг показывает mojibake в именах файлов, проверь пути через `safe-text-io/scripts/list-paths.mjs`; искажение отображения не доказывает повреждение байтов filesystem.
7. Ставь `--` перед пользовательскими позиционными аргументами, которые могут начинаться с `-`; для ripgrep используй `rg -- "-pattern"` или `rg --fixed-strings -- "-literal"`.
8. Не передавай сложные SSH-команды, scripts, pipes, regex, `$` или newline escapes через много слоёв quoting. Используй script/file/spec; для Windows-to-Bash — `safe-shell-io/scripts/remote-bash.mjs`.
9. Перед Docker/storage изменениями, которым могут понадобиться повышенные права для ownership или mode, полностью выполни read-only preflight прав и UID/GID до `docker compose down`, переноса данных или пересоздания bind-mount путей. Если non-interactive privilege недоступен, остановись до изменения состояния.
10. После первой ошибки quoting, parsing, encoding или mojibake прекрати перебор вариантов и перейди на детерминированный helper-маршрут.

## Политика текста

Выбирай формат в таком порядке: явное требование пользователя, политика проекта, `.editorconfig`/`.gitattributes`/существующие байты, затем UTF-8 без BOM и LF для нового текста.

Не угадывай legacy-кодировку и не сохраняй текст, декодированный с replacement characters. Для ASCII-only изменения в non-UTF-8 или unknown-файле используй `safe-text-io/scripts/replace-ascii-bytes.mjs` с ожидаемым числом замен.

## Замечания по платформам

- Текстовые defaults Windows PowerShell 5.1 непереносимы. Предпочитай ASCII-only `.ps1`; если нужен не-ASCII, документируй и проверяй BOM-based исключение.
- `ssh -n` полезен только когда SSH не должен читать parent stdin; никогда не помещай его внутрь `rsync -e`.
- Persistent JavaScript REPL сохраняет top-level имена. Для проб используй новые имена/`var`, для повторяемой работы — script/spec.
- Долгую удалённую работу запускай под remote supervision с логом и polling.

## Проверка и ссылки

Проверь изменённый текст через `safe-text-io/scripts/inspect-text.mjs`, коды возврата и рискованные пути с пробелами, кавычками, `$`, переводом строки и не-ASCII текстом.

Подробные материалы читай только по необходимости:

- `docs/ru/field-notes.md` — практические ловушки;
- `docs/ru/remote-io-recipes.md` — SSH/rsync/SFTP/remote jobs;
- `docs/ru/external-tools.md` — необязательные линтеры и сканеры;
- `docs/ru/project-skills-layering.md` — совместная работа с предметными skills;
- `docs/ru/cursor-hooks.md` и `docs/ru/codex-hooks.md` — механическое enforcement.
