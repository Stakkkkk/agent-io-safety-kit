# Agent I/O Safety Kit

Языки: [English](README.md) | [Русский](README.ru.md)

Dependency-free слой безопасности для coding agents на границах shell, текста, PowerShell, SSH, кодировок и terminal output.

Комплект объединяет компактные правила для агентов, детерминированные Node.js helpers, необязательные lifecycle hooks, проверку целостности deployment и практические рецепты. Он не заменяет проектные/предметные инструкции, а контролирует нижний I/O-слой их выполнения.

## Что предотвращает

- повторный подбор shell quoting и случайный повторный parsing команд;
- ошибочный вывод о повреждении файлов или путей по mojibake;
- тихое replacement decoding, нежелательные изменения BOM/EOL и опасную перезапись legacy-файлов;
- inline interpreter one-liners вокруг config, environment, regex, не-ASCII данных или secrets;
- типовые ошибки PowerShell, SSH, rsync, remote Bash и persistent REPL.

## Требования и распространение

- Node.js 18 или новее;
- runtime npm dependencies отсутствуют.

Пакет распространяется tagged GitHub releases. В каждом release есть source, npm-пакет `.tgz` и его SHA-256. Имя npm указано в metadata, но пакет пока не опубликован в public npm registry, поэтому bare-команда `npx agent-io-safety-kit` сейчас не поддерживается.

## Установка из tagged GitHub release

После публикации `v0.2.0`:

```sh
npx --yes --package github:Stakkkkk/agent-io-safety-kit#v0.2.0 agent-io-safety-kit --target /path/to/project
```

После скачивания release asset, без сетевого разрешения пакета:

```sh
npx --yes --package ./agent-io-safety-kit-0.2.0.tgz agent-io-safety-kit --target /path/to/project
```

Из клонированного репозитория:

```sh
node scripts/deploy.mjs --target /path/to/project
```

Сначала можно добавить `--dry-run`. Entry-файл по умолчанию — `AGENTS.md`; для другой платформы передай `--entry`.

## Варианты deployment

Default-профиль `core` устанавливает правило, docs выбранного языка, skills и helpers:

```sh
node scripts/deploy.mjs --target /path/to/project --profile core --lang en
node scripts/deploy.mjs --target /path/to/project --profile core --lang ru
```

Профиль `full` дополнительно устанавливает все examples, обе docs-ветки и готовые hook adapters:

```sh
node scripts/deploy.mjs --target /path/to/project --profile full
```

Другие режимы:

```sh
node scripts/deploy.mjs --target /path/to/project --dry-run
node scripts/deploy.mjs --target /path/to/project --check
node scripts/deploy.mjs --target /path/to/project --fix-entry-text
node scripts/deploy.mjs --target /path/to/project --uninstall
```

`--fix-entry-text` явно убирает UTF-8 BOM и нормализует только entry-файл к LF. `--uninstall` удаляет только manifest-tracked files и managed entry block; при изменённых managed files он останавливается без явно заданного `--force` и сохраняет неизвестные файлы.

Запись выполняется через same-directory temporary files и atomic rename. Manifest хранит hashes, language, profile, version и hash managed entry block.

## Инструкция для агента

Да: рабочая инструкция должна находиться в agent entry-файле, а не только в README. Deployment вставляет компактный managed block: центральное правило загружается только на рискованной границе. Для обычных структурированных чтений и правок через patch/editor оно не требуется.

Ключевое поведение механическое: после первой ошибки quoting, parsing, encoding или mojibake прекратить перебор вариантов и перейти на детерминированный helper-маршрут.

## Основные helpers

Точный argv из strict JSON spec:

```sh
node .agent-io-safety/skills/safe-shell-io/scripts/run-from-spec.mjs command.json
```

Strict UTF-8 Node script с данными вне inline PowerShell code:

```sh
node .agent-io-safety/skills/safe-shell-io/scripts/run-node-utf8.mjs --spec node-task.json
```

Нормализация локального Bash-файла к LF и отправка через SSH:

```sh
node .agent-io-safety/skills/safe-shell-io/scripts/remote-bash.mjs host script.sh
```

Чтение текста и листинг не-ASCII путей без PowerShell text cmdlets:

```sh
node .agent-io-safety/skills/safe-text-io/scripts/read-text.mjs -- RULE.md
node .agent-io-safety/skills/safe-text-io/scripts/read-text.mjs --json -- RULE.md skills/safe-text-io/SKILL.md
node .agent-io-safety/skills/safe-text-io/scripts/list-paths.mjs --json --recursive --files -- .
```

Проверка и явное преобразование bytes:

```sh
node .agent-io-safety/skills/safe-text-io/scripts/inspect-text.mjs --fail-on-bom --eol lf -- .
node .agent-io-safety/skills/safe-text-io/scripts/transcode-text.mjs --input source --output target --bom none
node .agent-io-safety/skills/safe-text-io/scripts/replace-ascii-bytes.mjs --input legacy --in-place --search old --replace new --expect-count 1
```

Execution helpers используют `shell: false`, strict validation, time/output bounds или bounded streaming.

## Hooks

Rules и skills направляют reasoning агента; hooks до выполнения блокируют узкие опасные command shapes. Установи `--profile full`, затем скопируй подходящий example:

```sh
cp .agent-io-safety/examples/cursor-hooks/hooks.json .cursor/hooks.json
cp .agent-io-safety/examples/codex-hooks/hooks.json .codex/hooks.json
```

Перед использованием enforcement прочитай [инструкцию Cursor hooks](docs/ru/cursor-hooks.md) или [инструкцию Codex hooks](docs/ru/codex-hooks.md). Покрытие зависит от host и перехватываемого tool surface.

## Диагностика установки

```sh
node scripts/doctor.mjs --target /path/to/project
node scripts/doctor.mjs --target /path/to/project --external
node scripts/doctor.mjs --target /path/to/project --external-run
```

`--external` только обнаруживает подходящие optional linters/scanners в `PATH`; `--external-run` явно запускает ограниченные version/module checks. Отсутствующие optional tools дают предупреждения.

## Проверки проекта

```sh
npm test
npm run check:text
npm run check:localization
npm run check:skills
npm run check:release
npm run pack:dry-run
```

CI запускает Node.js 18/20/22/24 на Linux, Windows и macOS, а также Windows PowerShell 5.1 smoke test.

## Документация

- [Механизм](00-MECHANISM.ru.md) и [deployment](01-DEPLOYMENT.ru.md)
- [Практические заметки](docs/ru/field-notes.md) и [remote I/O recipes](docs/ru/remote-io-recipes.md)
- [Внешние инструменты](docs/ru/external-tools.md) и [слои project skills](docs/ru/project-skills-layering.md)
- [Security policy](SECURITY.md) и [changelog](CHANGELOG.md)

Английский — canonical; поддерживаемые русские файлы сохраняют те же target paths через `--lang ru`.
