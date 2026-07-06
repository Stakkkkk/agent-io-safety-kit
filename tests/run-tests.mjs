#!/usr/bin/env node
import assert from "node:assert/strict";
import { appendFile, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deployScript = path.join(packageRoot, "scripts", "deploy.mjs");
const doctorScript = path.join(packageRoot, "scripts", "doctor.mjs");
const releaseNotesScript = path.join(packageRoot, "scripts", "release-notes.mjs");
const remoteBashScript = path.join(packageRoot, "skills", "safe-shell-io", "scripts", "remote-bash.mjs");
const runnerScript = path.join(packageRoot, "skills", "safe-shell-io", "scripts", "run-from-spec.mjs");
const runNodeUtf8Script = path.join(packageRoot, "skills", "safe-shell-io", "scripts", "run-node-utf8.mjs");
const readTextScript = path.join(packageRoot, "skills", "safe-text-io", "scripts", "read-text.mjs");
const inspectScript = path.join(packageRoot, "skills", "safe-text-io", "scripts", "inspect-text.mjs");
const replaceAsciiScript = path.join(packageRoot, "skills", "safe-text-io", "scripts", "replace-ascii-bytes.mjs");
const transcodeScript = path.join(packageRoot, "skills", "safe-text-io", "scripts", "transcode-text.mjs");
const cursorHookScript = path.join(packageRoot, "examples", "cursor-hooks", "io-safety-hook.mjs");
const schemaPath = path.join(packageRoot, "schemas", "command-spec.schema.json");

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function run(script, args, { cwd = packageRoot, stdin } = {}) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd,
    shell: false,
    windowsHide: true,
    stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
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
  return {
    ...result,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
  };
}

function expectSuccess(result, label) {
  assert.equal(result.signal, null, `${label}: unexpected signal ${result.signal}`);
  assert.equal(result.code, 0, `${label}: ${result.stderr || result.stdout}`);
}

function expectFailure(result, label) {
  assert.notEqual(result.code, 0, `${label}: command unexpectedly succeeded`);
}

