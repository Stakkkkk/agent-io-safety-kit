# Интеграция с Codex hooks

[English version](../codex-hooks.md)

Codex hooks добавляют механическое enforcement вокруг advisory rules и skills комплекта. Project hooks загружаются только для trusted projects.

Официальная документация: <https://developers.openai.com/codex/hooks>

## Установка

Разверни профиль `full`, затем скопируй example:

```text
node scripts/deploy.mjs --target <project-root> --profile full
mkdir -p <project-root>/.codex
cp <project-root>/.agent-io-safety/examples/codex-hooks/hooks.json <project-root>/.codex/hooks.json
```

Example запускает:

```text
node .agent-io-safety/examples/codex-hooks/io-safety-hook.mjs --mode strict
```

## Контракт адаптера

`PreToolUse` adapter читает `tool_name` и `tool_input.command`, вызывает общий `shell-policy.mjs` и возвращает документированный Codex deny shape:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "reason and deterministic remediation"
  }
}
```

Сейчас Codex парсит решение `ask`, но не поддерживает его. Поэтому `--mode strict` отображает findings `deny` и `review` в `deny`. Необязательный `--mode context` отображает review findings в `additionalContext`; считать его enforcement нельзя.

При ошибке hook process tool call может продолжиться, поэтому malformed input преобразуется в valid deny response, а не в non-zero process exit.

## Покрытие

Общая policy ловит механические shapes:

- Markdown, переданный Node вместо `read-text.mjs`;
- inline interpreters вокруг config/env/secrets;
- сложный inline interpreter quoting;
- `rsync -e` с `ssh -n`;
- PowerShell range без скобок в `Select-Object -Index`;
- SSH command strings с literal `\n`;
- leading-dash patterns ripgrep без `--`;
- Bash nounset с config-like `$...` текстом в double quotes;
- Docker Go templates внутри inline SSH commands;
- команды, объединяющие `docker compose down` с ownership/directory mutations вместо отдельного preflight.

Parser считает interpreter executable только на границе command segment, поэтому prose вроде `echo node -e` не блокируется.

## Граница

Hook interception охватывает не каждый Codex surface и не каждый новый unified execution path. Проверь установку через `/hooks` и протестируй фактический shell tool своей среды. Compact entry rule и skills должны оставаться активными даже при включённых hooks.

Hooks не проверяют semantics, не разрешают downloads и не выполняют безопасный redaction secrets. Они направляют очевидные unsafe shapes к детерминированным script/spec helpers.
