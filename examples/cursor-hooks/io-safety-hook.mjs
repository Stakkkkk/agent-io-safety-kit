#!/usr/bin/env node
import process from "node:process";
import { evaluateShellCommand } from "../../skills/safe-shell-io/scripts/shell-policy.mjs";

async function readPayload() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : {};
}

function respond(finding, mode) {
  const permission = finding.decision === "review" ? (mode === "strict" ? "deny" : "ask") : finding.decision;
  process.stdout.write(`${JSON.stringify({
    permission,
    user_message: finding.reason,
    agent_message: finding.remediation,
  })}\n`);
}

try {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && new Set(["--help", "-h"]).has(argv[0])) {
    process.stderr.write("usage: node io-safety-hook.mjs --event beforeShellExecution [--mode strict|advisory]\n");
  } else {
    const eventIndex = argv.indexOf("--event");
    const modeIndex = argv.indexOf("--mode");
    const event = eventIndex === -1 ? undefined : argv[eventIndex + 1];
    const mode = modeIndex === -1 ? "strict" : argv[modeIndex + 1];
    const known = new Set(["--event", "beforeShellExecution", "--mode", "strict", "advisory"]);
    if (argv.some((value) => !known.has(value))) throw new Error("unknown option or value");
    if (event !== "beforeShellExecution") throw new Error("only --event beforeShellExecution is supported");
    if (!new Set(["strict", "advisory"]).has(mode)) throw new Error("--mode must be strict or advisory");
    respond(evaluateShellCommand(String((await readPayload()).command ?? "")), mode);
  }
} catch (error) {
  process.stderr.write(`io-safety-hook: ${error.message}\n`);
  process.exitCode = 2;
}
