# Развёртывание

## Требования

Node.js 18+, корень target project и имя agent entry-файла (`AGENTS.md` по умолчанию).

## Предпросмотр, установка, обновление

```text
node scripts/deploy.mjs --target <project-root> --dry-run
node scripts/deploy.mjs --target <project-root>
node scripts/deploy.mjs --target <project-root> --check
```

Deployment записывает `.agent-io-safety/`, вставляет/заменяет один managed block в entry-файле и сохраняет hashes в schema-v2 `MANIFEST.json`. Повторный запуск той же команды идемпотентен.

Managed files записываются через same-directory temporary files и atomic rename. BOM/EOL существующего entry-файла сохраняются, если `--fix-entry-text` явно не запрашивает UTF-8 без BOM и LF.

При локальном изменении managed file update/check останавливается. Перед `--force` изменение нужно проверить.

## Профили и язык

```text
node scripts/deploy.mjs --target <project-root> --profile core --lang en
node scripts/deploy.mjs --target <project-root> --profile core --lang ru
node scripts/deploy.mjs --target <project-root> --profile full --lang en
```

- `core` (default): центральное правило, docs выбранного языка, оба skills и runtime helpers;
- `full`: core плюс все examples, hook adapters и обе docs-ветки.

Localized rules/skills сохраняют canonical installed paths вроде `.agent-io-safety/RULE.md` и `.agent-io-safety/skills/.../SKILL.md`.

## Entry и fragment

```text
node scripts/deploy.mjs --target <project-root> --entry CLAUDE.md
node scripts/deploy.mjs --target <project-root> --entry .github/copilot-instructions.md
node scripts/deploy.mjs --target <project-root> --entry CUSTOM.md --fragment <fragment-file>
```

Все имена entry по умолчанию используют один компактный language-specific fragment. Custom fragment должен содержать managed markers и может использовать `{{RULE_PATH}}`, `{{RULE_FILE_PATH}}` и `{{READ_TEXT_PATH}}`.

Ручной текст вне markers сохраняется:

```text
<!-- agent-io-safety:begin -->
...
<!-- agent-io-safety:end -->
```

Manifest хранит hash точного rendered block. `doctor` обнаруживает malformed, duplicated или modified blocks.

## Безопасное удаление

```text
node scripts/deploy.mjs --target <project-root> --uninstall --dry-run
node scripts/deploy.mjs --target <project-root> --uninstall
```

Uninstall требует valid manifest. Он удаляет только tracked files и managed entry block, сохраняет неизвестные файлы и отказывается удалять изменённые tracked files без явно заданного `--force`.

## Doctor

```text
node scripts/doctor.mjs --target <project-root>
node scripts/doctor.mjs --target <project-root> --lang auto --profile auto
node scripts/doctor.mjs --target <project-root> --external
node scripts/doctor.mjs --target <project-root> --external-run
```

Doctor проверяет Node.js, структуру manifest, version/language/profile, точный managed block, managed hashes и strict text validity.

`--external` работает в detect-only режиме: сканирует типы project files и разрешает подходящие optional tools в `PATH`, не запуская их. `--external-run` явно выполняет bounded version/module checks. Отсутствующие external tools дают предупреждения.

## Распространение

Из tagged GitHub package:

```text
npx --yes --package github:Stakkkkk/agent-io-safety-kit#v0.2.0 agent-io-safety-kit --target <project-root>
```

Из скачанного release asset:

```text
npx --yes --package ./agent-io-safety-kit-0.2.0.tgz agent-io-safety-kit --target <project-root>
```

Public npm registry пока не является canonical distribution channel. Release assets включают SHA-256 файл.

## Проверка для maintainer

```text
npm test
npm run check:text
npm run check:localization
npm run check:skills
npm run check:release
npm run pack:dry-run
```

Перед push tag запусти `node scripts/check-release.mjs --tag vX.Y.Z`.
