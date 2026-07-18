function executableBaseName(value) {
  return value.replaceAll("\\", "/").split("/").pop().toLowerCase().replace(/\.exe$/u, "");
}

function tokenize(command) {
  const tokens = [];
  let value = "";
  let quote = "";
  let quoted = false;
  let escaped = false;

  function push() {
    if (value || quoted) tokens.push({ value, quoted, separator: false });
    value = "";
    quoted = false;
  }

  for (const char of command) {
    if (escaped) {
      value += char;
      escaped = false;
    } else if (quote) {
      if (char === quote) {
        quote = "";
        quoted = true;
      } else if (quote === '"' && char === "\\") escaped = true;
      else value += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      quoted = true;
    } else if (/\s/u.test(char)) push();
    else if ("|;&\n".includes(char)) {
      push();
      tokens.push({ value: char, separator: true, quoted: false });
    } else value += char;
  }
  push();
  return tokens;
}

function segments(command) {
  const output = [];
  let current = [];
  for (const token of tokenize(command)) {
    if (token.separator) {
      if (current.length > 0) output.push(current);
      current = [];
    } else current.push(token);
  }
  if (current.length > 0) output.push(current);
  return output;
}

function isInlineOption(executable, option) {
  const name = executableBaseName(executable);
  const lower = option.toLowerCase();
  if (name === "node") {
    return new Set(["-e", "--eval", "-p", "--print"]).has(lower) ||
      lower.startsWith("--eval=") || lower.startsWith("--print=") || /^-[ep].+/u.test(lower);
  }
  if (["python", "python3", "py"].includes(name)) return lower === "-c" || /^-c.+/u.test(lower);
  if (["ruby", "perl"].includes(name)) return lower === "-e" || /^-[a-z]*e[a-z]*$/iu.test(lower);
  if (["powershell", "pwsh"].includes(name)) {
    return new Set(["-command", "/command", "-c", "/c", "-encodedcommand", "/encodedcommand", "-enc", "/enc"]).has(lower);
  }
  if (name === "cmd") return lower === "/c" || lower === "-c";
  if (["bash", "sh"].includes(name)) return lower === "-c" || /^-[a-z]*c[a-z]*$/iu.test(lower);
  return false;
}

function inlineSegments(command) {
  return segments(command).filter((segment) =>
    segment.length > 1 && segment.slice(1).some((token) => isInlineOption(segment[0].value, token.value))
  );
}

function hasNodeMarkdown(command) {
  const consumes = new Set(["-r", "--require", "--import", "--loader", "--experimental-loader", "--title"]);
  for (const segment of segments(command)) {
    if (executableBaseName(segment[0]?.value ?? "") !== "node") continue;
    let terminated = false;
    for (let index = 1; index < segment.length; index += 1) {
      const arg = segment[index].value;
      if (!terminated && isInlineOption("node", arg)) break;
      if (!terminated && arg === "--") {
        terminated = true;
        continue;
      }
      if (!terminated && consumes.has(arg)) {
        index += 1;
        continue;
      }
      if (!terminated && arg.startsWith("-")) continue;
      if (/\.(?:md|markdown)$/iu.test(arg)) return true;
      break;
    }
  }
  return false;
}

function hasRsyncSshN(command) {
  for (const segment of segments(command)) {
    if (executableBaseName(segment[0]?.value ?? "") !== "rsync") continue;
    const joined = segment.map((token) => token.value).join(" ");
    if (/\bssh(?:\.exe)?\s+-[A-Za-z]*n[A-Za-z]*(?:\s|$)/iu.test(joined)) return true;
  }
  return false;
}

function hasRgDashPattern(command) {
  for (const segment of segments(command)) {
    if (executableBaseName(segment[0]?.value ?? "") !== "rg") continue;
    let terminated = false;
    for (const token of segment.slice(1)) {
      if (token.value === "--") {
        terminated = true;
        continue;
      }
      if (!terminated && token.quoted && token.value.startsWith("-")) return true;
    }
  }
  return false;
}

function hasRemoteDockerTemplate(command) {
  for (const segment of segments(command)) {
    if (executableBaseName(segment[0]?.value ?? "") !== "ssh") continue;
    const remote = segment.slice(1).map((token) => token.value).join(" ");
    const inspect = /\bdocker(?:\s+container)?\s+inspect\b/iu.test(remote);
    const format = /(?:^|\s)(?:-f|--format)(?:=|\s)/iu.test(remote);
    if (inspect && format && remote.includes("{{") && remote.includes("}}")) return true;
  }
  return false;
}

