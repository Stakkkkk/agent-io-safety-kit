# Рецепты remote I/O

[English version](../remote-io-recipes.md)

Удалённое выполнение объединяет несколько хрупких границ. Рассматривайте каждую границу отдельно.

```text
local process → local argv/shell → transport → remote shell → remote interpreter → remote files
```

## Держите remote command strings фиксированными

Плохой паттерн:

```python
command = f"ssh host \"python3 - <<'PY'\nprint('{user_text}')\nPY\""
```

Здесь смешаны Python string escaping, local shell quoting, SSH command transport, remote shell parsing и remote Python parsing.

Более безопасные паттерны:

- upload script file через SFTP/scp, затем запуск фиксированной команды;
- script bytes через stdin;
- data payload через Base64 или JSON files;
- через remote command line передавать только стабильные пути или фиксированные flags.

Если remote snippet содержит pipes, `$`, regex, кавычки, `sed`, `awk` или `grep`, считайте его скриптом, а не SSH one-liner. Локальный argv array не убирает remote shell parser: `ssh host command args...` всё равно интерпретируется удалённо.

## Windows to remote Bash

PowerShell here-strings и файлы, созданные на Windows, могут протащить CRLF в `ssh host bash -s`. Перед отправкой нормализуйте scripts к LF:

```sh
node skills/safe-shell-io/scripts/remote-bash.mjs host script.sh
```

Для локальной проверки используйте `--print-normalized`:

```sh
node skills/safe-shell-io/scripts/remote-bash.mjs --print-normalized host script.sh
```

Если обычный `ssh host ...` работает, а helper — нет, проверьте, какой SSH executable и environment видит helper:

```sh
node skills/safe-shell-io/scripts/remote-bash.mjs --diagnose-ssh host script.sh
```

На Windows явно передайте тот же OpenSSH executable, config и identity, которые работают интерактивно:

```sh
node skills/safe-shell-io/scripts/remote-bash.mjs --ssh "C:\Windows\System32\OpenSSH\ssh.exe" --ssh-arg -F --ssh-arg "C:\Users\me\.ssh\config" --ssh-arg -i --ssh-arg "C:\Users\me\.ssh\id_ed25519" host script.sh
```

Каждую SSH option передавайте отдельным повтором `--ssh-arg`.

Helper читает script как strict UTF-8, отклоняет UTF-16/invalid UTF-8, преобразует `CRLF`/`CR` в `LF` и отправляет bytes в `ssh host bash -s` без local shell.

## Docker inspect Go templates через PowerShell и SSH

Значение Docker `--format` — это Go template с фигурными скобками, кавычками, variables и function calls. Docker отдельно документирует shell-specific quoting для таких templates: <https://docs.docker.com/engine/cli/formatting/>. Добавление PowerShell и remote shell делает такую inline-команду недетерминированной:

```powershell
ssh host "docker inspect -f '{{...}}' container"
```

После `template parsing error: unterminated quoted string` не перебирайте варианты кавычек. Поместите команду в локальный strict UTF-8/LF Bash-файл. В deployment-профиле `full` файл `examples/docker-remote-inspect.sh` показывает secret-minimizing проверку: печатает configured user, ключи labels и имена environment variables, но не значения environment:

```sh
node skills/safe-shell-io/scripts/remote-bash.mjs --print-normalized host examples/docker-remote-inspect.sh
node skills/safe-shell-io/scripts/remote-bash.mjs host examples/docker-remote-inspect.sh
```

Перед запуском измените fixed container name в проверенном script. Не интерполируйте недоверенное имя контейнера или template в SSH command.

## Preflight перед изменением Docker bind mounts

Bind mounts напрямую открывают контейнерам host paths и позволяют менять данные host filesystem; Docker документирует эту границу здесь: <https://docs.docker.com/engine/storage/bind-mounts/>. Разделяйте ownership/mode migration на две фазы.

Фаза 1 — read-only; она должна завершиться до `docker compose down`:

1. Проверьте, что текущий account — root либо успешно выполняется `sudo -n true`. Interactive sudo недопустим для unattended agent operation.
2. Пока контейнер работает, получите effective UID/GID через `docker exec <container> id -u` и `id -g`; не полагайтесь на общий default продукта вроде `7474:7474` без проверки реального image/container.
3. Выполните `stat -c 'uid=%u gid=%g mode=%a path=%n' -- <path>` для каждого существующего bind source и parent каждого пути, который предстоит создать.
4. Подтвердите совпадение planned UID/GID с running process и определите все пути, которым нужны `chown`/`chmod`.
5. Для restricted sudoers, read-only filesystem, NFS root-squash и похожих границ организуйте согласованный disposable ownership probe на той же filesystem. Одного `sudo -n true` недостаточно, чтобы доказать, что конкретная filesystem принимает `chown`.

`examples/docker-bind-mount-preflight.sh` реализует non-mutating проверки с fixed reviewed values. Запустите его локально на Docker host или отправьте через `remote-bash.mjs`. В нём нет `down`, move, создания каталогов, смены ownership или mode.

Только после вывода `READY` фаза 2 может остановить контейнеры, создать backups, пересоздать paths, изменить ownership/modes и запустить stack. Rollback paths и verification держите в отдельном state-changing script. Если preflight не доказывает privilege или identity, остановитесь до изменения состояния и обратитесь к пользователю/админу.

## PowerShell/SSH newline escapes

Не передавайте переводы строк как `\n` через PowerShell → SSH → remote shell quoting. В зависимости от слоёв remote side может увидеть literal backslash-n, реальный перевод строки не в том месте или output вида `n...n`.

Для маленького фиксированного output повторяющиеся `echo` commands понятнее, чем cross-layer newline escaping:

```powershell
ssh host "echo 'line 1'; echo 'line 2'"
```

Для generated или user-controlled payloads не используйте `echo`. Загружайте файл, передавайте bytes через stdin или отправляйте JSON/Base64 data и декодируйте удалённо.

См. `examples/powershell-ssh-newlines.md` в deployment-профиле `full`; этот recipe самодостаточен в `core`.

## `ssh -n`

Используйте `ssh -n`, когда вложенная SSH-команда не должна читать stdin родительского скрипта.

Не используйте `ssh -n` внутри `rsync -e`, потому что rsync использует SSH stdin/stdout как protocol channel.

## Долгие удалённые операции

Не держите долгие миграции привязанными к локальному SSH-окну.

Предпочитайте:

```sh
nohup ./long-task.sh >long-task.log 2>&1 &
```

или:

```sh
systemd-run --user --unit agent-long-task ./long-task.sh
```

Затем polling:

```sh
ssh host tail -n 100 long-task.log
ssh host test -f long-task.done
```

## SFTP atomic-ish replace

Для Paramiko-style SFTP clients:

1. загрузите файл во временный путь в той же директории;
2. по возможности проверьте size/hash;
3. используйте `posix_rename(tmp, target)`, если доступен;
4. fallback `remove(target)` затем `rename(tmp, target)` применять только если atomic replacement недоступен и такой риск приемлем;
5. проверьте итоговый target.

Задокументируйте fallback, потому что remove+rename не атомарен.

## Кодировка remote text

Кодировка remote stdout — отдельная граница. Если remote output выглядит повреждённым:

- проверьте байты remote file;
- проверьте output encoding удалённой программы;
- проверьте local decoder;
- не переписывайте remote files только по виду terminal output.
