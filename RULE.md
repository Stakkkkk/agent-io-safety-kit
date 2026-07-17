# Safe shell and text I/O rule

## Load only at a risky boundary

Before the first matching operation, read the referenced skill relative to this file:

- `skills/safe-shell-io/SKILL.md` when a command contains user/project data, non-ASCII text, spaces, nested quotes, shell metacharacters, structured data, regex, multiline input, remote execution, or secrets;
- `skills/safe-text-io/SKILL.md` when encoding, BOM, line endings, terminal text display, non-ASCII paths, transcoding, or unknown bytes matter;
- both when a command generates or transports text.

Routine structured reads and patch/editor operations with no shell or encoding boundary do not require reloading these skills.

## Mechanical routes

1. Prefer native APIs/tools and structured editors. For a simple command, use one shell layer and separate arguments.
2. Never interpolate user/project data into a command string, regex, JSON, or script. Put complex argv in a UTF-8 JSON spec and run `safe-shell-io/scripts/run-from-spec.mjs`.
3. Treat `node -e`, `python -c`, `powershell -Command`, `cmd /c`, `bash -c`, and similar inline interpreters as unsafe when they touch files, structured data, non-ASCII text, regex, config, environment, or secrets. Use a reviewed script file/spec instead. Fixed ASCII diagnostics such as `node --version` are the narrow exception.
4. Never redact secrets inline. Parse safely and print only allowlisted metadata such as key presence, counts, hosts, section names, or auth shape—not values.
5. Read UTF-8 instructions through terminal boundaries with `safe-text-io/scripts/read-text.mjs`; do not run Markdown with Node and do not repair PowerShell output with inline `OutputEncoding` commands.
6. If CLI filename output shows mojibake, verify paths with `safe-text-io/scripts/list-paths.mjs`; display corruption is not proof that filesystem bytes are damaged.
7. Put `--` before user-controlled positional arguments that may start with `-`; for ripgrep use `rg -- "-pattern"` or `rg --fixed-strings -- "-literal"`.
8. Do not pass complex SSH commands, scripts, pipes, regex, `$`, or newline escapes through layered quoting. Use a script/file/spec; for Windows-to-Bash use `safe-shell-io/scripts/remote-bash.mjs`.
9. After the first quoting, parsing, encoding, or mojibake failure, stop trying variants and switch to the deterministic helper route.

## Text policy

Choose format in this order: explicit user requirement, project policy, `.editorconfig`/`.gitattributes`/existing bytes, then UTF-8 without BOM and LF for new text.

Never guess a legacy encoding or save text decoded with replacement characters. For an ASCII-only change in a non-UTF-8 or unknown file, use `safe-text-io/scripts/replace-ascii-bytes.mjs` with an expected replacement count.

## Platform notes

- Windows PowerShell 5.1 text defaults are not portable. Prefer ASCII-only `.ps1`; if non-ASCII is required, document and verify a BOM-based exception.
- `ssh -n` is useful only when SSH must not consume parent stdin; never place it inside `rsync -e`.
- Persistent JavaScript REPLs retain top-level names. Use fresh names/`var` for probes or a repeatable script/spec.
- Long remote work should run under remote supervision with logs and polling.

## Verification and references

Inspect changed text with `safe-text-io/scripts/inspect-text.mjs`, verify exit codes, and test risky paths with spaces, quotes, `$`, a newline, and non-ASCII text.

Read detailed recipes only when relevant:

- `docs/field-notes.md` for field-tested traps;
- `docs/remote-io-recipes.md` for SSH/rsync/SFTP/remote jobs;
- `docs/external-tools.md` for optional linters and scanners;
- `docs/project-skills-layering.md` for coexistence with domain skills;
- `docs/cursor-hooks.md` and `docs/codex-hooks.md` for mechanical enforcement.
