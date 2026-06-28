# External tools policy recipe

Copy this policy into a project that wants to combine Agent I/O Safety Kit with existing linters and scanners.

```md
## External tool policy for agents

Use `.agent-io-safety/RULE.md` for shell and text I/O boundaries before invoking domain-specific tools.

If a dedicated tool is already configured for the affected file type, run it after deterministic I/O checks:

- Shell scripts: ShellCheck and shfmt.
- PowerShell: PSScriptAnalyzer plus `inspect-text.mjs --ps51-safe`.
- GitHub Actions: actionlint and, for security review, zizmor.
- Repository secrets: Gitleaks or TruffleHog.
- `.editorconfig`: editorconfig-checker.
- JSON/YAML schemas: Ajv or check-jsonschema.

Do not auto-install or auto-download missing external tools without explicit user approval. If a tool is missing, report the official installation path and continue with the built-in safety checks where possible.
```
