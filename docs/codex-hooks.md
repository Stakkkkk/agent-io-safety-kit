# Codex hooks integration

[Russian version](ru/codex-hooks.md)

Codex hooks add mechanical enforcement around the kit's advisory rules and skills. Project hooks load only for trusted projects.

Official documentation: <https://developers.openai.com/codex/hooks>

## Install

Deploy the `full` profile, then copy the example:

```text
node scripts/deploy.mjs --target <project-root> --profile full
mkdir -p <project-root>/.codex
cp <project-root>/.agent-io-safety/examples/codex-hooks/hooks.json <project-root>/.codex/hooks.json
```

The example invokes:

```text
node .agent-io-safety/examples/codex-hooks/io-safety-hook.mjs --mode strict
```

## Adapter contract

The `PreToolUse` adapter reads `tool_name` and `tool_input.command`, calls the shared `shell-policy.mjs`, and returns the documented Codex deny shape:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "reason and deterministic remediation"
  }
}
```

Codex currently parses an `ask` decision but does not support it. Therefore `--mode strict` maps both policy `deny` and `review` findings to `deny`. Optional `--mode context` maps review findings to `additionalContext` and should not be treated as enforcement.

Hook process failures can allow the tool call to continue, so malformed input is converted into a valid deny response instead of a non-zero process exit.

## Coverage

The shared policy catches mechanical shapes such as:

- Markdown passed to Node instead of `read-text.mjs`;
- inline interpreters around config/env/secrets;
- complex inline interpreter quoting;
- `rsync -e` with `ssh -n`;
- unparenthesized PowerShell `Select-Object -Index` ranges;
- SSH command strings containing literal `\n`;
- ripgrep leading-dash patterns without `--`;
- Bash nounset with config-like `$...` text in double quotes;
- Docker Go templates embedded in inline SSH commands;
- commands that combine `docker compose down` with ownership/directory mutations instead of a separate preflight.

The parser only treats an interpreter token as executable at a command-segment boundary, so prose such as `echo node -e` is not blocked.

## Boundary

Hook interception is not complete for every Codex surface or newer unified execution path. Verify installation with `/hooks` and test the actual shell tool used in your environment. Keep the compact entry rule and skills active even when hooks are enabled.

Hooks do not inspect semantics, authorize downloads, or safely redact secrets. They route obvious unsafe shapes to deterministic script/spec helpers.