async function testDeployment(tempRoot) {
  const target = path.join(tempRoot, "project with spaces");
  await mkdir(target, { recursive: true });
  const entryPath = path.join(target, "AGENTS.md");
  await writeFile(entryPath, Buffer.from("# Existing\r\n\r\nПривет\r\n", "utf8"));
  await writeFile(path.join(target, ".editorconfig"), "root = true\n", "utf8");

  const first = await run(deployScript, ["--target", target, "--entry", "AGENTS.md"]);
  expectSuccess(first, "first deployment");
  const firstEntry = await readFile(entryPath);
  const firstText = firstEntry.toString("utf8");
  assert.match(firstText, /agent-io-safety:begin/);
  assert.match(firstText, /\.agent-io-safety\/RULE\.md/);
  assert.match(firstText, /Shell and text I\/O safety/);
  assert.match(firstText, /node "\.agent-io-safety\/skills\/safe-text-io\/scripts\/read-text\.mjs" "\.agent-io-safety\/RULE\.md"/);
  assert.equal(firstText.replaceAll("\r\n", "").includes("\n"), false, "entry EOL was not preserved");
  const firstManifest = JSON.parse(await readFile(path.join(target, ".agent-io-safety", "MANIFEST.json"), "utf8"));
  assert.equal(firstManifest.language, "en", "default deployment language changed");
  assert.match(await readFile(path.join(target, ".agent-io-safety", "RULE.md"), "utf8"), /Safe shell and text I\/O rule/);
  assert.match(
    await readFile(path.join(target, ".agent-io-safety", "docs", "field-notes.md"), "utf8"),
    /real I\/O traps/,
    "field notes were not deployed",
  );
  assert.match(
    await readFile(path.join(target, ".agent-io-safety", "docs", "remote-io-recipes.md"), "utf8"),
    /Remote I\/O recipes/,
    "remote I/O recipes were not deployed",
  );
  assert.match(
    await readFile(path.join(target, ".agent-io-safety", "examples", "powershell-select-object.md"), "utf8"),
    /Select-Object/,
    "PowerShell example was not deployed",
  );
  assert.match(
    await readFile(path.join(target, ".agent-io-safety", "examples", "powershell-ssh-newlines.md"), "utf8"),
    /PowerShell \+ SSH newline/,
    "PowerShell SSH newline example was not deployed",
  );
  assert.match(
    await readFile(path.join(target, ".agent-io-safety", "skills", "safe-text-io", "scripts", "read-text.mjs"), "utf8"),
    /decodeUtf8Strict/,
    "safe text reader was not deployed",
  );
  assert.match(
    await readFile(path.join(target, ".agent-io-safety", "skills", "safe-shell-io", "scripts", "run-node-utf8.mjs"), "utf8"),
    /run-node-utf8/,
    "safe Node UTF-8 runner was not deployed",
  );
  assert.match(
    await readFile(path.join(target, ".agent-io-safety", "skills", "safe-shell-io", "scripts", "remote-bash.mjs"), "utf8"),
    /remote-bash/,
    "remote Bash helper was not deployed",
  );
  assert.match(
    await readFile(path.join(target, ".agent-io-safety", "examples", "ripgrep-leading-dash.md"), "utf8"),
    /rg --/,
    "ripgrep leading dash example was not deployed",
  );
  assert.match(
    await readFile(path.join(target, ".agent-io-safety", "docs", "cursor-hooks.md"), "utf8"),
    /Cursor hooks integration/,
    "Cursor hooks docs were not deployed",
  );
  assert.match(
    await readFile(path.join(target, ".agent-io-safety", "examples", "cursor-hooks", "hooks.json"), "utf8"),
    /beforeShellExecution/,
    "Cursor hook config was not deployed",
  );

  const beforeSecond = digest(await readFile(entryPath));
  const second = await run(deployScript, ["--target", target, "--entry", "AGENTS.md"]);
  expectSuccess(second, "idempotent deployment");
  assert.match(second.stdout, /UP-TO-DATE/);
  assert.equal(digest(await readFile(entryPath)), beforeSecond, "idempotent deployment changed entry file");

  const check = await run(deployScript, ["--target", target, "--entry", "AGENTS.md", "--check"]);
  expectSuccess(check, "deployment check");
  expectSuccess(await run(doctorScript, ["--target", target, "--entry", "AGENTS.md"]), "doctor check");
  const externalDoctor = await run(doctorScript, ["--target", target, "--entry", "AGENTS.md", "--external", "--json"]);
  expectSuccess(externalDoctor, "external doctor check");
  const externalChecks = JSON.parse(externalDoctor.stdout);
  assert.ok(externalChecks.some((checkItem) => checkItem.status === "info" && checkItem.name === "external"));
  assert.ok(externalChecks.some((checkItem) => checkItem.name === "external:editorconfig-checker"));

  const customPath = path.join(target, ".agent-io-safety", "CUSTOM.md");
  await writeFile(customPath, "unmanaged\n", "utf8");
  const rulePath = path.join(target, ".agent-io-safety", "RULE.md");
  await appendFile(rulePath, "\nlocal drift\n", "utf8");
  const drift = await run(deployScript, ["--target", target, "--entry", "AGENTS.md"]);
  expectFailure(drift, "drift protection");
  assert.match(`${drift.stdout}${drift.stderr}`, /modified managed file/);

  const repair = await run(deployScript, ["--target", target, "--entry", "AGENTS.md", "--force"]);
  expectSuccess(repair, "forced repair");
  assert.equal((await readFile(customPath, "utf8")), "unmanaged\n", "unknown destination file was changed");
  expectSuccess(await run(deployScript, ["--target", target, "--entry", "AGENTS.md", "--check"]), "post-repair check");
  expectSuccess(await run(doctorScript, ["--target", target, "--entry", "AGENTS.md"]), "post-repair doctor check");

  const outsideRule = path.join(tempRoot, "outside-rule.md");
  await writeFile(outsideRule, "outside\n", "utf8");
  await rm(rulePath, { force: true });
  let symlinkCreated = false;
  try {
    await symlink(outsideRule, rulePath, "file");
    symlinkCreated = true;
  } catch (error) {
    if (!new Set(["EPERM", "EACCES", "ENOSYS"]).has(error.code)) throw error;
  }
  if (symlinkCreated) {
    const symlinkAttack = await run(deployScript, ["--target", target, "--entry", "AGENTS.md", "--force"]);
    expectFailure(symlinkAttack, "symlink write protection");
    assert.match(`${symlinkAttack.stdout}${symlinkAttack.stderr}`, /symlink/);
    assert.equal(await readFile(outsideRule, "utf8"), "outside\n", "symlink target was modified");
    await rm(rulePath, { force: true });
    expectSuccess(await run(deployScript, ["--target", target, "--entry", "AGENTS.md", "--force"]), "post-symlink repair");
  }

  const bomTarget = path.join(tempRoot, "bom-project");
  const nestedEntry = path.join(bomTarget, ".github", "copilot-instructions.md");
  await mkdir(path.dirname(nestedEntry), { recursive: true });
  await writeFile(nestedEntry, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("# Existing\n", "utf8")]));
  expectSuccess(
    await run(deployScript, ["--target", bomTarget, "--entry", ".github/copilot-instructions.md"]),
    "nested BOM deployment",
  );
  const nestedBytes = await readFile(nestedEntry);
  assert.deepEqual([...nestedBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], "UTF-8 BOM was not preserved");
  assert.match(nestedBytes.subarray(3).toString("utf8"), /\.\.\/\.agent-io-safety\/RULE\.md/);
  expectSuccess(
    await run(doctorScript, ["--target", bomTarget, "--entry", ".github/copilot-instructions.md"]),
    "nested BOM doctor check",
  );
  const bomDoctor = await run(doctorScript, ["--target", bomTarget, "--entry", ".github/copilot-instructions.md", "--json"]);
  expectSuccess(bomDoctor, "nested BOM doctor JSON check");
  const bomDoctorChecks = JSON.parse(bomDoctor.stdout);
  assert.ok(bomDoctorChecks.some((item) => item.status === "warn" && item.name === "entry-text" && item.message.includes("UTF-8 BOM")));

  const mixedTarget = path.join(tempRoot, "mixed-entry-project");
  const mixedEntry = path.join(mixedTarget, "AGENTS.md");
  await mkdir(mixedTarget, { recursive: true });
  await writeFile(mixedEntry, "# Existing\r\nline two\n", "utf8");
  expectSuccess(await run(deployScript, ["--target", mixedTarget, "--entry", "AGENTS.md"]), "mixed EOL deployment");
  const mixedDoctor = await run(doctorScript, ["--target", mixedTarget, "--entry", "AGENTS.md", "--json"]);
  expectSuccess(mixedDoctor, "mixed EOL doctor JSON check");
  const mixedDoctorChecks = JSON.parse(mixedDoctor.stdout);
  assert.ok(mixedDoctorChecks.some((item) => item.status === "warn" && item.name === "entry-text" && item.message.includes("mixed line endings")));

  const fixTarget = path.join(tempRoot, "fix-entry-project");
  const fixEntry = path.join(fixTarget, "AGENTS.md");
  await mkdir(fixTarget, { recursive: true });
  await writeFile(fixEntry, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("# Existing\r\nline two\r\n", "utf8")]));
  expectSuccess(await run(deployScript, ["--target", fixTarget, "--entry", "AGENTS.md", "--fix-entry-text"]), "fix entry text deployment");
  const fixedBytes = await readFile(fixEntry);
  assert.notDeepEqual([...fixedBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], "fix-entry-text retained BOM");
  const fixedText = fixedBytes.toString("utf8");
  assert.equal(fixedText.includes("\r"), false, "fix-entry-text retained CR line endings");
  expectSuccess(await run(deployScript, ["--target", fixTarget, "--entry", "AGENTS.md", "--fix-entry-text", "--check"]), "fix entry text check");

  const claudeTarget = path.join(tempRoot, "claude-project");
  await mkdir(claudeTarget, { recursive: true });
  expectSuccess(await run(deployScript, ["--target", claudeTarget, "--entry", "CLAUDE.md"]), "Claude deployment");
  assert.match(await readFile(path.join(claudeTarget, "CLAUDE.md"), "utf8"), /Shell and text I\/O safety/);

  const russianTarget = path.join(tempRoot, "russian-project");
  await mkdir(russianTarget, { recursive: true });
  expectSuccess(await run(deployScript, ["--target", russianTarget, "--entry", "AGENTS.md", "--lang", "ru"]), "Russian deployment");
  assert.match(await readFile(path.join(russianTarget, "AGENTS.md"), "utf8"), /Безопасность shell/);
  assert.match(await readFile(path.join(russianTarget, ".agent-io-safety", "RULE.md"), "utf8"), /Правило безопасного shell/);
  const russianManifest = JSON.parse(await readFile(path.join(russianTarget, ".agent-io-safety", "MANIFEST.json"), "utf8"));
  assert.equal(russianManifest.language, "ru");
  assert.match(
    await readFile(path.join(russianTarget, ".agent-io-safety", "RULE.md"), "utf8"),
    /docs\/ru\/field-notes\.md/,
    "Russian rule does not route to Russian field notes",
  );
  assert.match(
    await readFile(path.join(russianTarget, ".agent-io-safety", "docs", "ru", "field-notes.md"), "utf8"),
    /SSH\/rsync/,
    "Russian field notes were not deployed",
  );
  expectSuccess(await run(deployScript, ["--target", russianTarget, "--entry", "AGENTS.md", "--lang", "ru", "--check"]), "Russian deployment check");
  expectSuccess(await run(doctorScript, ["--target", russianTarget, "--entry", "AGENTS.md", "--lang", "ru"]), "Russian doctor check");
  expectFailure(await run(deployScript, ["--target", russianTarget, "--entry", "AGENTS.md", "--lang", "en", "--check"]), "language mismatch check");
  expectFailure(await run(doctorScript, ["--target", russianTarget, "--entry", "AGENTS.md", "--lang", "en"]), "doctor language mismatch");

  const emptyTarget = path.join(tempRoot, "empty-project");
  await mkdir(emptyTarget, { recursive: true });
  expectFailure(await run(doctorScript, ["--target", emptyTarget, "--entry", "AGENTS.md"]), "doctor missing install");

  const customDestTarget = path.join(tempRoot, "custom-dest-project");
  await mkdir(customDestTarget, { recursive: true });
  expectSuccess(
    await run(deployScript, ["--target", customDestTarget, "--entry", "AGENTS.md", "--dest", ".agent io safety"]),
    "custom destination deployment",
  );
  const customDestEntry = await readFile(path.join(customDestTarget, "AGENTS.md"), "utf8");
  assert.match(
    customDestEntry,
    /node "\.agent io safety\/skills\/safe-text-io\/scripts\/read-text\.mjs" "\.agent io safety\/RULE\.md"/,
    "custom destination read-text command was not quoted or rendered",
  );
}

