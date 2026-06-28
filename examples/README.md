# Examples

These examples are intentionally small. They demonstrate where agents should stop trying new quoting combinations and switch to deterministic I/O.

## Safe shell argv

Run the echo example from the repository root:

```sh
node skills/safe-shell-io/scripts/run-from-spec.mjs examples/safe-shell-command.json
```

The spec passes spaces, quotes, `$`, `&`, a backslash, a newline, and non-ASCII text as exact `argv` items.

## Text inspection

Inspect the repository text policy:

```sh
node skills/safe-text-io/scripts/inspect-text.mjs --all-files --fail-on-bom --eol lf --ps51-safe .
```

Inspect a single generated file without assuming shell defaults:

```sh
node skills/safe-text-io/scripts/inspect-text.mjs examples/safe-shell-command.json
```

## Agent instruction snippets

Use the managed snippets in `snippets/` for root agent instruction files such as `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, or Cursor rule files.
