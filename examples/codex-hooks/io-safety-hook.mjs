#!/usr/bin/env node
import process from "node:process";
import { evaluateShellCommand } from "../../skills/safe-shell-io/scripts/shell-policy.mjs";

async function readPayload() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function deny(reason) {
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  })}\n`);
}

try {
  const argv = process.argv.slice(2);
  const modeIndex = argv.indexOf("--mode");
  const mode = modeIndex === -1 ? "strict" : argv[modeIndex + 1];
  if (!new Set(["strict", "context"]).has(mode)) throw new Error("--mode must be strict or context");
  const payload = await readPayload();
  const rawCommand = payload?.tool_input?.command;
  const command = Array.isArray(rawCommand) ? rawCommand.join(" ") : rawCommand;
  if (typeof command !== "string") throw new Error("tool_input.command is missing or is not a string/array");
  const finding = evaluateShellCommand(command);
  if (finding.decision === "deny" || (finding.decision === "review" && mode === "strict")) {
    deny(`${finding.reason} ${finding.remediation}`.trim());
  } else if (finding.decision === "review") {
    process.stdout.write(`${JSON.stringify({ additionalContext: `${finding.reason} ${finding.remediation}`.trim() })}\n`);
  } else process.stdout.write("{}\n");
} catch (error) {
  // Codex continues after hook process failures, so malformed input must produce a valid deny response.
  deny(`I/O safety hook could not inspect the command: ${error.message}`);
}
