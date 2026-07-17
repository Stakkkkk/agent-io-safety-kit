#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { runProcess } from "../../../lib/process.mjs";
import { decodeUtf8Text } from "../../../lib/text.mjs";

const ALLOWED_SPEC_KEYS = new Set(["script", "args", "nodeArgs", "cwd", "stdin", "timeoutMs", "maxOutputBytes"]);
const FORBIDDEN_NODE_ARGS = new Set(["-e", "--eval", "-p", "--print"]);

function usage() {
  process.stderr.write(
    "usage: node run-node-utf8.mjs <script.mjs> [--] [arg ...]\n" +
      "   or: node run-node-utf8.mjs --spec <spec.json>\n",
  );
}

function assertStringArray(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && !item.includes("\0"))) {
    throw new Error(`${label} must be an array of strings without NUL`);
  }
  return value;
}

function positiveInteger(value, fallback, label) {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result <= 0) throw new Error(`${label} must be a positive integer`);
  return result;
}

function parseArgs(argv) {
  if (argv.length === 0) throw new Error("missing script or --spec");
  if (argv.length === 1 && new Set(["--help", "-h"]).has(argv[0])) return { help: true };
  if (argv[0] === "--spec") {
    if (!argv[1] || argv.length !== 2) throw new Error("--spec requires exactly one path");
    return { specPath: argv[1] };
  }
  const separator = argv.indexOf("--");
  if (separator > 1) throw new Error("-- separator must follow the script path");
  return { scriptPath: argv[0], args: separator === 1 ? argv.slice(2) : argv.slice(1) };
}

async function loadSpec(specPath) {
  const absoluteSpec = path.resolve(specPath);
  const spec = JSON.parse(decodeUtf8Text(await readFile(absoluteSpec), specPath, { allowBom: false }));
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new Error("spec must be an object");
  const unknown = Object.keys(spec).filter((key) => !ALLOWED_SPEC_KEYS.has(key));
  if (unknown.length > 0) throw new Error(`unknown spec field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`);
  if (typeof spec.script !== "string" || spec.script.length === 0 || spec.script.includes("\0")) {
    throw new Error("spec.script must be a non-empty string without NUL");
  }
  if (spec.stdin !== undefined && typeof spec.stdin !== "string") throw new Error("spec.stdin must be a string");
  if (spec.cwd !== undefined && (typeof spec.cwd !== "string" || spec.cwd.length === 0 || spec.cwd.includes("\0"))) {
    throw new Error("spec.cwd must be a non-empty string");
  }
  const baseDir = path.dirname(absoluteSpec);
  return {
    scriptPath: path.resolve(baseDir, spec.script),
    args: assertStringArray(spec.args, "spec.args"),
    nodeArgs: assertStringArray(spec.nodeArgs, "spec.nodeArgs"),
    cwd: spec.cwd === undefined ? baseDir : path.resolve(baseDir, spec.cwd),
    stdin: spec.stdin,
    timeoutMs: positiveInteger(spec.timeoutMs, 30_000, "spec.timeoutMs"),
    maxOutputBytes: positiveInteger(spec.maxOutputBytes, 16 * 1024 * 1024, "spec.maxOutputBytes"),
  };
}

async function validateScript(scriptPath) {
  const extension = path.extname(scriptPath).toLowerCase();
  if (new Set([".md", ".markdown"]).has(extension)) {
    throw new Error(`${scriptPath}: Markdown is text, not a Node.js script; use read-text.mjs`);
  }
  const metadata = await stat(scriptPath).catch((error) => {
    if (error.code === "ENOENT") throw new Error(`${scriptPath}: script file does not exist`);
    throw error;
  });
  if (!metadata.isFile()) throw new Error(`${scriptPath}: script path is not a file`);
  decodeUtf8Text(await readFile(scriptPath), scriptPath);
}

async function runNode(config) {
  const nodeArgs = config.nodeArgs ?? [];
  if (nodeArgs.some((arg) => FORBIDDEN_NODE_ARGS.has(arg) || arg.startsWith("--eval=") ||
      arg.startsWith("--print=") || /^-[ep]+/u.test(arg))) {
    throw new Error("nodeArgs must not enable inline eval/print; provide a UTF-8 script file");
  }
  await validateScript(config.scriptPath);
  const result = await runProcess(process.execPath, [...nodeArgs, config.scriptPath, ...(config.args ?? [])], {
    cwd: config.cwd ?? process.cwd(),
    stdin: Buffer.from(config.stdin ?? "", "utf8"),
    timeoutMs: config.timeoutMs ?? 30_000,
    maxStdoutBytes: config.maxOutputBytes ?? 16 * 1024 * 1024,
    maxStderrBytes: config.maxOutputBytes ?? 16 * 1024 * 1024,
  });
  if (result.limit) throw new Error(`${result.limit.stream} exceeded maxOutputBytes (${result.limit.maximum})`);
  const stdout = decodeUtf8Text(result.stdout, "child stdout");
  const stderr = decodeUtf8Text(result.stderr, "child stderr");
  process.stdout.write(Buffer.from(stdout, "utf8"));
  process.stderr.write(Buffer.from(stderr, "utf8"));
  if (result.timedOut) {
    process.stderr.write(`run-node-utf8: timed out after ${config.timeoutMs ?? 30_000} ms\n`);
    return 124;
  }
  if (result.signal) {
    process.stderr.write(`run-node-utf8: child exited from signal ${result.signal}\n`);
    return 1;
  }
  return result.code ?? 1;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) usage();
  else if (options.specPath) process.exitCode = await runNode(await loadSpec(options.specPath));
  else {
    process.exitCode = await runNode({
      scriptPath: path.resolve(options.scriptPath),
      args: options.args,
      timeoutMs: 30_000,
      maxOutputBytes: 16 * 1024 * 1024,
    });
  }
} catch (error) {
  usage();
  process.stderr.write(`run-node-utf8: ${error.message}\n`);
  process.exitCode = 2;
}
