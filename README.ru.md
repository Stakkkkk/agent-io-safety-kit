# Agent I/O Safety Kit

[English version](README.md)

Небольшой переносимый комплект правил, skills и Node.js-скриптов, который помогает агентам не ломать данные на кавычках, shell-экранировании, кодировках, BOM и окончаниях строк.

Проект полезен там, где AI-агент регулярно:

- запускает команды с пользовательским текстом, путями с пробелами, кавычками, shell-метасимволами, JSON/YAML/SQL/regex или не-ASCII символами;
- читает, создаёт или преобразует текстовые файлы;
- работает в Windows/PowerShell и рискует получить mojibake;
- теряет время на повторные попытки “подобрать кавычки”.

## Что внутри

- `RULE.md` — центральная политика безопасного shell и текстового I/O.
- `skills/safe-shell-io` — инструкция и runner для запуска команд с точной передачей `argv`.
- `skills/safe-text-io` — инструкция и утилиты для проверки/преобразования текстовых файлов.
- `schemas/command-spec.schema.json` — JSON Schema для command spec.
- `scripts/deploy.mjs` — идемпотентный установщик в целевой проект.
- `scripts/doctor.mjs` — диагностика установленной копии.
- `snippets/` — управляемые фрагменты инструкций для разных агентских entry-файлов.
- `examples/` — маленькие примеры для копирования.
- `tests/run-tests.mjs` — самодостаточный тестовый набор без внешних зависимостей.

Подробное описание механизма: [`00-MECHANISM.md`](00-MECHANISM.md). Инструкция по развёртыванию: [`01-DEPLOYMENT.md`](01-DEPLOYMENT.md).

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

Проверить установленную копию:

```sh
node scripts/deploy.mjs --target /path/to/project --entry AGENTS.md --check
node scripts/doctor.mjs --target /path/to/project --entry AGENTS.md
```

По умолчанию установщик создаёт или обновляет управляемый блок в `AGENTS.md` и копирует комплект в `.agent-io-safety/`.

## Инструкция для агента

Операционную инструкцию нужно помещать в агентский entry-файл. README может документировать политику, но именно entry-файл агент должен прочитать и выполнить. Главное правило: не подбирать кавычки или кодировки повторными попытками, а после первой проблемы переходить к детерминированному пути.

Минимальный текст для агентского entry-файла в корне проекта:

```md
## Безопасность shell и текстового I/O

Перед первой операцией, которая использует shell, читает или записывает текст, передаёт пользовательские значения, пути, JSON/YAML/SQL/regex, не-ASCII символы, кодировки, BOM или окончания строк, прочитай и соблюдай `.agent-io-safety/RULE.md`.

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
```

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

## Пример: проверка текста

```sh
node skills/safe-text-io/scripts/inspect-text.mjs --fail-on-bom --eol lf README.md
```

Утилита строго проверяет UTF-8, BOM, окончания строк, подозрительный UTF-16 без BOM и PowerShell 5.1-совместимость для `.ps1/.psd1/.psm1`.

## Гарантии и границы

Комплект помогает сделать хрупкие операции детерминированными:

- точная передача аргументов через `argv`;
- строгая проверка UTF-8 вместо тихой замены повреждённых символов;
- явная политика BOM и окончаний строк;
- безопасное обновление управляемой копии с проверкой SHA-256;
- symlink-aware запись при развёртывании.

Он не угадывает legacy-кодировки, не лечит mojibake автоматически, не обрабатывает бинарные форматы как текст и не заменяет системные/пользовательские инструкции более высокого приоритета.

## Статус npm

Пакет подготовлен к npm, но репозиторий не публикует его автоматически. Если имя пакета доступно, публикацию можно выполнить вручную после tagged release:

```sh
npm publish --access public
```

Полезные локальные команды:

```sh
npx agent-io-safety-kit --target /path/to/project --entry AGENTS.md --dry-run
npx safe-text-inspect --fail-on-bom --eol lf README.md
```

## Участие

См. [`CONTRIBUTING.md`](CONTRIBUTING.md). Особенно полезны отчёты о сбоях кодировки и quoting — по возможности прикладывайте точные байты, shell, OS, команду и expected/actual behavior.

## Лицензия

MIT — см. [`LICENSE`](LICENSE).
