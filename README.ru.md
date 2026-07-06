# Agent I/O Safety Kit

Языки: [English](README.md) | [Русский](README.ru.md)

Небольшой переносимый комплект правил, skills и Node.js-скриптов, который помогает агентам не ломать данные на кавычках, shell-экранировании, кодировках, BOM и окончаниях строк.

Проект полезен там, где AI-агент регулярно:

- запускает команды с пользовательским текстом, путями с пробелами, кавычками, shell-метасимволами, JSON/YAML/SQL/regex или не-ASCII символами;
- читает, создаёт или преобразует текстовые файлы;
- работает в Windows/PowerShell и рискует получить mojibake;
- теряет время на повторные попытки “подобрать кавычки”.

## Что внутри

- `RULE.md` — центральная политика безопасного shell и текстового I/O.
- `skills/safe-shell-io` — инструкция и helpers для точного `argv`, UTF-8 Node runs и remote Bash execution.
- `skills/safe-text-io` — инструкция и утилиты для безопасного чтения, проверки, преобразования и ASCII-safe byte replacement в текстовых/legacy-файлах.
- `schemas/command-spec.schema.json` — JSON Schema для command spec.
- `scripts/deploy.mjs` — идемпотентный установщик в целевой проект.
- `scripts/doctor.mjs` — диагностика установленной копии.
- `snippets/` — управляемые фрагменты инструкций для разных агентских entry-файлов.
- `examples/` — маленькие примеры для копирования.
- `docs/ru/external-tools.md` — опциональные интеграции со зрелыми линтерами, сканерами и валидаторами.
- `docs/ru/language-policy.md` — почему ядро остаётся dependency-free Node.js.
- `docs/ru/localization.md` — как поддерживаются английские canonical-файлы и русская локализация.
- `docs/ru/project-skills-layering.md` — как использовать kit рядом с существующими project/domain skills.
- `docs/ru/field-notes.md` — реальные ловушки shell/text/remote I/O, замеченные в работе агентов.
- `docs/ru/remote-io-recipes.md` — безопасные паттерны для SSH, rsync, here-doc, SFTP и долгих remote-задач.
- `docs/ru/cursor-hooks.md` — optional enforcement-слой через Cursor Hooks.
- `docs/ru/codex-hooks.md` — optional enforcement-слой через Codex Hooks.
- `tests/run-tests.mjs` — самодостаточный тестовый набор без внешних зависимостей.

Подробное описание механизма: [`00-MECHANISM.ru.md`](00-MECHANISM.ru.md). Инструкция по развёртыванию: [`01-DEPLOYMENT.ru.md`](01-DEPLOYMENT.ru.md).

## Языковая политика

Английский — канонический язык файлов проекта, GitHub/npm metadata, правил, skills, snippets, docs и examples. Русский поддерживается как полноценная локализация:

- `README.ru.md`
- `00-MECHANISM.ru.md`
- `01-DEPLOYMENT.ru.md`
- `RULE.ru.md`
- `skills/**/SKILL.ru.md`
- `skills/**/references/*.ru.md`
- `docs/ru/`

Установщик может развернуть любой язык, сохраняя одинаковые целевые пути:

```sh
node scripts/deploy.mjs --target /path/to/project --entry AGENTS.md --lang en
node scripts/deploy.mjs --target /path/to/project --entry AGENTS.md --lang ru
```

## Требования

- Node.js 18 или новее.
- Целевой проект, куда нужно добавить управляемую копию `.agent-io-safety/`.

Внешние npm-зависимости не требуются.

## Быстрый старт

Предварительно посмотреть план установки:

```sh
node scripts/deploy.mjs --target /path/to/project --entry AGENTS.md --dry-run
```

Установить или обновить комплект:

```sh
node scripts/deploy.mjs --target /path/to/project --entry AGENTS.md
```

Установить русскую локализованную инструкцию для агента:

```sh
node scripts/deploy.mjs --target /path/to/project --entry AGENTS.md --lang ru
```

Явно нормализовать entry-файл при развёртывании:

```sh
node scripts/deploy.mjs --target /path/to/project --entry AGENTS.md --fix-entry-text
```

Этот флаг удаляет UTF-8 BOM из entry-файла и нормализует окончания строк к LF. Он включается только явно, потому что default-установщик по возможности сохраняет существующие байты entry-файла.

Проверить установленную копию:

```sh
node scripts/deploy.mjs --target /path/to/project --entry AGENTS.md --check
node scripts/doctor.mjs --target /path/to/project --entry AGENTS.md
node scripts/doctor.mjs --target /path/to/project --entry AGENTS.md --external
```