async function testRunner(tempRoot) {
  const runnerRoot = path.join(tempRoot, "runner");
  await mkdir(runnerRoot, { recursive: true });
  const echoScript = path.join(runnerRoot, "echo.mjs");
  await writeFile(
    echoScript,
    "const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);" +
      "process.stdout.write(JSON.stringify({args:process.argv.slice(2),stdin:Buffer.concat(chunks).toString('utf8')}));\n",
    "utf8",
  );

  const trickyArgs = [
    "Денис: \"double\" and 'single'",
    "$5 & 10% | `tick` \\ path",
    "line 1\nline 2",
    "space at end ",
    "",
  ];
  const stdin = "stdin: кириллица, emoji 🧪, \"quotes\"\nsecond line\n";
  const specPath = path.join(runnerRoot, "command.json");
  await writeFile(specPath, `${JSON.stringify({
    command: process.execPath,
    args: ["echo.mjs", ...trickyArgs],
    cwd: ".",
    stdin,
    stdoutEncoding: "utf8",
    stderrEncoding: "utf8",
  }, null, 2)}\n`, "utf8");

  const result = await run(runnerScript, [specPath], { cwd: runnerRoot });
  expectSuccess(result, "argv runner");
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(payload.args, trickyArgs, "argv changed during execution");
  assert.equal(payload.stdin, stdin, "stdin changed during execution");

  const bomSpec = path.join(runnerRoot, "bom-command.json");
  await writeFile(bomSpec, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("{}", "utf8")]));
  const rejected = await run(runnerScript, [bomSpec], { cwd: runnerRoot });
  expectFailure(rejected, "BOM spec rejection");
  assert.match(rejected.stderr, /without BOM/);

  const example = await run(runnerScript, [path.join(packageRoot, "examples", "safe-shell-command.json")], { cwd: packageRoot });
  expectSuccess(example, "example argv runner");
  const examplePayload = JSON.parse(example.stdout);
  assert.deepEqual(examplePayload.args.slice(0, 2), ["path with spaces/file.txt", "double quote: \""]);
}

