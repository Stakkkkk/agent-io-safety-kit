# Contributing

Thanks for helping improve Agent I/O Safety Kit.

This project is intentionally small and dependency-free. Contributions should preserve that property unless there is a strong reason not to.

## Local checks

Run before opening a pull request:

```sh
npm test
npm run check:text
```

Without npm:

```sh
node tests/run-tests.mjs
node skills/safe-text-io/scripts/inspect-text.mjs --all-files --fail-on-bom --eol lf --ps51-safe .
```

## Text policy

- UTF-8 without BOM for repository files.
- LF line endings.
- Do not guess legacy encodings.
- Do not save text decoded with replacement characters.
- Keep PowerShell 5.1 exceptions explicit and tested.

## Localization policy

English is canonical. Russian is maintained as a first-class localization.

When changing canonical instructions, update the matching Russian files whenever practical:

- `README.ru.md`
- `00-MECHANISM.ru.md`
- `01-DEPLOYMENT.ru.md`
- `RULE.ru.md`
- `skills/**/SKILL.ru.md`
- `skills/**/references/*.ru.md`
- `docs/ru/`
- `snippets/ru/`

If a localization update is intentionally deferred, mention it in the pull request.

## Command safety policy

- Avoid `shell: true`.
- Avoid nested `sh -c`, `cmd /c`, `powershell -Command`, and equivalent wrappers unless unavoidable.
- Pass user-controlled values as separate `argv` items.
- Use command specs for complex values, multiline input, JSON/YAML/SQL/regex, and non-ASCII data.

## Useful issue details

For quoting or encoding bugs, please include:

- OS and shell;
- Node.js version;
- exact command/spec;
- exact bytes if text encoding is involved;
- expected result;
- actual result;
- whether the failure changes after using `run-from-spec.mjs` or `inspect-text.mjs`.

## Release checklist

1. Update code, docs, examples, and tests.
2. Run `npm test` and `npm run check:text`.
3. Update `VERSION`.
4. Update `CHANGELOG.md`.
5. Create and push a tag such as `v0.1.1`.
