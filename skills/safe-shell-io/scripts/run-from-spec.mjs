#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { runProcess } from "../../../lib/process.mjs";
import { atomicWriteFile, decodeUtf8Text } from "../../../lib/text.mjs";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const ALLOWED_KEYS = new Set([
  "$schema", "command", "args", "cwd", "env", "stdin", "stdinFile",
  "stdoutEncoding", "stderrEncoding", "stdoutFile", "stderrFile", "timeoutMs", "maxOutputBytes",
]);

function usage() {
  process.stderr.write("usage: node run-from-spec.mjs <spec.json>\n");
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertString(value, field, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0) || value.includes("\0")) {
    throw new Error(`${field} must be ${allowEmpty ? "a" : "a non-empty"} string without NUL`);
  }
}

function resolveFrom(base, value) {
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(base, value);
}

function decodeOutput(buffer, encoding, field) {
  if (encoding === "raw") return buffer;
  try {
    return Buffer.from(new TextDecoder(encoding, { fatal: true }).decode(buffer), "utf8");
  } catch (error) {
    throw new Error(`${field} is not valid ${encoding}: ${error.message}`);
  }
}

function validateOutputEncoding(encoding, field) {
  if (encoding === "raw") return;
  try {
    new TextDecoder(encoding, { fatal: true });
  } catch (error) {
    throw new Error(`${field} is not a supported TextDecoder encoding: ${error.message}`);
  }
}

function samePath(left, right) {
  const normalize = (value) => process.platform === "win32" ? path.normalize(value).toLowerCase() : path.normalize(value);
  return normalize(left) === normalize(right);
}

async function loadSpec(specPath) {
  const bytes = await readFile(specPath);
  const text = decodeUtf8Text(bytes, "spec", { allowBom: false });
  const spec = JSON.parse(text);
  if (!isObject(spec)) throw new Error("spec root must be an object");
  const unknown = Object.keys(spec).filter((key) => !ALLOWED_KEYS.has(key));
  if (unknown.length > 0) throw new Error(`unknown spec field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`);
  return spec;
}

function validateSpec(spec, specDirectory) {
  if (spec.$schema !== undefined) assertString(spec.$schema, "$schema");
  assertString(spec.command, "command");
  const args = spec.args ?? [];
  if (!Array.isArray(args)) throw new Error("args must be an array of strings");
  args.forEach((value, index) => assertString(value, `args[${index}]`, { allowEmpty: true }));

  const cwdValue = spec.cwd ?? ".";
  assertString(cwdValue, "cwd");
  const cwd = resolveFrom(specDirectory, cwdValue);

  const env = { ...process.env };
  if (spec.env !== undefined) {
    if (!isObject(spec.env)) throw new Error("env must be an object");
    for (const [name, value] of Object.entries(spec.env)) {
      assertString(name, "env key");
      if (name.includes("=")) throw new Error("env keys must not contain =");
      if (value === null) delete env[name];
      else {
        assertString(value, `env.${name}`, { allowEmpty: true });
        env[name] = value;
      }
    }
  }

  if (spec.stdin !== undefined && spec.stdinFile !== undefined) {
    throw new Error("stdin and stdinFile are mutually exclusive");
  }
  if (spec.stdin !== undefined) assertString(spec.stdin, "stdin", { allowEmpty: true });
  for (const field of ["stdinFile", "stdoutFile", "stderrFile", "stdoutEncoding", "stderrEncoding"]) {
    if (spec[field] !== undefined) assertString(spec[field], field);
  }

  const timeoutMs = spec.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = spec.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error("timeoutMs must be a positive integer");
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes <= 0) {
    throw new Error("maxOutputBytes must be a positive integer");
  }

  const stdoutFile = spec.stdoutFile ? resolveFrom(cwd, spec.stdoutFile) : undefined;
  const stderrFile = spec.stderrFile ? resolveFrom(cwd, spec.stderrFile) : undefined;
  const stdoutEncoding = spec.stdoutEncoding ?? "utf8";
  const stderrEncoding = spec.stderrEncoding ?? "utf8";
  validateOutputEncoding(stdoutEncoding, "stdoutEncoding");
  validateOutputEncoding(stderrEncoding, "stderrEncoding");
  if (stdoutFile && stderrFile && samePath(stdoutFile, stderrFile)) {
    throw new Error("stdoutFile and stderrFile must resolve to different paths");
  }

  return {
    command: spec.command,
    args,
    cwd,
    env,
    stdin: spec.stdin,
    stdinFile: spec.stdinFile ? resolveFrom(cwd, spec.stdinFile) : undefined,
    stdoutFile,
    stderrFile,
    stdoutEncoding,
    stderrEncoding,
    timeoutMs,
    maxOutputBytes,
  };
}

async function run(config) {
  const stdin = config.stdinFile ? await readFile(config.stdinFile) : Buffer.from(config.stdin ?? "", "utf8");
  const result = await runProcess(config.command, config.args, {
    cwd: config.cwd,
    env: config.env,
    stdin,
    timeoutMs: config.timeoutMs,
    maxStdoutBytes: config.maxOutputBytes,
    maxStderrBytes: config.maxOutputBytes,
  });

  if (result.limit) {
    throw new Error(`${result.limit.stream} exceeded maxOutputBytes (${result.limit.maximum})`);
  }
  const stdout = decodeOutput(result.stdout, config.stdoutEncoding, "stdout");
  const stderr = decodeOutput(result.stderr, config.stderrEncoding, "stderr");
  if (config.stdoutFile) await atomicWriteFile(config.stdoutFile, stdout);
  else if (stdout.length > 0) process.stdout.write(stdout);
  if (config.stderrFile) await atomicWriteFile(config.stderrFile, stderr);
  else if (stderr.length > 0) process.stderr.write(stderr);

  if (result.timedOut) {
    process.stderr.write(`run-from-spec: timed out after ${config.timeoutMs} ms\n`);
    return 124;
  }
  if (result.signal) {
    process.stderr.write(`run-from-spec: child terminated by signal ${result.signal}\n`);
    return 1;
  }
  return result.code ?? 1;
}

try {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && new Set(["--help", "-h"]).has(argv[0])) {
    usage();
  } else {
    if (argv.length !== 1) throw new Error("expected exactly one spec path");
    const specPath = path.resolve(argv[0]);
    process.exitCode = await run(validateSpec(await loadSpec(specPath), path.dirname(specPath)));
  }
} catch (error) {
  usage();
  process.stderr.write(`run-from-spec: ${error.message}\n`);
  process.exitCode = 2;
}