async function testShellHelpers(tempRoot) {
  const helperRoot = path.join(tempRoot, "helpers");
  await mkdir(helperRoot, { recursive: true });

  const nodeScript = path.join(helperRoot, "print-payload.mjs");
  await writeFile(
    nodeScript,
    "const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);" +
      "process.stdout.write(JSON.stringify({args:process.argv.slice(2),stdin:Buffer.concat(chunks).toString('utf8')}));\n",
    "utf8",
  );
  const nodeSpec = path.join(helperRoot, "node-task.json");
  await writeFile(nodeSpec, `${JSON.stringify({
    script: "print-payload.mjs",
    args: ["Инструкция_агента.md", "literal $http_authorization"],
    stdin: "{\"anchor\":\"Инструкция\"}\n",
  }, null, 2)}\n`, "utf8");

  const nodeResult = await run(runNodeUtf8Script, ["--spec", nodeSpec]);
  expectSuccess(nodeResult, "run-node-utf8 spec");
  assert.deepEqual(JSON.parse(nodeResult.stdout), {
    args: ["Инструкция_агента.md", "literal $http_authorization"],
    stdin: "{\"anchor\":\"Инструкция\"}\n",
  });

  const nodeDirect = await run(runNodeUtf8Script, [nodeScript, "--", "Привет"]);
  expectSuccess(nodeDirect, "run-node-utf8 direct script");
  assert.deepEqual(JSON.parse(nodeDirect.stdout).args, ["Привет"]);

  const remoteScript = path.join(helperRoot, "remote-script.sh");
  await writeFile(remoteScript, "sed -n '1,260p'\r\ngrep 'map $http_authorization'\r\n", "utf8");
  const normalized = await run(remoteBashScript, ["--print-normalized", "example.org", remoteScript]);
  expectSuccess(normalized, "remote-bash print normalized");
  assert.equal(normalized.stdout, "sed -n '1,260p'\ngrep 'map $http_authorization'\n");
  assert.equal(normalized.stdout.includes("\r"), false);

  const fakeSsh = path.join(helperRoot, "fake-ssh.mjs");
  await writeFile(
    fakeSsh,
    "const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);" +
      "process.stdout.write(JSON.stringify({args:process.argv.slice(2),stdin:Buffer.concat(chunks).toString('utf8')}));\n",
    "utf8",
  );
  const remoteRun = await run(remoteBashScript, ["--ssh", process.execPath, "--ssh-arg", fakeSsh, "example.org", remoteScript]);
  expectSuccess(remoteRun, "remote-bash fake ssh");
  assert.deepEqual(JSON.parse(remoteRun.stdout), {
    args: ["example.org", "bash", "-s"],
    stdin: "sed -n '1,260p'\ngrep 'map $http_authorization'\n",
  });

  const utf16Script = path.join(helperRoot, "utf16.sh");
  await writeFile(utf16Script, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("echo nope\n", "utf16le")]));
  const remoteUtf16 = await run(remoteBashScript, ["--print-normalized", "example.org", utf16Script]);
  expectFailure(remoteUtf16, "remote-bash rejects UTF-16");
  assert.match(remoteUtf16.stderr, /UTF-16 BOM/);
}

