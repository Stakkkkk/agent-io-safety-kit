import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { withTemp } from "./test-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = (...parts) => path.join(root, ...parts);

async function run(file, args, { cwd = root, stdin } = {}) {
  const child = spawn(process.execPath, [file, ...args], {
    cwd, shell: false, windowsHide: true, stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  if (stdin !== undefined) child.stdin.end(stdin);
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  return { ...result, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") };
}

test("spec runner rejects ambiguity and preserves an existing output on validation failure", () => withTemp(async (temp) => {
  const runner = script("skills", "safe-shell-io", "scripts", "run-from-spec.mjs");
  const specPath = path.join(temp, "command.json");
  await writeFile(specPath, JSON.stringify({ command: process.execPath, args: ["--version"], typo: true }));
  const unknown = await run(runner, [specPath]);
  assert.notEqual(unknown.code, 0);
  assert.match(unknown.stderr, /unknown spec field: typo/);

  await writeFile(specPath, JSON.stringify({ command: process.execPath, stdoutFile: "same.txt", stderrFile: "same.txt" }));
  const same = await run(runner, [specPath]);
  assert.notEqual(same.code, 0);
  assert.match(same.stderr, /different paths/);

  const output = path.join(temp, "output.txt");
  await writeFile(output, "sentinel", "utf8");
  await writeFile(specPath, JSON.stringify({
    command: process.execPath,
    args: ["-e", "process.stdout.write(Buffer.from([0xc3,0x28]))"],
    stdoutFile: "output.txt",
  }));
  const invalid = await run(runner, [specPath]);
  assert.notEqual(invalid.code, 0);
  assert.equal(await readFile(output, "utf8"), "sentinel");

  const noisyScript = path.join(temp, "noisy.mjs");
  await writeFile(noisyScript, "process.stdout.write('x'.repeat(1000));\n", "utf8");
  await writeFile(specPath, JSON.stringify({ command: process.execPath, args: ["noisy.mjs"], maxOutputBytes: 10 }));
  const limited = await run(runner, [specPath]);
  assert.notEqual(limited.code, 0);
  assert.match(limited.stderr, /exceeded maxOutputBytes/);

  const slowScript = path.join(temp, "slow.mjs");
  await writeFile(slowScript, "setTimeout(() => {}, 1000);\n", "utf8");
  await writeFile(specPath, JSON.stringify({ command: process.execPath, args: ["slow.mjs"], timeoutMs: 50 }));
  const timedOut = await run(runner, [specPath]);
  assert.equal(timedOut.code, 124);
  assert.match(timedOut.stderr, /timed out/);

  const sideEffectScript = path.join(temp, "side-effect.mjs");
  await writeFile(sideEffectScript, "import {writeFileSync} from 'node:fs';writeFileSync('touched','yes');\n", "utf8");
  await writeFile(specPath, JSON.stringify({
    command: process.execPath, args: ["side-effect.mjs"], stdoutEncoding: "definitely-not-an-encoding",
  }));
  const encoding = await run(runner, [specPath]);
  assert.notEqual(encoding.code, 0);
  assert.match(encoding.stderr, /not a supported TextDecoder encoding/);
  await assert.rejects(readFile(path.join(temp, "touched")));
}));

test("Node helper validates the script before execution and enforces limits", () => withTemp(async (temp) => {
  const runner = script("skills", "safe-shell-io", "scripts", "run-node-utf8.mjs");
  const markdown = path.join(temp, "RULE.md");
  await writeFile(markdown, "# rule\n", "utf8");
  const md = await run(runner, [markdown]);
  assert.notEqual(md.code, 0);
  assert.match(md.stderr, /Markdown is text/);

  const invalidScript = path.join(temp, "invalid.mjs");
  await writeFile(invalidScript, Buffer.from([0xc3, 0x28]));
  const invalid = await run(runner, [invalidScript]);
  assert.notEqual(invalid.code, 0);
  assert.match(invalid.stderr, /not valid UTF-8/);

  const noisy = path.join(temp, "noisy.mjs");
  await writeFile(noisy, "process.stdout.write('x'.repeat(1000));\n", "utf8");
  const specPath = path.join(temp, "node.json");
  await writeFile(specPath, JSON.stringify({ script: "noisy.mjs", maxOutputBytes: 10 }));
  const limited = await run(runner, ["--spec", specPath]);
  assert.notEqual(limited.code, 0);
  assert.match(limited.stderr, /exceeded maxOutputBytes/);
}));

test("text helpers make multi-file and leading-dash behavior explicit", () => withTemp(async (temp) => {
  const reader = script("skills", "safe-text-io", "scripts", "read-text.mjs");
  const replacer = script("skills", "safe-text-io", "scripts", "replace-ascii-bytes.mjs");
  await writeFile(path.join(temp, "-instruction.md"), "ok", "utf8");
  await writeFile(path.join(temp, "second.md"), "two", "utf8");
  const dash = await run(reader, ["--", "-instruction.md"], { cwd: temp });
  assert.equal(dash.code, 0);
  assert.equal(dash.stdout, "ok");
  const ambiguous = await run(reader, ["-instruction.md", "second.md"], { cwd: temp });
  assert.notEqual(ambiguous.code, 0);
  const json = await run(reader, ["--json", "--", "-instruction.md", "second.md"], { cwd: temp });
  assert.equal(json.code, 0);
  assert.deepEqual(JSON.parse(json.stdout).map((item) => item.text), ["ok", "two"]);

  const replace = await run(replacer, [
    "--input", "second.md", "--in-place", "--search", "two", "--replace", "changed", "--expect-count", "2",
  ], { cwd: temp });
  assert.notEqual(replace.code, 0);
  assert.equal(await readFile(path.join(temp, "second.md"), "utf8"), "two");
}));

test("shared hook policy avoids prose false positives and Codex fails closed", async () => {
  const cursor = script("examples", "cursor-hooks", "io-safety-hook.mjs");
  const codex = script("examples", "codex-hooks", "io-safety-hook.mjs");
  const echo = await run(cursor, ["--event", "beforeShellExecution"], {
    stdin: `${JSON.stringify({ command: "echo node -e is documentation" })}\n`,
  });
  assert.equal(JSON.parse(echo.stdout).permission, "allow");
  const preserve = await run(cursor, ["--event", "beforeShellExecution"], {
    stdin: `${JSON.stringify({ command: "node --preserve-symlinks script.mjs" })}\n`,
  });
  assert.equal(JSON.parse(preserve.stdout).permission, "allow");
  const advisory = await run(cursor, ["--event", "beforeShellExecution", "--mode", "advisory"], {
    stdin: `${JSON.stringify({ command: "node -e \"console.log('$1')\"" })}\n`,
  });
  assert.equal(JSON.parse(advisory.stdout).permission, "ask");

  const review = await run(codex, ["--mode", "strict"], {
    stdin: `${JSON.stringify({ tool_input: { command: "node -e \"console.log('$1')\"" } })}\n`,
  });
  assert.equal(review.code, 0);
  assert.equal(JSON.parse(review.stdout).hookSpecificOutput.permissionDecision, "deny");
  const malformed = await run(codex, ["--mode", "strict"], { stdin: "{}\n" });
  assert.equal(malformed.code, 0);
  assert.equal(JSON.parse(malformed.stdout).hookSpecificOutput.permissionDecision, "deny");
});

test("release metadata rejects a mismatched tag", async () => {
  const result = await run(script("scripts", "check-release.mjs"), ["--tag", "v9.9.9"]);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /tag=v9\.9\.9, VERSION=0\.2\.0/);
});

test("doctor rejects duplicated or altered managed entry blocks", () => withTemp(async (temp) => {
  const deploy = script("scripts", "deploy.mjs");
  const doctor = script("scripts", "doctor.mjs");
  assert.equal((await run(deploy, ["--target", temp])).code, 0);
  const entryPath = path.join(temp, "AGENTS.md");
  const original = await readFile(entryPath, "utf8");
  await writeFile(entryPath, `${original}\n<!-- agent-io-safety:begin -->\n`, "utf8");
  const duplicate = await run(doctor, ["--target", temp]);
  assert.notEqual(duplicate.code, 0);
  assert.match(duplicate.stdout, /duplicate begin markers/);
}));