По умолчанию установщик создаёт или обновляет управляемый блок в `AGENTS.md` и копирует комплект в `.agent-io-safety/`.

## Инструкция для агента

Операционную инструкцию нужно помещать в агентский entry-файл. README может документировать политику, но именно entry-файл агент должен прочитать и выполнить. Главное правило: не подбирать кавычки или кодировки повторными попытками, а после первой проблемы переходить к детерминированному пути.

Минимальный текст для агентского entry-файла в корне проекта:

```md
## Безопасность shell и текстового I/O

Перед первой операцией, которая использует shell, читает или записывает текст, передаёт пользовательские значения, пути, JSON/YAML/SQL/regex, не-ASCII символы, кодировки, BOM или окончания строк, прочитай и соблюдай `.agent-io-safety/RULE.md`.

Если нужно читать rule или skills через terminal output на Windows/PowerShell, используй `node .agent-io-safety/skills/safe-text-io/scripts/read-text.mjs .agent-io-safety/RULE.md` вместо `Get-Content` или inline fixes через `[Console]::OutputEncoding`.

Прочитай указанный skill-файл перед соответствующей операцией:

- `.agent-io-safety/skills/safe-shell-io/SKILL.md` — для сложных команд, пользовательских значений, кавычек, shell-метасимволов, структурированных payload, stdin/stdout или ошибок command-encoding.
- `.agent-io-safety/skills/safe-text-io/SKILL.md` — для текстовых файлов, UTF-8/UTF-16, BOM, окончаний строк, PowerShell 5.1 или mojibake.

Не исправляй quoting или mojibake повторными пробами. После первой ошибки используй детерминированный script/spec-путь из skill.
```

Установщик использует более короткие управляемые фрагменты из [`snippets/`](snippets/), чтобы корневая инструкция оставалась компактной.

## Поддерживаемые entry-файлы

Один и тот же механизм можно установить в разные агентские файлы:

```sh
node scripts/deploy.mjs --target /path/to/project --entry AGENTS.md
node scripts/deploy.mjs --target /path/to/project --entry CLAUDE.md
node scripts/deploy.mjs --target /path/to/project --entry GEMINI.md
node scripts/deploy.mjs --target /path/to/project --entry .github/copilot-instructions.md
```

Готовые ручные фрагменты лежат в [`snippets/`](snippets/).

## Проверки комплекта

```sh
npm test
npm run check:text
```

То же самое без npm:

```sh
node tests/run-tests.mjs
node skills/safe-text-io/scripts/inspect-text.mjs --all-files --fail-on-bom --eol lf --ps51-safe .
```

После установки комплекта в целевой проект:

```sh
npm run doctor -- --target /path/to/project --entry AGENTS.md
npm run doctor -- --target /path/to/project --entry AGENTS.md --external
```

`--external` только сообщает об опциональных сторонних инструментах. Отсутствующие инструменты дают предупреждения, а не ошибки.

## Пример: безопасный запуск команды

Создайте JSON-spec в UTF-8 без BOM:

```json
{
  "command": "node",
  "args": ["script.mjs", "Денис: \"точный аргумент\"", "$5 & 10%"],
  "cwd": ".",
  "stdin": "строка 1\nстрока 2\n",
  "stdoutEncoding": "utf8",
  "stderrEncoding": "utf8"
}
```

Запустите:

```sh
node skills/safe-shell-io/scripts/run-from-spec.mjs command.json
```

Runner использует `spawn` с `shell: false` и передаёт каждый аргумент отдельно.

Не читайте, не редактируйте и не преобразуйте config/env/secrets через inline interpreter one-liners вроде `node -e`, `python -c`, `powershell -Command`, `cmd /c`, `bash -c` или `sh -c`. Если команда трогает `.env`, TOML/JSON/YAML config, tokens, `Authorization`, `Bearer`, regex, `$`, вложенные кавычки или non-ASCII значения, используйте native tool/API, script file, `run-from-spec.mjs`, `run-node-utf8.mjs --spec` или `node_repl`, а в вывод печатайте только allowlisted metadata.

Для Node.js задач, где non-ASCII данные проходят через Windows/PowerShell boundary, держите код в script file и передавайте данные через UTF-8 JSON spec:

```sh
node skills/safe-shell-io/scripts/run-node-utf8.mjs --spec node-task.json
```

Для Bash, отправляемого из Windows в SSH, нормализуйте LF и стримьте script через stdin:

```sh
node skills/safe-shell-io/scripts/remote-bash.mjs host script.sh
```

## Пример: проверка текста

Безопасно прочитать Markdown, JSON, rules или skills через terminal/tool boundary:

```sh
node skills/safe-text-io/scripts/read-text.mjs RULE.md skills/safe-text-io/SKILL.md
```

