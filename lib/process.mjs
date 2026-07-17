import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  const forceTimer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }, 1000);
  forceTimer.unref?.();
}

export async function runProcess(command, args, options = {}) {
  const {
    cwd,
    env,
    stdin = Buffer.alloc(0),
    timeoutMs = 0,
    maxStdoutBytes = DEFAULT_MAX_OUTPUT_BYTES,
    maxStderrBytes = DEFAULT_MAX_OUTPUT_BYTES,
    collectStdout = true,
    collectStderr = true,
    onStdout,
    onStderr,
  } = options;

  const child = spawn(command, args, {
    cwd,
    env,
    shell: false,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const stdout = [];
  const stderr = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let limit;
  let timedOut = false;
  let stdinError;

  function receive(chunk, stream) {
    if (stream === "stdout") {
      stdoutBytes += chunk.length;
      if (!limit && stdoutBytes > maxStdoutBytes) {
        limit = { stream, maximum: maxStdoutBytes };
        stopChild(child);
        return;
      }
      if (collectStdout) stdout.push(chunk);
      onStdout?.(chunk);
    } else {
      stderrBytes += chunk.length;
      if (!limit && stderrBytes > maxStderrBytes) {
        limit = { stream, maximum: maxStderrBytes };
        stopChild(child);
        return;
      }
      if (collectStderr) stderr.push(chunk);
      onStderr?.(chunk);
    }
  }

  child.stdout.on("data", (chunk) => receive(chunk, "stdout"));
  child.stderr.on("data", (chunk) => receive(chunk, "stderr"));
  child.stdin.on("error", (error) => {
    if (error.code !== "EPIPE") stdinError = error;
  });
  child.stdin.end(stdin);

  const timer = timeoutMs > 0
    ? setTimeout(() => {
      timedOut = true;
      stopChild(child);
    }, timeoutMs)
    : undefined;

  try {
    const result = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    if (stdinError) throw stdinError;
    return {
      ...result,
      timedOut,
      limit,
      stdout: Buffer.concat(stdout),
      stderr: Buffer.concat(stderr),
      stdoutBytes,
      stderrBytes,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function executableFile(filePath) {
  try {
    await access(filePath, constants.X_OK);
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function pathLike(value) {
  return path.isAbsolute(value) || value.includes("/") || value.includes("\\");
}

export async function resolveExecutable(command, env = process.env) {
  if (pathLike(command)) return (await executableFile(command)) ? path.resolve(command) : undefined;

  const extensions = process.platform === "win32"
    ? (env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [""];
  const hasExtension = path.extname(command) !== "";

  for (const directory of (env.PATH || "").split(path.delimiter).filter(Boolean)) {
    const candidates = hasExtension
      ? [path.join(directory, command)]
      : extensions.map((extension) => path.join(directory, `${command}${extension}`));
    for (const candidate of candidates) {
      if (await executableFile(candidate)) return candidate;
    }
  }
  return undefined;
}
