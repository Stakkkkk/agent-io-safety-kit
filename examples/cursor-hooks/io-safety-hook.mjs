#!/usr/bin/env node
import process from "node:process";

function usage() {
  process.stderr.write("usage: node io-safety-hook.mjs --event beforeShellExecution\n");
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--event") {
      options.event = argv[++index];
      if (!options.event) throw new Error("--event requires a value");
    } else if (value === "--help" || value === "-h") {
      options.help = true;
    } else {
      throw new Error(`unknown option: ${value}`);
    }
  }
  return options;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : {};
}

function respond(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function allow() {
  respond({ permission: "allow" });
}

function deny(userMessage, agentMessage) {
  respond({
    permission: "deny",
    user_message: userMessage,
    agent_message: agentMessage,
  });
}

function ask(userMessage, agentMessage) {
  respond({
    permission: "ask",
    user_message: userMessage,
    agent_message: agentMessage,
  });
}

function hasRsyncSshN(command) {
  return /\brsync\b/i.test(command) && /\bssh\s+-[A-Za-z]*n[A-Za-z]*(?:\s|["']|$)/i.test(command);
}

function hasLiteralNewlineEscapeThroughSsh(command) {
  return /\bssh\b/i.test(command) && /\\n/.test(command);
}

function hasPowerShellBareRange(command) {
  return /Select-Object\s+-Index\s+\d+\.\.\d+/i.test(command);
}

function isRipgrepExecutable(value) {
  const baseName = value.replaceAll("\\", "/").split("/").pop().toLowerCase();
  return baseName === "rg" || baseName === "rg.exe";
}

function tokenizeShellLike(command) {
  const tokens = [];
  let current = "";
  let quoted = false;
  let quote = "";
  let escaped = false;

  function pushToken() {
    if (current || quoted) tokens.push({ value: current, quoted, separator: false });
    current = "";
    quoted = false;
  }

  for (const char of command) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = "";
        quoted = true;
      } else if (quote === '"' && char === "\\") {
        escaped = true;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      quoted = true;
    } else if (/\s/u.test(char)) {
      pushToken();
    } else if ("|;&".includes(char)) {
      pushToken();
      tokens.push({ value: char, quoted: false, separator: true });
    } else {
      current += char;
    }
  }

  pushToken();
  return tokens;
}

function hasRipgrepLeadingDashPatternWithoutTerminator(command) {
  const tokens = tokenizeShellLike(command);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.separator || !isRipgrepExecutable(token.value)) continue;

    let afterTerminator = false;
    for (let argIndex = index + 1; argIndex < tokens.length; argIndex += 1) {
      const arg = tokens[argIndex];
      if (arg.separator) break;
      if (arg.value === "--") {
        afterTerminator = true;
        continue;
      }
      if (!afterTerminator && arg.quoted && arg.value.startsWith("-")) return true;
    }
  }

  return false;
}

function checkBeforeShellExecution(payload) {
  const command = String(payload.command ?? "");
  if (!command) return allow();

  if (hasRsyncSshN(command)) {
    return deny(
      "Blocked rsync with ssh -n. rsync uses the SSH stdin/stdout channel for its protocol.",
      "Do not put ssh -n inside rsync -e. Remove -n from the rsync transport or run a separate supervised remote command.",
    );
  }

  if (hasPowerShellBareRange(command)) {
    return deny(
      "Blocked PowerShell Select-Object -Index range without parentheses.",
      "Use Select-Object -Index (94..112), or prefer -Skip/-First for contiguous line windows.",
    );
  }

  if (hasLiteralNewlineEscapeThroughSsh(command)) {
    return ask(
      "This SSH command contains a literal \\n escape. It may arrive remotely as n...n or be interpreted by the wrong layer.",
      "Avoid passing newlines as \\n through PowerShell/SSH quoting. Use repeated fixed echo commands for tiny fixed text, or upload/stream a file, stdin, JSON, or Base64 payload for real data.",
    );
  }

  if (hasRipgrepLeadingDashPatternWithoutTerminator(command)) {
    return ask(
      "This rg command contains a quoted value that starts with - before an option terminator.",
      "If this is the search pattern, use rg -- \"-pattern\". For literal user text, use rg --fixed-strings -- \"-literal\".",
    );
  }

  return allow();
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    process.exitCode = 0;
  } else if (options.event !== "beforeShellExecution") {
    throw new Error("only --event beforeShellExecution is supported by this example hook");
  } else {
    const payload = await readStdin();
    checkBeforeShellExecution(payload);
  }
} catch (error) {
  usage();
  process.stderr.write(`io-safety-hook: ${error.message}\n`);
  process.exitCode = 1;
}
