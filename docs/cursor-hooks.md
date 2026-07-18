# Cursor hooks integration

[Russian version](ru/cursor-hooks.md)

Cursor Hooks can enforce the most mechanical command-shape rules before shell execution. Official documentation: <https://cursor.com/docs/hooks>

## Install

Deploy `full` and copy the example:

```text
node scripts/deploy.mjs --target <project-root> --profile full
mkdir -p <project-root>/.cursor
cp <project-root>/.agent-io-safety/examples/cursor-hooks/hooks.json <project-root>/.cursor/hooks.json
```

The adapter receives Cursor's `beforeShellExecution` JSON and calls the shared `skills/safe-shell-io/scripts/shell-policy.mjs`. The example uses `--mode strict` and `failClosed: true`: both policy `review` and `deny` become Cursor `deny`, while safe shapes return `allow`.

An explicit `--mode advisory` maps policy `review` to Cursor `ask`, but host versions and execution paths may not gate consistently on `ask`; do not use advisory mode as a security boundary.

## Coverage

The policy catches:

- Markdown passed to Node;
- inline interpreters around config/env/secrets;
- complex inline interpreter quoting;
- `rsync -e` with `ssh -n`;
- unparenthesized PowerShell `Select-Object -Index` ranges;
- SSH strings containing literal `\n`;
- ripgrep leading-dash patterns without `--`;
- Bash nounset with config-like `$...` text in double quotes;
- Docker Go templates embedded in inline SSH commands;
- commands that combine `docker compose down` with ownership/directory mutations instead of a separate preflight.

Detection is segment-aware: text such as `echo node -e is documentation` is allowed because Node is not the executable in that command segment.

## Boundary

Project hooks are the portable choice for Cursor cloud agents; user-level hooks are not available there, and event support can differ. Test local and cloud execution before treating the hook as a security boundary.

Hooks complement the central rule and skills. They detect shapes, not intent or data semantics, and should route the agent to `run-from-spec.mjs`, `run-node-utf8.mjs`, `remote-bash.mjs`, or `read-text.mjs`.