async function testTextTools(tempRoot) {
  const textRoot = path.join(tempRoot, "text");
  await mkdir(textRoot, { recursive: true });
  const good = path.join(textRoot, "good.txt");
  const bom = path.join(textRoot, "bom.txt");
  const utf16 = path.join(textRoot, "utf16.txt");
  const utf16NoBomAscii = path.join(textRoot, "utf16-no-bom-ascii.txt");
  const utf16NoBomCyrillic = path.join(textRoot, "utf16-no-bom-cyrillic.txt");
  const psUnsafe = path.join(textRoot, "unsafe.ps1");
  const psBom = path.join(textRoot, "safe.ps1");
  const invalidUtf8 = path.join(textRoot, "invalid-utf8.md");

  await writeFile(good, "Привет\n", "utf8");
  await writeFile(bom, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("Привет\r\n", "utf8")]));
  await writeFile(utf16, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Привет\r\n", "utf16le")]));
  await writeFile(utf16NoBomAscii, Buffer.from("Hello\r\n", "utf16le"));
  await writeFile(utf16NoBomCyrillic, Buffer.from("Привет\r\n", "utf16le"));
  await writeFile(invalidUtf8, Buffer.from([0xc3, 0x28]));
  await writeFile(psUnsafe, "Write-Output 'Привет'\n", "utf8");
  await writeFile(psBom, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("Write-Output 'Привет'\r\n", "utf8")]));

  const readGood = await run(readTextScript, [good]);
  expectSuccess(readGood, "safe text read valid UTF-8");
  assert.equal(readGood.stdout, "Привет\n");

  const readBom = await run(readTextScript, [bom]);
  expectSuccess(readBom, "safe text read UTF-8 BOM");
  assert.equal(readBom.stdout, "Привет\r\n");

  const readMany = await run(readTextScript, [good, bom]);
  expectSuccess(readMany, "safe text read multiple files");
  assert.equal(readMany.stdout, "Привет\nПривет\r\n");

  const readInvalid = await run(readTextScript, [invalidUtf8]);
  expectFailure(readInvalid, "safe text read invalid UTF-8");
  assert.match(readInvalid.stderr, /invalid UTF-8/);

  const readPartialInvalid = await run(readTextScript, [good, invalidUtf8]);
  expectFailure(readPartialInvalid, "safe text read does not emit partial output");
  assert.equal(readPartialInvalid.stdout, "");

  const readUtf16 = await run(readTextScript, [utf16]);
  expectFailure(readUtf16, "safe text read UTF-16 BOM");
  assert.match(readUtf16.stderr, /UTF-16 BOM/);

  expectSuccess(await run(inspectScript, [good]), "valid UTF-8 inspection");
  expectFailure(await run(inspectScript, ["--fail-on-bom", bom]), "BOM policy");
  expectFailure(await run(inspectScript, [utf16]), "UTF-16 detection");
  expectFailure(await run(inspectScript, [utf16NoBomAscii]), "UTF-16 without BOM ASCII detection");
  expectFailure(await run(inspectScript, [utf16NoBomCyrillic]), "UTF-16 without BOM Cyrillic detection");
  expectFailure(await run(inspectScript, ["--ps51-safe", psUnsafe]), "PowerShell 5.1 unsafe source");
  expectSuccess(await run(inspectScript, ["--ps51-safe", psBom]), "PowerShell 5.1 BOM source");

  const normalized = path.join(textRoot, "normalized.txt");
  expectSuccess(
    await run(transcodeScript, [
      "--input", bom,
      "--output", normalized,
      "--source-encoding", "auto",
      "--target-encoding", "utf8",
      "--bom", "none",
      "--eol", "lf",
    ]),
    "explicit transcode",
  );
  const normalizedBytes = await readFile(normalized);
  assert.notDeepEqual([...normalizedBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], "transcode retained BOM");
  assert.equal(normalizedBytes.toString("utf8"), "Привет\n");

  const legacy = path.join(textRoot, "legacy.bin");
  const replaced = path.join(textRoot, "legacy-replaced.bin");
  await writeFile(
    legacy,
    Buffer.concat([
      Buffer.from([0xff, 0xfe, 0x80]),
      Buffer.from("prefix old/path old/path suffix", "ascii"),
      Buffer.from([0x81, 0x82]),
    ]),
  );
  expectSuccess(
    await run(replaceAsciiScript, [
      "--input", legacy,
      "--output", replaced,
      "--search", "old/path",
      "--replace", "new/path",
      "--count", "1",
    ]),
    "ASCII byte replacement",
  );
  const replacedBytes = await readFile(replaced);
  assert.deepEqual([...replacedBytes.subarray(0, 3)], [0xff, 0xfe, 0x80], "byte replacement changed prefix bytes");
  assert.deepEqual([...replacedBytes.subarray(-2)], [0x81, 0x82], "byte replacement changed suffix bytes");
  assert.match(replacedBytes.toString("latin1"), /new\/path old\/path/, "byte replacement did not limit replacement count");

  const checkDiff = await run(replaceAsciiScript, [
    "--input", legacy,
    "--in-place",
    "--search", "old/path",
    "--replace", "new/path",
    "--check",
  ]);
  expectFailure(checkDiff, "ASCII byte replacement check diff");
  assert.match(checkDiff.stdout, /DIFF/);

  expectSuccess(
    await run(replaceAsciiScript, [
      "--input", legacy,
      "--in-place",
      "--search", "old/path",
      "--replace", "new/path",
    ]),
    "ASCII byte replacement in place",
  );
  const checkOk = await run(replaceAsciiScript, [
    "--input", legacy,
    "--in-place",
    "--search", "old/path",
    "--replace", "new/path",
    "--check",
  ]);
  expectSuccess(checkOk, "ASCII byte replacement check ok");
  assert.match(checkOk.stdout, /OK/);

  expectFailure(
    await run(replaceAsciiScript, ["--input", legacy, "--in-place", "--search", "путь", "--replace", "path"]),
    "ASCII byte replacement rejects non-ASCII search",
  );
}

