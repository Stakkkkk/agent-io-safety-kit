# Развёртывание механизма

## Требования

- Node.js 18 или новее.
- Корневой каталог целевого проекта.
- Имя стартового файла с инструкциями для агента. По умолчанию используется `AGENTS.md`.

## Предварительная проверка

```text
node scripts/deploy.mjs --target <project-root> --entry AGENTS.md --dry-run
```

Команда показывает план, но ничего не меняет.

## Установка или обновление

```text
node scripts/deploy.mjs --target <project-root> --entry AGENTS.md
```

Установщик:

1. копирует правило, skills и версию в `<project-root>/.agent-io-safety/`;
2. создаёт или заменяет управляемый блок в стартовом файле;
3. сохраняет UTF-8 BOM и стиль строк существующего стартового файла;
4. записывает манифест с SHA-256 управляемых файлов;
5. не удаляет неизвестные файлы в каталоге назначения.

Если управляемая копия была изменена вручную, обновление останавливается. После осознанной проверки её можно восстановить канонической версией:

```text
node scripts/deploy.mjs --target <project-root> --entry AGENTS.md --force
```

## Проверка установленной копии

```text
node scripts/deploy.mjs --target <project-root> --entry AGENTS.md --check
```

Код возврата ненулевой, если отсутствует врезка, отличаются управляемые файлы или версия устарела.

Более подробная диагностика:

```text
node scripts/doctor.mjs --target <project-root> --entry AGENTS.md
```

`doctor` проверяет Node.js, наличие entry-файла, управляемые маркеры, `MANIFEST.json`, версию, SHA-256 управляемых файлов и базовую текстовую валидность установленной копии.

Для необязательных внешних инструментов:

```text
node scripts/doctor.mjs --target <project-root> --entry AGENTS.md --external
```

Отсутствующие внешние инструменты дают предупреждения, но не ошибку. Политика и список рекомендаций описаны в `docs/external-tools.md`.

## Врезка

Шаблон находится в `snippets/AGENTS.md.fragment`. Установщик заменяет `{{RULE_PATH}}` относительным путём от стартового файла к развёрнутому правилу.

Границы блока:

```text
<!-- agent-io-safety:begin -->
...
<!-- agent-io-safety:end -->
```

Блок можно безопасно обновлять повторным запуском установщика. Ручной текст вне этих маркеров сохраняется.

## Другие платформы

Передать нужный стартовый файл через `--entry`:

```text
node scripts/deploy.mjs --target <project-root> --entry CLAUDE.md
node scripts/deploy.mjs --target <project-root> --entry GEMINI.md
node scripts/deploy.mjs --target <project-root> --entry .github/copilot-instructions.md
```

Установщик выбирает подходящий шаблон из `snippets/` для `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md` и Cursor rule-файлов. При необходимости можно явно передать фрагмент:

```text
node scripts/deploy.mjs --target <project-root> --entry CLAUDE.md --fragment snippets/CLAUDE.md.fragment
```

Если платформа поддерживает нативные skills, каталог `.agent-io-safety/skills/` можно дополнительно подключить к её реестру. Это ускоряет автоматический trigger, но не является условием работы механизма.

## Command spec schema

Для command spec доступна JSON Schema:

```text
schemas/command-spec.schema.json
```

Её можно подключить в spec через поле `$schema`, чтобы редактор подсвечивал ошибки структуры до запуска `run-from-spec.mjs`.

## Обновление самого комплекта

1. Изменить канонические правило, skills или скрипты.
2. Запустить `node tests/run-tests.mjs`.
3. Запустить `node skills/safe-text-io/scripts/inspect-text.mjs --all-files --fail-on-bom --eol lf --ps51-safe .`.
4. Увеличить `VERSION` и обновить `CHANGELOG.md`, если готовится релиз.
5. Выполнить `--dry-run`, затем обычное развёртывание в нужных проектах.
