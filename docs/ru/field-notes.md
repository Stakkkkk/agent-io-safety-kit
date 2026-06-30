# Полевые заметки: реальные I/O-ловушки

[English version](../field-notes.md)

Эти заметки собраны из практической работы агентов. Не всё здесь является core rule, но это хорошие подсказки для маршрутизации.

## UTF-8 байты валидны, но вывод в терминале выглядит как mojibake

PowerShell, terminal code page, кодировка stdout инструмента и байты файла — разные границы. Если UTF-8 файл выглядит повреждённым только на экране:

1. не переписывайте файл;
2. сначала проверьте байты:

```sh
node skills/safe-text-io/scripts/inspect-text.mjs path/to/file.md
```

3. если нужен stdout через terminal/tool для Markdown, JSON, rules или skills, читайте строгим UTF-8 reader:

```sh
node skills/safe-text-io/scripts/read-text.mjs path/to/file.md
```

4. не чините PowerShell output inline snippets через `[Console]::OutputEncoding` или `[System.Text.UTF8Encoding]::new($false)`;
5. при необходимости посмотрите hex bytes или прочитайте файл другим известным decoder;
6. считайте terminal/tool output подозрительным, пока byte-level проверки не подтвердят повреждение.

## `ssh -n` полезен, но не внутри `rsync -e`

`ssh -n` запрещает SSH-команде читать stdin. Это помогает вложенным read-only SSH-командам, которые не должны съесть stdin родительского скрипта.

Не используйте `ssh -n` внутри `rsync -e "ssh -n ..."`. `rsync` использует stdin/stdout SSH-процесса как protocol channel, и `ssh -n` может сломать передачу.

## Многоуровневые here-doc могут повредить строковые литералы

Если Python создаёт shell here-doc, внутри которого лежит Python-код, слои escaping могут превратить `\\n` в реальный перевод строки внутри удалённого строкового литерала.

Предпочитайте:

- upload script file через SFTP/scp;
- raw bytes через stdin;
- Base64 для data payload;
- фиксированные и маленькие remote command strings.

См. `docs/ru/remote-io-recipes.md`.

## PowerShell + SSH может превратить `\n` в `n...n`

Если PowerShell собирает SSH command string с `\n`, эта последовательность может быть обработана не тем слоем, остаться literal или превратиться в output вида `n...n`.

Не полагайтесь на `\n` escaping через цепочку PowerShell → SSH → remote shell. Для маленького фиксированного текста используйте повторяющиеся fixed `echo` commands. Для настоящих payload загружайте файл, передавайте stdin или используйте JSON/Base64.

См. `examples/powershell-ssh-newlines.md`.

## Paramiko SFTP rename может не перезаписать файл

`sftp.rename(tmp, target)` может упасть, если `target` уже существует. Некоторые серверы возвращают общий `Failure`.

Более безопасный паттерн:

1. предпочитать `posix_rename`, если доступен;
2. иначе явно удалить target, затем rename;
3. помнить, что remove+rename не атомарен;
4. проверить итоговый файл.

## PowerShell ranges требуют expression syntax

Такой вариант может упасть или распарситься неожиданно:

```powershell
Select-Object -Index 94..112
```

Предпочитайте:

```powershell
Select-Object -Index (94..112)
```

или:

```powershell
Select-Object -Skip 94 -First 19
```

См. `examples/powershell-select-object.md`.

## `rg` patterns, начинающиеся с `-`, требуют `--`

`rg` воспринимает аргумент, начинающийся с `-`, как option. Если search pattern сам может начинаться с `-`, сначала остановите option parsing:

```sh
rg -- "-TODO"
rg --fixed-strings -- "-literal-user-text"
```

См. `examples/ripgrep-leading-dash.md`.

## Долгие SSH/rsync операции должны переживать disconnect клиента

Долгие удалённые операции не должны зависеть от живого локального терминала или SSH-сессии.

Предпочитайте remote supervision:

- `nohup ... >log 2>&1 &`;
- `systemd-run --user ...`;
- `tmux` / `screen`, если policy разрешает;
- remote log file + polling.

## Non-UTF-8 файлы нельзя “лечить” replacement decoding

Если файл невалиден как UTF-8, а нужная правка ASCII-only, byte-level ASCII replacement безопаснее, чем decoding всего файла с replacement characters.

Используйте:

```sh
node skills/safe-text-io/scripts/replace-ascii-bytes.mjs --input file --in-place --search old/ascii/path --replace new/ascii/path
```

Не используйте это для non-ASCII правок или неизвестных semantic changes.

## Floating Docker tags — риск миграции

Это не core shell/text I/O rule, но полезный deployment-safety recipe.

Не делайте слепой `docker pull` floating tags вроде `latest` или unpinned `IMAGE_TAG` при миграции. Сначала сравните image ID/digest. Если важно точное сохранение, используйте `docker save` и `docker load`.
