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
