# Safe shell and text I/O rule

## Required route

Before the first related operation, identify the risk boundary and read the relevant skill:

- If a command contains user text, complex arguments, paths with spaces, quotes, shell metacharacters, JSON/YAML/SQL/regex, multiline values, or non-ASCII values — read `./skills/safe-shell-io/SKILL.md`.
- If an operation reads, creates, edits, generates, or transcodes text files, and encoding, BOM, or line endings matter — read `./skills/safe-text-io/SKILL.md`.
- If a command creates a text file or passes text between processes — apply both skills.

Resolve paths relative to this file. Do not rely on automatic skill discovery.

## Policy priority

Determine text format in this order:

1. explicit user requirement;
2. project instructions;
3. `.editorconfig`, `.gitattributes`, tool configuration, and existing file bytes;
4. if no policy exists — UTF-8 without BOM and LF for new text.

Do not guess a legacy encoding and do not rewrite a file after decoding with replacement characters. If a non-UTF-8 or unknown-encoding file only needs an ASCII byte sequence changed, prefer `safe-text-io/scripts/replace-ascii-bytes.mjs` over whole-file text decoding. When ambiguous, stop the conversion, report the observed bytes/BOM, and ask for a decision.

## Safe work methods

1. For normal file edits, use a structured editor or patch API rather than shell redirection.
2. For simple commands, use one shell layer and pass data as separate arguments.
3. Do not nest `sh -c`, `cmd /c`, `powershell -Command`, or equivalent wrappers inside an already-running shell unless unavoidable.
4. Do not interpolate user values into a command line, script, regex, or JSON.
5. For complex argv, create a UTF-8 JSON spec and run `safe-shell-io/scripts/run-from-spec.mjs`.
6. For encoding analysis, transcoding, and ASCII-safe byte replacement, use `safe-text-io` scripts; do not rely on shell defaults.
7. After the first quoting, parsing, or mojibake failure, stop trying variants and switch to the deterministic path from the skills.

## External tools

- If the project already has a dedicated linter, formatter, schema validator, or scanner for the affected file type, run it after this kit has stabilized shell/text I/O boundaries.
- Do not replace a missing external tool with an unapproved download or install. Report the useful tool, provide the official source, and ask for explicit installation approval.
- External tools do not cancel the kit’s core guarantees: exact argv transfer, strict decoding checks, and explicit BOM/line-ending policy.
- Encoding detectors are diagnostic hints only. Do not rewrite a file based on probabilistic detection without an explicit user decision.
- See `docs/external-tools.md` for recommended tools.

## Project skills

- This kit does not replace project-specific or domain-specific skills. It sits below them and controls shell/text I/O boundaries.
- Use project skills to decide what operation should happen; use this kit to decide how to perform the shell/text I/O safely.
- See `docs/project-skills-layering.md` for the layering model.

## Field-tested recipes

Read `docs/field-notes.md` when an operation touches any of these known traps:

- terminal or tool output shows mojibake but file bytes may still be valid;
- SSH, rsync, SFTP, remote shell, here-doc, or long-running remote operations are involved;
- PowerShell ranges or line windows are involved;
- a non-UTF-8 file needs an ASCII-only byte replacement;
- floating Docker tags are being migrated or preserved.

Read `docs/remote-io-recipes.md` before composing multi-layer remote commands. Use `examples/powershell-select-object.md` for PowerShell range syntax and `examples/remote-script-boundaries.md` before embedding scripts inside local-language strings.

## PowerShell

- Always account for differences between Windows PowerShell 5.1 and PowerShell 7+.
- In Windows PowerShell 5.1, do not rely on `Get-Content`, `Set-Content`, `Out-File`, `$OutputEncoding`, the active code page, or redirection without verifying byte semantics.
- For PowerShell 5.1-compatible `.ps1` files, prefer ASCII-only. If non-ASCII is required, explicitly choose a supported BOM-based encoding and document the exception in project policy.
- Use `-LiteralPath` for paths and arrays/splatting for arguments.

## Result verification

Before finishing a task:

1. inspect affected text files with `inspect-text.mjs`;
2. confirm expected encoding, BOM, and line endings;
3. run the relevant command or test with data containing quotes and non-ASCII characters;
4. make sure no step used implicit repeated shell parsing of data.

Explicit project policy can change file formats, but it does not cancel exact argument passing, strict decoding validation, or the ban on trial-and-error “repair” of damaged text.
