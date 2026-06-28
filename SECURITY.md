# Security Policy

Agent I/O Safety Kit is a local developer tool. The main risks are accidental command execution, text corruption, path traversal, and secret leakage through diagnostics or command specs.

## Supported versions

Only the latest released version is actively supported.

## Reporting a vulnerability

Please use GitHub Security Advisories for private reports when available.

If advisories are unavailable, open a minimal public issue that describes the class of problem without including secrets, exploit payloads for real systems, or private repository details.

Useful details:

- OS and shell;
- Node.js version;
- affected script or rule;
- whether symlinks, path traversal, command specs, stdin/stdout, or text decoding are involved;
- minimal reproduction using non-sensitive data.

## Handling secrets

Do not store secrets in command specs that are committed to a repository. Prefer short-lived local files, environment variables, or platform secret stores. Avoid including secrets in diagnostic output.