async function testCliHelp() {
  expectSuccess(await run(deployScript, ["--help"]), "deploy help");
  expectSuccess(await run(doctorScript, ["--help"]), "doctor help");
  expectSuccess(await run(releaseNotesScript, ["--help"]), "release notes help");
  expectSuccess(await run(remoteBashScript, ["--help"]), "remote bash help");
  expectSuccess(await run(runnerScript, ["--help"]), "runner help");
  expectSuccess(await run(runNodeUtf8Script, ["--help"]), "run node UTF-8 help");
  expectSuccess(await run(readTextScript, ["--help"]), "read text help");
  expectSuccess(await run(inspectScript, ["--help"]), "inspect help");
  expectSuccess(await run(replaceAsciiScript, ["--help"]), "replace ASCII bytes help");
  expectSuccess(await run(transcodeScript, ["--help"]), "transcode help");
}

async function testMetadata() {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.properties.command.type, "string");

  const packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
  assert.equal(packageJson.version, "0.1.7");
  assert.equal(packageJson.bin["agent-io-safety-kit"], "scripts/deploy.mjs");
  assert.equal(packageJson.bin["agent-io-safety-doctor"], "scripts/doctor.mjs");
  assert.equal(packageJson.bin["safe-shell-remote-bash"], "skills/safe-shell-io/scripts/remote-bash.mjs");
  assert.equal(packageJson.bin["safe-shell-run-node-utf8"], "skills/safe-shell-io/scripts/run-node-utf8.mjs");
  assert.equal(packageJson.bin["safe-text-read"], "skills/safe-text-io/scripts/read-text.mjs");
  assert.equal(packageJson.bin["safe-text-replace-ascii-bytes"], "skills/safe-text-io/scripts/replace-ascii-bytes.mjs");
  assert.ok(packageJson.files.includes("schemas/"));
  assert.ok(packageJson.files.includes("examples/"));
  assert.ok(packageJson.files.includes("docs/"));
  assert.ok(packageJson.files.includes("recipes/"));
  assert.ok(packageJson.files.includes("RULE.ru.md"));
  assert.ok(packageJson.files.includes("00-MECHANISM.ru.md"));
  assert.ok(packageJson.files.includes("01-DEPLOYMENT.ru.md"));
}

