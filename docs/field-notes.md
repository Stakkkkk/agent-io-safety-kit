# Field notes: real I/O traps

[Russian version](ru/field-notes.md)

These notes are practical traps observed during real agent work. They are not all core rules, but they are good routing hints for agents.

## UTF-8 bytes are valid, but terminal output is mojibake

PowerShell, terminal code pages, tool stdout encoding, and file bytes are separate boundaries. If a UTF-8 file looks corrupted only in the terminal:

1. do not rewrite the file;
2. inspect bytes first:

```sh
node skills/safe-text-io/scripts/inspect-text.mjs path/to/file.md
```

3. if needed, inspect hex bytes or read the file with a known decoder;
4. treat the terminal/tool output as suspect until byte-level checks confirm damage.

## `ssh -n` is useful, but not inside `rsync -e`

`ssh -n` prevents an SSH command from reading stdin. This helps nested read-only SSH commands that should not consume the parent script’s stdin.

Do not use it inside `rsync -e "ssh -n ..."`. `rsync` uses the SSH process stdin/stdout as its protocol channel, so `ssh -n` can break the transfer.

## Multi-level here-docs can corrupt string literals

If Python creates a shell here-doc that embeds Python code, escape layers can turn `\\n` into a real newline inside a remote string literal.

Prefer:

- upload a script file via SFTP/scp;
- send raw bytes through stdin;
- use Base64 for data payloads;
- keep remote command strings fixed and small.

See `docs/remote-io-recipes.md`.

## PowerShell + SSH can degrade `\n` into `n...n`

If PowerShell builds an SSH command string that contains `\n`, that sequence may be interpreted by the wrong layer, remain literal, or degrade into output such as `n...n`.

Do not depend on `\n` escaping across PowerShell → SSH → remote shell. For tiny fixed text, use repeated fixed `echo` commands. For real payloads, upload a file, stream stdin, or pass JSON/Base64 data.

See `examples/powershell-ssh-newlines.md`.

## Paramiko SFTP rename may not overwrite

`sftp.rename(tmp, target)` can fail when `target` already exists. Some servers return a generic `Failure`.

Safer pattern:

1. prefer `posix_rename` when available;
2. otherwise remove the target explicitly, then rename;
3. accept that remove+rename is not atomic;
4. verify the final file.

## PowerShell ranges need expression syntax

This can fail or be parsed unexpectedly:

```powershell
Select-Object -Index 94..112
```

Prefer:

```powershell
Select-Object -Index (94..112)
```

or:

```powershell
Select-Object -Skip 94 -First 19
```

See `examples/powershell-select-object.md`.

## Long SSH/rsync operations should survive client disconnects

Long remote operations should not depend on a local terminal or SSH session staying alive.

Prefer remote supervision:

- `nohup ... >log 2>&1 &`;
- `systemd-run --user ...`;
- `tmux` / `screen` where policy allows;
- remote log file plus polling.

## Non-UTF-8 files should not be “fixed” with replacement decoding

If a file is not valid UTF-8 and the needed edit is ASCII-only, byte-level ASCII replacement is safer than decoding the whole file with replacement characters.

Use:

```sh
node skills/safe-text-io/scripts/replace-ascii-bytes.mjs --input file --in-place --search old/ascii/path --replace new/ascii/path
```

Do not use this for non-ASCII edits or unknown semantic changes.

## Floating Docker tags are a migration risk

This is not a core shell/text I/O rule, but it is a useful deployment-safety recipe.

Do not blindly `docker pull` floating tags such as `latest` or an unpinned `IMAGE_TAG` during migration. First compare image ID/digest. If exact preservation matters, use `docker save` and `docker load`.
