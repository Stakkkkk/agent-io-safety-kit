#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const BEGIN_MARKER = "<!-- agent-io-safety:begin -->";
const END_MARKER = "<!-- agent-io-safety:end -->";
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function usage() {
  process.stderr.write(
    "usage: node doctor.mjs [--target dir] [--entry AGENTS.md] [--dest .agent-io-safety] " +
      "[--lang auto|en|ru] [--json] [--skip-text] [--external]\n",
  );
}

function parseArgs(argv) {
  const options = {
    target: ".",
    entry: "AGENTS.md",
    dest: ".agent-io-safety",
    json: false,
    skipText: false,
    external: false,
    lang: "auto",
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--target") options.target = argv[++index];
    else if (value === "--entry") options.entry = argv[++index];
    else if (value === "--dest") options.dest = argv[++index];
    else if (value === "--json") options.json = true;
    else if (value === "--skip-text") options.skipText = true;
    else if (value === "--external") options.external = true;
    else if (value === "--lang") options.lang = argv[++index];
    else if (value === "--help" || value === "-h") options.help = true;
    else throw new Error(`unknown option: ${value}`);
  }
  if (!options.target || !options.entry || !options.dest) throw new Error("path options require values");
  if (!new Set(["auto", "en", "ru"]).has(options.lang)) throw new Error("--lang must be auto, en, or ru");
  return options;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function inside(root, candidate, label) {
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return absolute;
  throw new Error(`${label} must stay inside target root`);
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function decodeUtf8(bytes, label, { allowBom = true } = {}) {
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  if (hasBom && !allowBom) throw new Error(`${label} must be UTF-8 without BOM`);
  if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) {
    throw new Error(`${label} is UTF-16`);
  }
  const content = hasBom ? bytes.subarray(3) : bytes;
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(content), hasBom };
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8: ${error.message}`);
  }
}

function lineEndings(text) {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const remainder = text.replace(/\r\n/g, "");
  const lf = (remainder.match(/\n/g) ?? []).length;
  const cr = (remainder.match(/\r/g) ?? []).length;
  const kinds = [["crlf", crlf], ["lf", lf], ["cr", cr]].filter(([, count]) => count > 0);
  return { crlf, lf, cr, style: kinds.length === 0 ? "none" : kinds.length === 1 ? kinds[0][0] : "mixed" };
}

async function collectFiles(root, relative = "") {
  const directory = path.join(root, relative);
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const childRelative = path.join(relative, entry.name);
    if (entry.isDirectory()) output.push(...(await collectFiles(root, childRelative)));
    else if (entry.isFile()) output.push(childRelative);
  }
  return output;
}

async function localizedSource(canonicalPath, lang) {
  if (lang !== "ru" || !canonicalPath.endsWith(".md")) return canonicalPath;
  const localizedPath = canonicalPath.replace(/\.md$/u, ".ru.md");
  return (await exists(localizedPath)) ? localizedPath : canonicalPath;
}

async function collectProjectFiles(root, relative = "") {
  const excludes = new Set([".git", ".agent-io-safety", "node_modules", "vendor", "dist", "build", "coverage"]);
  const directory = path.join(root, relative);
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludes.has(entry.name)) continue;
    const childRelative = path.join(relative, entry.name);
    if (entry.isDirectory()) output.push(...(await collectProjectFiles(root, childRelative)));
    else if (entry.isFile()) output.push(toPosix(childRelative));
  }
  return output;
}

async function sourceArtifacts(lang = "en") {
  const mappings = [
    { source: path.join(packageRoot, "VERSION"), destination: "VERSION" },
    { source: await localizedSource(path.join(packageRoot, "RULE.md"), lang), destination: "RULE.md" },
  ];
  const skillsRoot = path.join(packageRoot, "skills");
  for (const relative of await collectFiles(skillsRoot)) {
    if (relative.endsWith(".ru.md")) continue;
    const canonicalPath = path.join(skillsRoot, relative);
    mappings.push({
      source: await localizedSource(canonicalPath, lang),
      destination: path.join("skills", relative),
    });
  }

  const artifacts = [];
  for (const mapping of mappings) {
    const bytes = await readFile(mapping.source);
    artifacts.push({ ...mapping, bytes, hash: sha256(bytes), destination: toPosix(mapping.destination) });
  }
  return artifacts.sort((left, right) => left.destination.localeCompare(right.destination));
}

async function runNode(script, args, cwd) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
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

async function runCommand(command, args, cwd, timeoutMs = 5000) {
  const child = spawn(command, args, {
    cwd,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, timeoutMs);

  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));

  try {
    const result = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    return {
      ...result,
      timedOut,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    };
  } catch (error) {
    return { code: undefined, signal: undefined, timedOut, stdout: "", stderr: "", error };
  } finally {
    clearTimeout(timer);
  }
}

function add(checks, status, name, message, details = undefined) {
  checks.push({ status, name, message, ...(details === undefined ? {} : { details }) });
}

function firstLine(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
}

function hasAny(files, predicate) {
  return files.some((file) => predicate(file.toLowerCase()));
}

function hasGitHubWorkflows(files) {
  return hasAny(files, (file) => /^\.github\/workflows\/.+\.ya?ml$/.test(file));
}

function hasShellFiles(files) {
  return hasAny(files, (file) => /\.(sh|bash|zsh)$/.test(file));
}

function hasPowerShellFiles(files) {
  return hasAny(files, (file) => /\.(ps1|psm1|psd1)$/.test(file));
}

function hasJsonSchemas(files) {
  return hasAny(files, (file) => file.endsWith(".schema.json") || file.includes("/schemas/") || file === "schemas/command-spec.schema.json");
}

async function addExternalCommandCheck(checks, targetRoot, tool) {
  const result = await runCommand(tool.command, tool.args, targetRoot);
  const details = { command: [tool.command, ...tool.args].join(" "), official: tool.official, reason: tool.reason };
  if (result.error?.code === "ENOENT") {
    add(checks, "warn", `external:${tool.name}`, `${tool.name} is not installed (${tool.reason})`, details);
    return;
  }
  if (result.error) {
    add(checks, "warn", `external:${tool.name}`, `${tool.name} could not be checked: ${result.error.message}`, details);
    return;
  }
  if (result.timedOut) {
    add(checks, "warn", `external:${tool.name}`, `${tool.name} version check timed out`, details);
    return;
  }
  if (result.code === 0 && result.signal === null) {
    const version = firstLine(`${result.stdout}\n${result.stderr}`);
    add(checks, "ok", `external:${tool.name}`, `${tool.name} available${version ? `: ${version}` : ""}`, details);
    return;
  }
  add(
    checks,
    "warn",
    `external:${tool.name}`,
    `${tool.name} command returned ${result.code ?? "unknown"}`,
    { ...details, stdout: result.stdout.trim(), stderr: result.stderr.trim() },
  );
}

async function addPSScriptAnalyzerCheck(checks, targetRoot) {
  const official = "https://learn.microsoft.com/powershell/utility-modules/psscriptanalyzer/overview";
  const script = "if (Get-Module -ListAvailable PSScriptAnalyzer) { (Get-Module -ListAvailable PSScriptAnalyzer | Select-Object -First 1).Version.ToString(); exit 0 } else { exit 1 }";
  for (const command of ["pwsh", "powershell"]) {
    const result = await runCommand(command, ["-NoProfile", "-Command", script], targetRoot);
    if (result.error?.code === "ENOENT") continue;
    if (result.code === 0 && result.signal === null) {
      add(
        checks,
        "ok",
        "external:PSScriptAnalyzer",
        `PSScriptAnalyzer available${firstLine(result.stdout) ? `: ${firstLine(result.stdout)}` : ""}`,
        { command, official, reason: "recommended for PowerShell files" },
      );
      return;
    }
  }
  add(
    checks,
    "warn",
    "external:PSScriptAnalyzer",
    "PSScriptAnalyzer is not installed or no PowerShell host is available (recommended for PowerShell files)",
    { official, reason: "recommended for PowerShell files" },
  );
}

async function addExternalChecks(checks, targetRoot) {
  const files = await collectProjectFiles(targetRoot);
  const tools = [];

  if (hasShellFiles(files)) {
    tools.push(
      {
        name: "ShellCheck",
        command: "shellcheck",
        args: ["--version"],
        official: "https://github.com/koalaman/shellcheck",
        reason: "recommended for shell scripts",
      },
      {
        name: "shfmt",
        command: "shfmt",
        args: ["--version"],
        official: "https://github.com/mvdan/sh",
        reason: "recommended for shell script formatting",
      },
    );
  }

  if (files.includes(".editorconfig")) {
    tools.push({
      name: "editorconfig-checker",
      command: "editorconfig-checker",
      args: ["--version"],
      official: "https://github.com/editorconfig-checker/editorconfig-checker",
      reason: "recommended when .editorconfig exists",
    });
  }

  if (hasGitHubWorkflows(files)) {
    tools.push(
      {
        name: "actionlint",
        command: "actionlint",
        args: ["--version"],
        official: "https://github.com/rhysd/actionlint",
        reason: "recommended for GitHub Actions workflows",
      },
      {
        name: "zizmor",
        command: "zizmor",
        args: ["--version"],
        official: "https://github.com/zizmorcore/zizmor",
        reason: "recommended for GitHub Actions security review",
      },
    );
  }

  if (await exists(path.join(targetRoot, ".git"))) {
    tools.push(
      {
        name: "Gitleaks",
        command: "gitleaks",
        args: ["version"],
        official: "https://github.com/gitleaks/gitleaks",
        reason: "recommended before publishing repositories",
      },
      {
        name: "TruffleHog",
        command: "trufflehog",
        args: ["--version"],
        official: "https://github.com/trufflesecurity/trufflehog",
        reason: "recommended for deeper secret scanning",
      },
    );
  }

  if (hasJsonSchemas(files)) {
    tools.push(
      {
        name: "Ajv",
        command: "ajv",
        args: ["--version"],
        official: "https://github.com/ajv-validator/ajv",
        reason: "optional JSON Schema validator",
      },
      {
        name: "check-jsonschema",
        command: "check-jsonschema",
        args: ["--version"],
        official: "https://github.com/python-jsonschema/check-jsonschema",
        reason: "optional JSON Schema validator",
      },
    );
  }

  if (files.includes(".pre-commit-config.yaml") || files.includes(".pre-commit-config.yml")) {
    tools.push({
      name: "pre-commit",
      command: "pre-commit",
      args: ["--version"],
      official: "https://pre-commit.com/",
      reason: "recommended when pre-commit config exists",
    });
  }

  add(
    checks,
    "info",
    "external",
    `scanned ${files.length} project files for optional external-tool recommendations`,
    { docs: "docs/external-tools.md" },
  );

  for (const tool of tools) await addExternalCommandCheck(checks, targetRoot, tool);
  if (hasPowerShellFiles(files)) await addPSScriptAnalyzerCheck(checks, targetRoot);
}

async function doctor(options) {
  const checks = [];
  const targetRoot = path.resolve(options.target);
  const entryPath = inside(targetRoot, options.entry, "entry");
  const destinationRoot = inside(targetRoot, options.dest, "destination");
  const manifestPath = path.join(destinationRoot, "MANIFEST.json");

  const major = Number.parseInt(process.versions.node.split(".")[0], 10);
  add(checks, major >= 18 ? "ok" : "error", "node", `Node.js ${process.versions.node}`);

  try {
    const metadata = await stat(targetRoot);
    add(checks, metadata.isDirectory() ? "ok" : "error", "target", targetRoot);
  } catch (error) {
    add(checks, "error", "target", `cannot read target: ${error.message}`);
    return checks;
  }

  if (await exists(entryPath)) {
    try {
      const entry = decodeUtf8(await readFile(entryPath), "entry file");
      const entryEol = lineEndings(entry.text);
      const hasBegin = entry.text.includes(BEGIN_MARKER);
      const hasEnd = entry.text.includes(END_MARKER);
      const hasRuleLink = entry.text.includes(`${toPosix(options.dest)}/RULE.md`) || entry.text.includes("RULE.md");
      if (hasBegin && hasEnd && hasRuleLink) add(checks, "ok", "entry", `${path.relative(targetRoot, entryPath)} contains managed block`);
      else {
        add(
          checks,
          "error",
          "entry",
          `${path.relative(targetRoot, entryPath)} is missing managed markers or RULE.md link`,
          { hasBegin, hasEnd, hasRuleLink },
        );
      }
      if (entry.hasBom) {
        add(checks, "warn", "entry-text", `${path.relative(targetRoot, entryPath)} has UTF-8 BOM`);
      }
      if (entryEol.style === "mixed") {
        add(
          checks,
          "warn",
          "entry-text",
          `${path.relative(targetRoot, entryPath)} has mixed line endings`,
          entryEol,
        );
      }
    } catch (error) {
      add(checks, "error", "entry", error.message);
    }
  } else add(checks, "error", "entry", `${path.relative(targetRoot, entryPath)} does not exist`);

  let manifest;
  if (await exists(manifestPath)) {
    try {
      manifest = JSON.parse(decodeUtf8(await readFile(manifestPath), "deployment manifest", { allowBom: false }).text);
      if (manifest && manifest.schemaVersion === 1 && Array.isArray(manifest.files)) {
        add(checks, "ok", "manifest", `${path.relative(targetRoot, manifestPath)} is readable`);
      } else add(checks, "error", "manifest", "manifest has invalid structure");
    } catch (error) {
      add(checks, "error", "manifest", error.message);
    }
  } else add(checks, "error", "manifest", `${path.relative(targetRoot, manifestPath)} does not exist`);

  const currentVersion = decodeUtf8(await readFile(path.join(packageRoot, "VERSION")), "VERSION", { allowBom: false }).text.trim();
  if (manifest?.packageVersion) {
    add(
      checks,
      manifest.packageVersion === currentVersion ? "ok" : "error",
      "version",
      `installed=${manifest.packageVersion} current=${currentVersion}`,
    );
  }

  const manifestLanguage = manifest?.language ?? "en";
  const expectedLanguage = options.lang === "auto" ? manifestLanguage : options.lang;
  if (manifest) {
    add(
      checks,
      manifestLanguage === expectedLanguage ? "ok" : "error",
      "language",
      `installed=${manifestLanguage} expected=${expectedLanguage}`,
    );
  }

  if (manifest?.files) {
    const artifacts = await sourceArtifacts(expectedLanguage);
    const expected = new Map(artifacts.map((artifact) => [artifact.destination, artifact.hash]));
    const installed = new Map(manifest.files.map((item) => [item.path, item.sha256]));
    let mismatchCount = 0;

    for (const [artifactPath, expectedHash] of expected) {
      const destinationPath = inside(destinationRoot, artifactPath, "artifact path");
      const manifestHash = installed.get(artifactPath);
      if (manifestHash !== expectedHash) {
        mismatchCount += 1;
        add(checks, "error", "managed-files", `manifest hash mismatch for ${artifactPath}`);
        continue;
      }
      const currentHash = (await exists(destinationPath)) ? sha256(await readFile(destinationPath)) : undefined;
      if (currentHash !== expectedHash) {
        mismatchCount += 1;
        add(checks, "error", "managed-files", `installed file differs: ${artifactPath}`);
      }
    }

    for (const artifactPath of installed.keys()) {
      if (!expected.has(artifactPath)) {
        mismatchCount += 1;
        add(checks, "error", "managed-files", `stale managed file in manifest: ${artifactPath}`);
      }
    }

    if (mismatchCount === 0) add(checks, "ok", "managed-files", "all managed files match the current kit");
  }

  if (!options.skipText) {
    const inspectScript = path.join(packageRoot, "skills", "safe-text-io", "scripts", "inspect-text.mjs");
    const results = [];
    if (await exists(entryPath)) results.push(await runNode(inspectScript, ["--ps51-safe", entryPath], targetRoot));
    if (await exists(destinationRoot)) {
      results.push(await runNode(inspectScript, ["--fail-on-bom", "--ps51-safe", destinationRoot], targetRoot));
    }
    if (results.length > 0) {
      const failed = results.find((result) => result.code !== 0 || result.signal !== null);
      add(
        checks,
        failed ? "error" : "ok",
        "text",
        failed ? "text inspection failed" : "installed text files are valid UTF-8",
        {
          stdout: results.map((result) => result.stdout.trim()).filter(Boolean).join("\n"),
          stderr: results.map((result) => result.stderr.trim()).filter(Boolean).join("\n"),
        },
      );
    }
  }

  if (options.external) await addExternalChecks(checks, targetRoot);

  return checks;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    process.exitCode = 0;
  } else {
    const checks = await doctor(options);
    if (options.json) process.stdout.write(`${JSON.stringify(checks, null, 2)}\n`);
    else {
      for (const check of checks) {
        const label = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : check.status === "info" ? "INFO" : "ERROR";
        process.stdout.write(`${label} ${check.name}: ${check.message}\n`);
      }
    }
    process.exitCode = checks.some((check) => check.status === "error") ? 1 : 0;
  }
} catch (error) {
  usage();
  process.stderr.write(`doctor: ${error.message}\n`);
  process.exitCode = 2;
}