async function testReleaseNotes() {
  const notes = await run(releaseNotesScript, ["v0.1.7"]);
  expectSuccess(notes, "release notes extraction");
  assert.match(notes.stdout, /inline interpreter one-liners/);
  assert.match(notes.stdout, /Cursor hook detection/);
  assert.doesNotMatch(notes.stdout, /0\.1\.6/);
}

async function testCursorHookExample() {
  const rsync = await run(cursorHookScript, ["--event", "beforeShellExecution"], {
    stdin: `${JSON.stringify({ command: 'rsync -e "ssh -n" src/ host:/tmp/src/', cwd: packageRoot, sandbox: false })}\n`,
  });
  expectSuccess(rsync, "Cursor hook rsync ssh -n");
  assert.equal(JSON.parse(rsync.stdout).permission, "deny");

  const newline = await run(cursorHookScript, ["--event", "beforeShellExecution"], {
    stdin: `${JSON.stringify({ command: 'ssh host "printf line1\\nline2"', cwd: packageRoot, sandbox: false })}\n`,
  });
  expectSuccess(newline, "Cursor hook PowerShell SSH newline");
  assert.equal(JSON.parse(newline.stdout).permission, "ask");

  const range = await run(cursorHookScript, ["--event", "beforeShellExecution"], {
    stdin: `${JSON.stringify({ command: "Get-Content file.txt | Select-Object -Index 94..112", cwd: packageRoot, sandbox: false })}\n`,
  });
  expectSuccess(range, "Cursor hook PowerShell range");
  assert.equal(JSON.parse(range.stdout).permission, "deny");

  const rgDash = await run(cursorHookScript, ["--event", "beforeShellExecution"], {
    stdin: `${JSON.stringify({ command: 'rg "-TODO"', cwd: packageRoot, sandbox: false })}\n`,
  });
  expectSuccess(rgDash, "Cursor hook ripgrep leading dash");
  assert.equal(JSON.parse(rgDash.stdout).permission, "ask");

  const rgExeDash = await run(cursorHookScript, ["--event", "beforeShellExecution"], {
    stdin: `${JSON.stringify({ command: 'rg.exe -n "-TODO"', cwd: packageRoot, sandbox: false })}\n`,
  });
  expectSuccess(rgExeDash, "Cursor hook rg.exe leading dash");
  assert.equal(JSON.parse(rgExeDash.stdout).permission, "ask");

  const rgSafe = await run(cursorHookScript, ["--event", "beforeShellExecution"], {
    stdin: `${JSON.stringify({ command: 'rg -n -- "-TODO"', cwd: packageRoot, sandbox: false })}\n`,
  });
  expectSuccess(rgSafe, "Cursor hook ripgrep leading dash with --");
  assert.equal(JSON.parse(rgSafe.stdout).permission, "allow");

  const nounset = await run(cursorHookScript, ["--event", "beforeShellExecution"], {
    stdin: `${JSON.stringify({ command: 'set -u; grep "map $http_authorization" nginx.conf', cwd: packageRoot, sandbox: false })}\n`,
  });
  expectSuccess(nounset, "Cursor hook Bash nounset dollar in double quotes");
  assert.equal(JSON.parse(nounset.stdout).permission, "ask");

  const inlineSecretCommand = `node -e "const fs=require('fs'); const text=fs.readFileSync('config.toml','utf8'); console.log(text.replace(/Bearer .+/, 'Bearer <redacted>'))"`;
  const inlineSecret = await run(cursorHookScript, ["--event", "beforeShellExecution"], {
    stdin: `${JSON.stringify({ command: inlineSecretCommand, cwd: packageRoot, sandbox: false })}\n`,
  });
  expectSuccess(inlineSecret, "Cursor hook inline interpreter config secrets");
  assert.equal(JSON.parse(inlineSecret.stdout).permission, "deny");

  const inlinePythonSecret = await run(cursorHookScript, ["--event", "beforeShellExecution"], {
    stdin: `${JSON.stringify({ command: 'python -c "print(open(\'.env\').read())"', cwd: packageRoot, sandbox: false })}\n`,
  });
  expectSuccess(inlinePythonSecret, "Cursor hook inline Python env secrets");
  assert.equal(JSON.parse(inlinePythonSecret.stdout).permission, "deny");

  const inlineComplexCommand = `node -e "console.log('$1'.replace(/x/, 'y'))"`;
  const inlineComplex = await run(cursorHookScript, ["--event", "beforeShellExecution"], {
    stdin: `${JSON.stringify({ command: inlineComplexCommand, cwd: packageRoot, sandbox: false })}\n`,
  });
  expectSuccess(inlineComplex, "Cursor hook complex inline interpreter");
  assert.equal(JSON.parse(inlineComplex.stdout).permission, "ask");

  const inlinePowerShellEncoding = await run(cursorHookScript, ["--event", "beforeShellExecution"], {
    stdin: `${JSON.stringify({ command: 'powershell -Command "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Get-Content RULE.md"', cwd: packageRoot, sandbox: false })}\n`,
  });
  expectSuccess(inlinePowerShellEncoding, "Cursor hook inline PowerShell encoding command");
  assert.equal(JSON.parse(inlinePowerShellEncoding.stdout).permission, "ask");

  const inlineBashLoginShell = await run(cursorHookScript, ["--event", "beforeShellExecution"], {
    stdin: `${JSON.stringify({ command: 'bash -lc "grep -E \\"token|Authorization\\" config.yaml"', cwd: packageRoot, sandbox: false })}\n`,
  });
  expectSuccess(inlineBashLoginShell, "Cursor hook inline Bash login shell");
  assert.equal(JSON.parse(inlineBashLoginShell.stdout).permission, "deny");

  const safe = await run(cursorHookScript, ["--event", "beforeShellExecution"], {
    stdin: `${JSON.stringify({ command: "node --version", cwd: packageRoot, sandbox: false })}\n`,
  });
  expectSuccess(safe, "Cursor hook safe command");
  assert.equal(JSON.parse(safe.stdout).permission, "allow");
}

async function safeCleanup(tempRoot) {
  const systemTemp = path.resolve(os.tmpdir());
  const resolved = path.resolve(tempRoot);
  const relative = path.relative(systemTemp, resolved);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "refusing unsafe temp cleanup");
  assert.match(path.basename(resolved), /^agent-io-safety-tests-/, "refusing unexpected temp cleanup target");
  await rm(resolved, { recursive: true, force: true });
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agent-io-safety-tests-"));
try {
  const bundleCheck = await run(inspectScript, ["--all-files", "--fail-on-bom", "--eol", "lf", "--ps51-safe", packageRoot]);
  expectSuccess(bundleCheck, "bundle text policy");
  await testCliHelp();
  await testMetadata();
  await testReleaseNotes();
  await testCursorHookExample();
  await testDeployment(tempRoot);
  await testRunner(tempRoot);
  await testShellHelpers(tempRoot);
  await testTextTools(tempRoot);
  process.stdout.write("ALL TESTS PASSED\n");
} finally {
  await safeCleanup(tempRoot);
}