function hasDockerDownWithFilesystemMutation(command) {
  const down = /\bdocker(?:\.exe)?\s+compose\b[^\r\n]*\bdown\b/iu.test(command);
  const mutation = /(?:^|[\s;&|])(?:sudo\s+)?(?:chown|chmod|mv|mkdir)(?:\s|$)/iu.test(command);
  return down && mutation;
}

function finding(decision, code, reason, remediation) {
  return { decision, code, reason, remediation };
}

export function evaluateShellCommand(value) {
  const command = typeof value === "string" ? value : "";
  if (!command) return finding("allow", "empty", "No shell command was supplied.", "");
  if (hasRsyncSshN(command)) {
    return finding("deny", "rsync-ssh-n", "rsync cannot use ssh -n because its protocol needs the SSH stdin/stdout channel.", "Remove -n from the rsync transport.");
  }
  if (/Select-Object\s+-Index\s+\d+\.\.\d+/iu.test(command)) {
    return finding("deny", "powershell-bare-range", "PowerShell may pass an unparenthesized -Index range as a string.", "Use -Index (94..112), or -Skip/-First.");
  }
  if (hasNodeMarkdown(command)) {
    return finding("deny", "node-markdown", "Markdown is text, not a Node.js script.", "Read it with safe-text-io/scripts/read-text.mjs.");
  }
  if (hasRemoteDockerTemplate(command)) {
    return finding("deny", "remote-docker-template", "Docker Go templates are not safe inside layered PowerShell/SSH quoting.", "Put docker inspect --format in a reviewed UTF-8 Bash file and run it with remote-bash.mjs.");
  }
  if (hasDockerDownWithFilesystemMutation(command)) {
    return finding("review", "docker-bind-mount-preflight", "Container shutdown and filesystem ownership/directory mutations are combined without a separately verifiable privilege preflight.", "First run a read-only sudo, container UID/GID, and host stat preflight; only then run the state-changing phase separately.");
  }

  const inline = inlineSegments(command);
  const secret = /(?:^|[\s"'=])(?:\.env|[^\s"'=]+\.(?:env|toml|json|ya?ml))\b/iu.test(command) ||
    /\b(?:authorization|bearer|token|secret|password|credential|api[_-]?key|private[_-]?key|openai_api_key|github_token|gh_token)\b/iu.test(command) ||
    /\bsk-[A-Za-z0-9_-]{8,}\b/u.test(command);
  if (inline.length > 0 && secret) {
    return finding("deny", "inline-secret-processing", "Inline interpreter code must not read or redact config, environment, or secrets.", "Use a native API, a reviewed script file, run-from-spec.mjs, or run-node-utf8.mjs --spec and print only allowlisted metadata.");
  }

  const complexity = [..."$`{}[]|&;<>()'\""].some((character) => command.includes(character)) ||
    /\/[^/\s]+\/[a-z]*/iu.test(command) ||
    /\b(?:regex|replace|readFile|readFileSync|Get-Content|Select-String|JSON\.parse|toml|yaml)\b/iu.test(command);
  if (inline.length > 0 && complexity) {
    return finding("review", "complex-inline-interpreter", "Inline interpreter code crosses multiple quoting/parsing boundaries.", "Move the code to a script file or a structured JSON spec.");
  }
  if (/\bssh(?:\.exe)?\b/iu.test(command) && /\\n/u.test(command)) {
    return finding("review", "ssh-literal-newline", "A literal \\n may be interpreted by the wrong PowerShell/SSH layer.", "Stream or upload an LF-normalized script/payload instead.");
  }
  if (hasRgDashPattern(command)) {
    return finding("review", "rg-leading-dash", "ripgrep may parse a leading-dash pattern as an option.", "Use rg -- \"-pattern\" or rg --fixed-strings -- \"-literal\".");
  }
  const nounset = /\bset\s+-[A-Za-z]*u[A-Za-z]*(?:\s|;|&&|\|\||$)/u.test(command) || /\bset\s+-o\s+nounset\b/u.test(command);
  if (nounset && /"[^"]*\$[A-Za-z_][A-Za-z0-9_]*[^"]*"/u.test(command)) {
    return finding("review", "nounset-double-quoted-dollar", "set -u can expand config text that looks like a shell variable.", "Use single quotes, fixed-string search, or a script file.");
  }
  return finding("allow", "safe-shape", "No known mechanical I/O hazard was detected.", "");
}
