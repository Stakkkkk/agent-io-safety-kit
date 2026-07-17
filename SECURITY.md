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

## Trust boundaries

- Treat command specs and script files as executable input; review them before running.
- `doctor --external` only resolves optional programs on `PATH`. `doctor --external-run` executes those resolved programs with bounded output/time and must be used only with a trusted `PATH` and trusted project directory.
- Hook adapters are deterministic filters, not sandboxes. Host hook coverage may be incomplete, and hook process failures may be fail-open unless the adapter/config explicitly converts failures to denial.
- Deployment rejects path traversal and symlinked write paths, writes atomically where the filesystem supports same-volume rename, and uses the manifest to avoid deleting untracked files. A local user able to alter the package, manifest, or target directory remains inside the trust boundary.
- Verify release `.tgz` assets against the adjacent SHA-256 file before using them in a sensitive environment.
- Helper timeouts terminate the direct child process, not an arbitrary descendant process tree. Do not use them as a sandbox for hostile programs; supervise long or remote jobs with platform-native process controls.
