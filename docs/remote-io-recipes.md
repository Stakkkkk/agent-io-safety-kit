# Remote I/O recipes

[Russian version](ru/remote-io-recipes.md)

Remote execution combines several fragile boundaries. Treat each boundary separately.

```text
local process → local argv/shell → transport → remote shell → remote interpreter → remote files
```

## Keep remote command strings fixed

Bad pattern:

```python
command = f"ssh host \"python3 - <<'PY'\nprint('{user_text}')\nPY\""
```

This mixes Python string escaping, local shell quoting, SSH command transport, remote shell parsing, and remote Python parsing.

Safer patterns:

- upload a script file via SFTP/scp, then run a fixed command;
- send script bytes through stdin;
- encode data payloads as Base64 or JSON files;
- pass only stable paths or fixed flags through the remote command line.

If the remote snippet contains pipes, `$`, regex, quotes, `sed`, `awk`, or `grep`, treat it as a script, not as an SSH one-liner. Local argv arrays do not remove the remote shell parser; `ssh host command args...` is still interpreted remotely.

## Windows to remote Bash

PowerShell here-strings and Windows-authored files can carry CRLF into `ssh host bash -s`. Normalize scripts to LF before sending:

```sh
node skills/safe-shell-io/scripts/remote-bash.mjs host script.sh
```

Use `--print-normalized` for a local dry check:

```sh
node skills/safe-shell-io/scripts/remote-bash.mjs --print-normalized host script.sh
```

If normal `ssh host ...` works but the helper does not, check which SSH executable and environment the helper sees:

```sh
node skills/safe-shell-io/scripts/remote-bash.mjs --diagnose-ssh host script.sh
```

On Windows, force the same OpenSSH executable, config, and identity that work interactively:

```sh
node skills/safe-shell-io/scripts/remote-bash.mjs --ssh "C:\Windows\System32\OpenSSH\ssh.exe" --ssh-arg -F --ssh-arg "C:\Users\me\.ssh\config" --ssh-arg -i --ssh-arg "C:\Users\me\.ssh\id_ed25519" host script.sh
```

Pass each SSH option as its own repeated `--ssh-arg`.

The helper reads the script as strict UTF-8, rejects UTF-16/invalid UTF-8, converts `CRLF`/`CR` to `LF`, and sends bytes to `ssh host bash -s` without a local shell.

## Docker inspect Go templates through PowerShell and SSH

Docker's `--format` value is a Go template with braces, quotes, variables, and function calls. Docker itself documents shell-specific quoting for these templates: <https://docs.docker.com/engine/cli/formatting/>. Adding both PowerShell and a remote shell makes an inline command such as this nondeterministic:

```powershell
ssh host "docker inspect -f '{{...}}' container"
```

Do not repair `template parsing error: unterminated quoted string` by trying more quote combinations. Put the command in a local strict UTF-8/LF Bash file instead. In a `full` deployment, `examples/docker-remote-inspect.sh` demonstrates a secret-minimizing inspection that prints the configured user, label keys, and environment-variable names without environment values:

```sh
node skills/safe-shell-io/scripts/remote-bash.mjs --print-normalized host examples/docker-remote-inspect.sh
node skills/safe-shell-io/scripts/remote-bash.mjs host examples/docker-remote-inspect.sh
```

Edit the fixed container name in the reviewed script before execution. Do not interpolate an untrusted container name or template into the SSH command.

## Preflight before Docker bind-mount changes

Bind mounts expose host paths directly to containers and can modify host filesystem data; Docker documents this boundary at <https://docs.docker.com/engine/storage/bind-mounts/>. Treat ownership/mode migrations as two distinct phases.

Phase 1 is read-only and must finish before `docker compose down`:

1. Check whether the current account is root or `sudo -n true` succeeds. Interactive sudo is not acceptable in an unattended agent operation.
2. While the container is still running, obtain its effective UID/GID with `docker exec <container> id -u` and `id -g`; do not rely on a product-wide default such as `7474:7474` without verifying the actual image/container.
3. Run `stat -c 'uid=%u gid=%g mode=%a path=%n' -- <path>` for every existing bind source and the parent of every path that will be created.
4. Confirm that the planned UID/GID matches the running process and identify every path that needs `chown`/`chmod`.
5. For restricted sudoers, read-only filesystems, NFS root-squash, or similar boundaries, arrange an approved disposable ownership probe on the same filesystem. `sudo -n true` alone cannot prove that a particular filesystem accepts `chown`.

`examples/docker-bind-mount-preflight.sh` implements the non-mutating checks with fixed reviewed values. Run it locally on the Docker host or send it with `remote-bash.mjs`. It contains no `down`, move, directory creation, ownership change, or mode change.

Only after it prints `READY` should phase 2 stop containers, make backups, recreate paths, change ownership/modes, and start the stack. Keep rollback paths and verification in that separate state-changing script. If the preflight cannot prove privilege or identity, stop before changing state and ask the user/admin.

## PowerShell/SSH newline escapes

Do not pass newlines as `\n` through PowerShell → SSH → remote shell quoting. Depending on the layers, the remote side may see a literal backslash-n, a real newline in the wrong place, or output such as `n...n`.

For tiny fixed output, repeated `echo` commands are clearer than cross-layer newline escaping:

```powershell
ssh host "echo 'line 1'; echo 'line 2'"
```

For generated or user-controlled payloads, do not use `echo`. Upload a file, stream bytes through stdin, or send JSON/Base64 data and decode it remotely.

See `examples/powershell-ssh-newlines.md` in a `full` deployment; this recipe remains self-contained in `core`.

## `ssh -n`

Use `ssh -n` when a nested SSH command must not read the parent script’s stdin.

Do not use `ssh -n` inside `rsync -e`, because rsync uses SSH stdin/stdout as a protocol channel.

## Long-running remote operations

Avoid keeping long migrations tied to a local SSH window.

Prefer:

```sh
nohup ./long-task.sh >long-task.log 2>&1 &
```

or:

```sh
systemd-run --user --unit agent-long-task ./long-task.sh
```

Then poll:

```sh
ssh host tail -n 100 long-task.log
ssh host test -f long-task.done
```

## SFTP atomic-ish replace

For Paramiko-style SFTP clients:

1. upload to a temporary path in the same directory;
2. verify size/hash if practical;
3. use `posix_rename(tmp, target)` when available;
4. fallback to `remove(target)` then `rename(tmp, target)` only when atomic replacement is unavailable and acceptable;
5. verify the final target.

Document the fallback because remove+rename is not atomic.

## Remote text encoding

Remote stdout encoding is a separate boundary. If remote output looks corrupted:

- verify remote file bytes;
- verify the remote program output encoding;
- verify the local decoder;
- do not rewrite remote files based only on terminal appearance.
