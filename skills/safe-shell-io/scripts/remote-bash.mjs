#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { resolveExecutable, runProcess } from "../../../lib/process.mjs";
import { decodeUtf8Text, normalizeLf } from "../../../lib/text.mjs";

function usage() {
  process.stderr.write(
    "usage: node remote-bash.mjs [--print-normalized] [--diagnose-ssh] [--ssh <ssh>] " +
      "[--ssh-arg <arg>] [--timeout-ms <n>] [--max-output-bytes <n>] [--] <host> <script>\n",
  );
}

function parsePositive(value, flag, { zero = false } = {}) {
  if (!new RegExp(zero ? "^(0|[1-9][0-9]*)$" : "^[1-9][0-9]*$").test(value ?? "")) {
    throw new Error(`${flag} requires ${zero ? "a non-negative" : "a positive"} integer`);
  }
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`${flag} is too large`);
  return result;
}

function parseArgs(argv) {
  const options = {
    ssh: "ssh",
    sshArgs: [],
    diagnoseSsh: false,
    printNormalized: false,
    timeoutMs: 300_000,
    maxOutputBytes: 16 * 1024 * 1024,
  };
  const positional = [];
  let terminated = false;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (terminated) positional.push(value);
    else if (value === "--") terminated = true;
    else if (value === "--help" || value === "-h") options.help = true;
    else if (value === "--diagnose-ssh") options.diagnoseSsh = true;
    else if (value === "--print-normalized") options.printNormalized = true;
    else if (value === "--ssh" || value === "--ssh-arg" || value === "--timeout-ms" || value === "--max-output-bytes") {
      const next = argv[++index];
      if (next === undefined) throw new Error(`${value} requires a value`);
      if (value === "--ssh") options.ssh = next;
      else if (value === "--ssh-arg") options.sshArgs.push(next);
      else if (value === "--timeout-ms") options.timeoutMs = parsePositive(next, value, { zero: true });
      else options.maxOutputBytes = parsePositive(next, value);
    } else if (value.startsWith("--")) throw new Error(`unknown option: ${value}`);
    else positional.push(value);
  }
  if (!options.help) {
    if (positional.length !== 2) throw new Error("expected <host> and <script>");
    [options.host, options.scriptPath] = positional;
  }
  return options;
}

function present(value) {
  return value ? "present" : "missing";
}

async function sshDiagnostic(options) {
  const resolved = await resolveExecutable(options.ssh);
  return [
    "remote-bash ssh diagnostic:",
    `  ssh option: ${options.ssh}`,
    `  resolved ssh: ${resolved ?? "not found on PATH"}`,
    `  host: ${options.host}`,
    `  extra ssh args: ${options.sshArgs.length}`,
    `  SSH_AUTH_SOCK: ${present(process.env.SSH_AUTH_SOCK)}`,
    `  HOME: ${present(process.env.HOME)}`,
    `  USERPROFILE: ${present(process.env.USERPROFILE)}`,
    "  pass the same binary/config/identity as interactive ssh with --ssh and repeated --ssh-arg",
  ].join("\n");
}

async function loadNormalizedScript(scriptPath) {
  const metadata = await stat(scriptPath).catch((error) => {
    if (error.code === "ENOENT") {
      throw new Error(
        `${scriptPath}: script file does not exist; create a local UTF-8 Bash script first, ` +
          "or use a simple fixed ssh command when no script is needed",
      );
    }
    throw error;
  });
  if (!metadata.isFile()) throw new Error(`${scriptPath}: script path is not a file`);
  return normalizeLf(decodeUtf8Text(await readFile(scriptPath), scriptPath));
}

async function runRemote(options, scriptText) {
  const result = await runProcess(options.ssh, [...options.sshArgs, options.host, "bash", "-s"], {
    stdin: Buffer.from(scriptText, "utf8"),
    timeoutMs: options.timeoutMs,
    maxStdoutBytes: options.maxOutputBytes,
    maxStderrBytes: options.maxOutputBytes,
    collectStdout: false,
    collectStderr: false,
    onStdout: (chunk) => process.stdout.write(chunk),
    onStderr: (chunk) => process.stderr.write(chunk),
  });
  if (result.limit) {
    process.stderr.write(`remote-bash: ${result.limit.stream} exceeded --max-output-bytes (${result.limit.maximum})\n`);
    return 1;
  }
  if (result.timedOut) {
    process.stderr.write(`remote-bash: timed out after ${options.timeoutMs} ms\n`);
    return 124;
  }
  if (result.signal) {
    process.stderr.write(`remote-bash: ssh exited from signal ${result.signal}\n`);
    return 1;
  }
  const code = result.code ?? 1;
  if (code !== 0) {
    const resolved = await resolveExecutable(options.ssh);
    process.stderr.write(
      `remote-bash: ssh exited with code ${code}; used ${resolved ?? options.ssh}. ` +
        "Rerun with --diagnose-ssh and pass matching --ssh/--ssh-arg settings.\n",
    );
  }
  return code;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) usage();
  else {
    if (options.diagnoseSsh) process.stderr.write(`${await sshDiagnostic(options)}\n`);
    const scriptText = await loadNormalizedScript(options.scriptPath);
    if (options.printNormalized) process.stdout.write(Buffer.from(scriptText, "utf8"));
    else process.exitCode = await runRemote(options, scriptText);
  }
} catch (error) {
  usage();
  process.stderr.write(`remote-bash: ${error.message}\n`);
  process.exitCode = 2;
}