Reader принимает UTF-8 с BOM и без BOM, отклоняет невалидный UTF-8 и UTF-16 BOM, пишет UTF-8 bytes в stdout. Windows-агенты не должны чинить terminal mojibake inline PowerShell encoding-командами вроде `[Console]::OutputEncoding` или `[System.Text.UTF8Encoding]::new($false)`; используйте `read-text.mjs`.

```sh
node skills/safe-text-io/scripts/inspect-text.mjs --fail-on-bom --eol lf README.md
```

Утилита строго проверяет UTF-8, BOM, окончания строк, подозрительный UTF-16 без BOM и PowerShell 5.1-совместимость для `.ps1/.psd1/.psm1`.

## Пример: ASCII-safe byte replacement

Если файл не является валидным UTF-8, но нужная правка затрагивает только ASCII-байты, не декодируйте файл с replacement characters. Заменяйте сырые ASCII-последовательности:

```sh
node skills/safe-text-io/scripts/replace-ascii-bytes.mjs --input legacy.sh --in-place --search old/path --replace new/path
```

Так сохраняются все нецелевые байты. Для не-ASCII изменений нужен явный выбор кодировки, а не эта утилита.

## Гарантии и границы

Комплект помогает сделать хрупкие операции детерминированными:

- точная передача аргументов через `argv`;
- строгая проверка UTF-8 вместо тихой замены повреждённых символов;
- явная политика BOM и окончаний строк;
- безопасное обновление управляемой копии с проверкой SHA-256;
- symlink-aware запись при развёртывании.

Он не угадывает legacy-кодировки, не лечит mojibake автоматически, не обрабатывает бинарные форматы как текст и не заменяет системные/пользовательские инструкции более высокого приоритета.

## Внешние инструменты

Комплект не пытается заменить зрелые линтеры и сканеры. Он определяет safety-boundary, после чего существующие инструменты могут делать domain-specific анализ. См. [`docs/ru/external-tools.md`](docs/ru/external-tools.md) и [`docs/ru/language-policy.md`](docs/ru/language-policy.md).

## Слои рядом с project skills

Комплект не заменяет проектные или предметные инструкции. Он находится ниже уровнем и отвечает за shell/text I/O границы. См. [`docs/ru/project-skills-layering.md`](docs/ru/project-skills-layering.md).

## Рецепты из практики

См. [`docs/ru/field-notes.md`](docs/ru/field-notes.md), [`docs/ru/remote-io-recipes.md`](docs/ru/remote-io-recipes.md), [`examples/powershell-select-object.md`](examples/powershell-select-object.md), [`examples/powershell-ssh-newlines.md`](examples/powershell-ssh-newlines.md), [`examples/ripgrep-leading-dash.md`](examples/ripgrep-leading-dash.md) и [`examples/remote-script-boundaries.md`](examples/remote-script-boundaries.md): там разобраны mojibake при корректных UTF-8 байтах, PowerShell → Node UTF-8 literals, Windows CRLF в remote Bash, сложные SSH commands, inline interpreter one-liners вокруг config/env/secrets, `ssh -n` vs `rsync -e`, PowerShell/SSH newline escaping, `rg -- "-pattern"`, escape-слои remote here-doc, Paramiko SFTP rename, долгие SSH-задачи, secret redaction и риск плавающих Docker tags.

## Optional hook enforcement

Rules и skills учат агента правильному маршруту. Hooks могут принудительно закрывать самые механические риски вокруг tool calls. См. [`docs/ru/cursor-hooks.md`](docs/ru/cursor-hooks.md) и [`docs/ru/codex-hooks.md`](docs/ru/codex-hooks.md). Готовый пример для Cursor лежит в [`examples/cursor-hooks/`](examples/cursor-hooks/).

## Статус npm

Пакет подготовлен к npm, но репозиторий не публикует его автоматически. Если имя пакета доступно, публикацию можно выполнить вручную после tagged release:

```sh
npm publish --access public
```

Полезные локальные команды:

```sh
npx agent-io-safety-kit --target /path/to/project --entry AGENTS.md --dry-run
npx safe-shell-run-node-utf8 --spec node-task.json
npx safe-shell-remote-bash host script.sh
npx safe-text-read README.md
npx safe-text-inspect --fail-on-bom --eol lf README.md
```

## Участие

См. [`CONTRIBUTING.md`](CONTRIBUTING.md). Особенно полезны отчёты о сбоях кодировки и quoting — по возможности прикладывайте точные байты, shell, OS, команду и expected/actual behavior.

## Лицензия

MIT — см. [`LICENSE`](LICENSE).
