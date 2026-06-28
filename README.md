# Agent I/O Safety Kit

Небольшой переносимый комплект правил, skills и Node.js-скриптов, который помогает агентам не ломать данные на кавычках, shell-экранировании, кодировках, BOM и окончаниях строк.

Проект полезен там, где AI-агент регулярно:

- запускает команды с пользовательским текстом, путями с пробелами, JSON/YAML/SQL/regex или не-ASCII символами;
- читает, создаёт или преобразует текстовые файлы;
- работает в Windows/PowerShell и рискует получить mojibake;
- теряет время на повторные попытки “подобрать кавычки”.

## Что внутри

- `RULE.md` — центральная политика безопасного shell и текстового I/O.
- `skills/safe-shell-io` — инструкция и runner для запуска команд с точной передачей `argv`.
- `skills/safe-text-io` — инструкция и утилиты для проверки/преобразования текстовых файлов.
- `scripts/deploy.mjs` — идемпотентный установщик в целевой проект.
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
```

По умолчанию установщик создаёт или обновляет управляемый блок в `AGENTS.md` и копирует комплект в `.agent-io-safety/`.

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

Утилита строго проверяет UTF-8, BOM, окончания строк и PowerShell 5.1-совместимость для `.ps1/.psd1/.psm1`.

## Гарантии и границы

Комплект помогает сделать хрупкие операции детерминированными:

- точная передача аргументов через `argv`;
- строгая проверка UTF-8 вместо тихой замены повреждённых символов;
- явная политика BOM и окончаний строк;
- безопасное обновление управляемой копии с проверкой SHA-256.

Он не угадывает legacy-кодировки, не лечит mojibake автоматически и не заменяет системные/пользовательские инструкции более высокого приоритета.

## Лицензия

MIT — см. [`LICENSE`](LICENSE).
