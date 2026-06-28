#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstat, readdir, readFile, stat, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const BEGIN_MARKER = "<!-- agent-io-safety:begin -->";
const END_MARKER = "<!-- agent-io-safety:end -->";
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message, code = 2) {
  process.stderr.write(`deploy: ${message}\n`);
  process.exit(code);
}

function usage() {
  process.stderr.write(
    "usage: node deploy.mjs [--target dir] [--entry AGENTS.md] " +
      "[--dest .agent-io-safety] [--dry-run|--check] [--force] [--fragment file]\n",
  );
}

function parseArgs(argv) {
  const options = {
    target: ".",
    entry: "AGENTS.md",
    dest: ".agent-io-safety",
    dryRun: false,
    check: false,
    force: false,
    fragment: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--target") options.target = argv[++index];
    else if (value === "--entry") options.entry = argv[++index];
    else if (value === "--dest") options.dest = argv[++index];
    else if (value === "--fragment") options.fragment = argv[++index];
    else if (value === "--dry-run") options.dryRun = true;
    else if (value === "--check") options.check = true;
    else if (value === "--force") options.force = true;
    else if (value === "--help" || value === "-h") options.help = true;
    else throw new Error(`unknown option: ${value}`);
  }
  if (!options.target || !options.entry || !options.dest || options.fragment === "") {
    throw new Error("path options require values");
  }
  if (options.dryRun && options.check) throw new Error("--dry-run and --check are mutually exclusive");
  if (options.check && options.force) throw new Error("--check and --force are mutually exclusive");
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

function isInsidePath(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function assertNoSymlinkPath(root, candidate, label) {
  const absoluteRoot = path.resolve(root);
  const absoluteCandidate = path.resolve(candidate);
  if (absoluteCandidate !== absoluteRoot && !isInsidePath(absoluteRoot, absoluteCandidate)) {
    throw new Error(`${label} must stay inside target root`);
  }

  const relative = path.relative(absoluteRoot, absoluteCandidate);
  if (relative === "") return;

  let current = absoluteRoot;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) {
        throw new Error(`${label} contains symlink: ${path.relative(root, current)}`);
      }
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
  }
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
    throw new Error(`${label} is UTF-16; convert it explicitly before deployment`);
  }
  const content = hasBom ? bytes.subarray(3) : bytes;
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(content), hasBom };
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8: ${error.message}`);
  }
}

function detectEol(text) {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const withoutCrlf = text.replace(/\r\n/g, "");
  const lf = (withoutCrlf.match(/\n/g) ?? []).length;
  return crlf > lf ? "\r\n" : "\n";
}

function normalizeLf(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function selectFragment(entry) {
  const normalized = toPosix(entry).toLowerCase();
  const name = path.posix.basename(normalized);
  if (normalized === ".github/copilot-instructions.md") return "copilot-instructions.md.fragment";
  if (normalized.startsWith(".cursor/") || name === ".cursorrules" || name.endsWith(".mdc")) return "cursor-rules.fragment";
  if (name === "claude.md") return "CLAUDE.md.fragment";
  if (name === "gemini.md") return "GEMINI.md.fragment";
  return "AGENTS.md.fragment";
}

function updateEntry(existingText, fragmentLf, eol) {
  const begin = existingText.indexOf(BEGIN_MARKER);
  const end = existingText.indexOf(END_MARKER);
  if ((begin === -1) !== (end === -1)) throw new Error("entry file contains only one managed marker");
  if (begin !== -1 && (end < begin || existingText.indexOf(BEGIN_MARKER, begin + 1) !== -1 || existingText.indexOf(END_MARKER, end + 1) !== -1)) {
    throw new Error("entry file contains invalid or duplicate managed markers");
  }

  const fragment = normalizeLf(fragmentLf).trimEnd().replace(/\n/g, eol);
  if (begin !== -1) {
    return existingText.slice(0, begin) + fragment + existingText.slice(end + END_MARKER.length);
  }

  const trimmed = existingText.replace(/[\r\n]*$/, "");
  return trimmed.length === 0 ? `${fragment}${eol}` : `${trimmed}${eol}${eol}${fragment}${eol}`;
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

async function readManifest(manifestPath) {
  if (!(await exists(manifestPath))) return undefined;
  const decoded = decodeUtf8(await readFile(manifestPath), "deployment manifest", { allowBom: false });
  const manifest = JSON.parse(decoded.text);
  if (!manifest || !Array.isArray(manifest.files)) throw new Error("deployment manifest has invalid structure");
  return manifest;
}

async function hashIfExists(filePath) {
  return (await exists(filePath)) ? sha256(await readFile(filePath)) : undefined;
}

async function buildState(options) {
  const targetRoot = path.resolve(options.target);
  const targetInfo = await stat(targetRoot);
  if (!targetInfo.isDirectory()) throw new Error("target must be a directory");

  const entryPath = inside(targetRoot, options.entry, "entry");
  const destinationRoot = inside(targetRoot, options.dest, "destination");
  if (isInsidePath(destinationRoot, entryPath)) throw new Error("entry file cannot be inside deployment destination");

  const artifacts = await sourceArtifacts();
  const version = decodeUtf8(await readFile(path.join(packageRoot, "VERSION")), "VERSION", { allowBom: false }).text.trim();
  const manifestPath = path.join(destinationRoot, "MANIFEST.json");
  const oldManifest = await readManifest(manifestPath);
  const oldFiles = new Map((oldManifest?.files ?? []).map((item) => [item.path, item.sha256]));
  const newFiles = new Map(artifacts.map((item) => [item.destination, item]));
  const conflicts = [];
  const writes = [];
  const removals = [];

  for (const artifact of artifacts) {
    const destinationPath = inside(destinationRoot, artifact.destination, "artifact path");
    const currentHash = await hashIfExists(destinationPath);
    const oldHash = oldFiles.get(artifact.destination);
    if (currentHash && currentHash !== artifact.hash && currentHash !== oldHash) {
      conflicts.push(`modified managed file: ${path.relative(targetRoot, destinationPath)}`);
    }
    if (currentHash !== artifact.hash) writes.push({ ...artifact, destinationPath });
  }

  for (const [oldPath, oldHash] of oldFiles) {
    if (newFiles.has(oldPath)) continue;
    const destinationPath = inside(destinationRoot, oldPath, "stale artifact path");
    const currentHash = await hashIfExists(destinationPath);
    if (!currentHash) continue;
    if (currentHash !== oldHash) conflicts.push(`modified stale managed file: ${path.relative(targetRoot, destinationPath)}`);
    else removals.push(destinationPath);
  }

  const fragmentPath = options.fragment
    ? path.resolve(packageRoot, options.fragment)
    : path.join(packageRoot, "snippets", selectFragment(options.entry));
  if (!isInsidePath(packageRoot, fragmentPath)) throw new Error("fragment must stay inside package root");
  const template = decodeUtf8(
    await readFile(fragmentPath),
    "entry fragment",
    { allowBom: false },
  ).text;
  const ruleRelative = toPosix(path.relative(path.dirname(entryPath), path.join(destinationRoot, "RULE.md")));
  const ruleLink = ruleRelative.startsWith(".") ? ruleRelative : `./${ruleRelative}`;
  const renderedFragment = template.replaceAll("{{RULE_PATH}}", ruleLink);

  let entryText = "";
  let entryHasBom = false;
  let entryEol = "\n";
  if (await exists(entryPath)) {
    const decoded = decodeUtf8(await readFile(entryPath), "entry file");
    entryText = decoded.text;
    entryHasBom = decoded.hasBom;
    entryEol = detectEol(entryText);
  }
  const expectedEntryText = updateEntry(entryText, renderedFragment, entryEol);
  const entryChanged = expectedEntryText !== entryText;

  const manifest = {
    schemaVersion: 1,
    packageVersion: version,
    files: artifacts.map((artifact) => ({ path: artifact.destination, sha256: artifact.hash })),
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const expectedManifestHash = sha256(manifestBytes);
  const currentManifestHash = await hashIfExists(manifestPath);

  return {
    targetRoot,
    entryPath,
    destinationRoot,
    manifestPath,
    manifestBytes,
    oldManifest,
    conflicts,
    writes,
    removals,
    entryChanged,
    expectedEntryText,
    entryHasBom,
    entryEol,
    manifestChanged: currentManifestHash !== expectedManifestHash,
  };
}

function reportPlan(state) {
  for (const conflict of state.conflicts) process.stdout.write(`CONFLICT ${conflict}\n`);
  for (const item of state.writes) process.stdout.write(`WRITE ${path.relative(state.targetRoot, item.destinationPath)}\n`);
  for (const item of state.removals) process.stdout.write(`REMOVE ${path.relative(state.targetRoot, item)}\n`);
  if (state.entryChanged) process.stdout.write(`UPDATE ${path.relative(state.targetRoot, state.entryPath)}\n`);
  if (state.manifestChanged) process.stdout.write(`WRITE ${path.relative(state.targetRoot, state.manifestPath)}\n`);
  if (
    state.conflicts.length === 0 && state.writes.length === 0 && state.removals.length === 0 &&
    !state.entryChanged && !state.manifestChanged
  ) process.stdout.write("UP-TO-DATE\n");
}

async function deploy(options) {
  const state = await buildState(options);
  reportPlan(state);

  if (options.check) {
    const invalid = state.conflicts.length > 0 || state.writes.length > 0 || state.removals.length > 0 ||
      state.entryChanged || state.manifestChanged || !state.oldManifest;
    process.exitCode = invalid ? 1 : 0;
    return;
  }

  if (state.conflicts.length > 0 && !options.force) {
    throw new Error("managed files contain local changes; inspect them or pass --force");
  }
  if (options.dryRun) return;

  for (const item of state.writes) {
    await assertNoSymlinkPath(state.targetRoot, item.destinationPath, "artifact path");
    await mkdir(path.dirname(item.destinationPath), { recursive: true });
    await writeFile(item.destinationPath, item.bytes);
  }
  for (const item of state.removals) {
    await assertNoSymlinkPath(state.targetRoot, item, "stale artifact path");
    await unlink(item);
  }

  if (state.entryChanged) {
    await assertNoSymlinkPath(state.targetRoot, state.entryPath, "entry file");
    await mkdir(path.dirname(state.entryPath), { recursive: true });
    const content = Buffer.from(state.expectedEntryText, "utf8");
    const bytes = state.entryHasBom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), content]) : content;
    await writeFile(state.entryPath, bytes);
  }

  await assertNoSymlinkPath(state.targetRoot, state.manifestPath, "deployment manifest");
  await mkdir(state.destinationRoot, { recursive: true });
  if (state.manifestChanged || state.writes.length > 0 || state.removals.length > 0) {
    await writeFile(state.manifestPath, state.manifestBytes);
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    process.exitCode = 0;
  } else await deploy(options);
} catch (error) {
  usage();
  fail(error.message);
}
