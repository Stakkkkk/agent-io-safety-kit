# Интеграция с Cursor hooks

[English version](../cursor-hooks.md)

Cursor Hooks могут enforce наиболее механические command-shape правила до shell execution. Официальная документация: <https://cursor.com/docs/hooks>

## Установка

Разверни `full` и скопируй example:

```text
node scripts/deploy.mjs --target <project-root> --profile full
mkdir -p <project-root>/.cursor
cp <project-root>/.agent-io-safety/examples/cursor-hooks/hooks.json <project-root>/.cursor/hooks.json
```

Adapter получает Cursor JSON для `beforeShellExecution` и вызывает общую policy `skills/safe-shell-io/scripts/shell-policy.mjs`. Example использует `--mode strict` и `failClosed: true`: policy `review` и `deny` становятся Cursor `deny`, а safe shapes возвращают `allow`.

Явный `--mode advisory` отображает policy `review` в Cursor `ask`, но host versions и execution paths могут gate на `ask` непоследовательно; advisory mode нельзя считать security boundary.

## Покрытие

Policy ловит:

- Markdown, переданный Node;
- inline interpreters вокруг config/env/secrets;
- сложный inline interpreter quoting;
- `rsync -e` с `ssh -n`;
- PowerShell range без скобок в `Select-Object -Index`;
- SSH strings с literal `\n`;
- leading-dash patterns ripgrep без `--`;
- Bash nounset с config-like `$...` текстом в double quotes;
- Docker Go templates внутри inline SSH commands;
- команды, объединяющие `docker compose down` с ownership/directory mutations вместо отдельного preflight.

Detection учитывает command segments: текст вроде `echo node -e is documentation` разрешается, потому что Node не является executable этого segment.

## Граница

Project hooks — переносимый выбор для Cursor cloud agents; user-level hooks там недоступны, а event support может отличаться. До использования hook как security boundary протестируй local и cloud execution.

Hooks дополняют central rule и skills. Они обнаруживают shapes, а не intent или data semantics, и должны направлять агента к `run-from-spec.mjs`, `run-node-utf8.mjs`, `remote-bash.mjs` или `read-text.mjs`.
