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
      "[--json] [--skip-text]\n",
  );
}

function parseArgs(argv) {
  const options = {
    target: ".",
    entry: "AGENTS.md",
    dest: ".agent-io-safety",
    json: false,
    skipText: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--target") options.target = argv[++index];
    else if (value === "--entry") options.entry = argv[++index];
    else if (value === "--dest") options.dest = argv[++index];
    else if (value === "--json") options.json = true;
    else if (value === "--skip-text") options.skipText = true;
    else if (value === "--help" || value === "-h") options.help = true;
    else throw new Error(`unknown option: ${value}`);
  }
  if (!options.target || !options.entry || !options.dest) throw new Error("path options require values");
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

async function sourceArtifacts() {
  const mappings = [
    { source: path.join(packageRoot, "VERSION"), destination: "VERSION" },
    { source: path.join(packageRoot, "RULE.md"), destination: "RULE.md" },
  ];
  const skillsRoot = path.join(packageRoot, "skills");
  for (const relative of await collectFiles(skillsRoot)) {
    mappings.push({ source: path.join(skillsRoot, relative), destination: path.join("skills", relative) });
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

function add(checks, status, name, message, details = undefined) {
  checks.push({ status, name, message, ...(details === undefined ? {} : { details }) });
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

  if (manifest?.files) {
    const artifacts = await sourceArtifacts();
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
        const label = check.status === "ok" ? "OK" : "ERROR";
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
