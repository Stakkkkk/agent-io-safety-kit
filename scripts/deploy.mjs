#!/usr/bin/env node
import { readdir, readFile, rmdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  assertNoSymlinkPath,
  inside,
  isInsidePath,
  PACKAGE_ROOT,
  removeManagedEntry,
  renderManagedFragment,
  sourceArtifacts,
  updateManagedEntry,
  validateManifest,
} from "../lib/deployment.mjs";
import { atomicWriteFile, decodeUtf8, detectPreferredEol, exists, normalizeLf, sha256 } from "../lib/text.mjs";

function fail(message, code = 2) {
  process.stderr.write(`deploy: ${message}\n`);
  process.exit(code);
}

function usage() {
  process.stderr.write(
    "usage: node deploy.mjs [--target dir] [--entry AGENTS.md] [--dest .agent-io-safety] " +
      "[--lang en|ru] [--profile core|full] [--dry-run|--check] [--force] " +
      "[--fragment file] [--fix-entry-text] [--uninstall]\n",
  );
}

function takeValue(argv, index, flag) {
  if (index + 1 >= argv.length) throw new Error(`${flag} requires a value`);
  return argv[index + 1];
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
    lang: "en",
    profile: "core",
    fixEntryText: false,
    uninstall: false,
    help: false,
    version: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (["--target", "--entry", "--dest", "--fragment", "--lang", "--profile"].includes(value)) {
      const next = takeValue(argv, index, value);
      index += 1;
      if (value === "--target") options.target = next;
      else if (value === "--entry") options.entry = next;
      else if (value === "--dest") options.dest = next;
      else if (value === "--fragment") options.fragment = next;
      else if (value === "--lang") options.lang = next;
      else options.profile = next;
    } else if (value === "--dry-run") options.dryRun = true;
    else if (value === "--check") options.check = true;
    else if (value === "--force") options.force = true;
    else if (value === "--fix-entry-text") options.fixEntryText = true;
    else if (value === "--uninstall") options.uninstall = true;
    else if (value === "--version" || value === "-V") options.version = true;
    else if (value === "--help" || value === "-h") options.help = true;
    else throw new Error(`unknown option: ${value}`);
  }
  if (!options.target || !options.entry || !options.dest || options.fragment === "") {
    throw new Error("path options require non-empty values");
  }
  if (!new Set(["en", "ru"]).has(options.lang)) throw new Error("--lang must be en or ru");
  if (!new Set(["core", "full"]).has(options.profile)) throw new Error("--profile must be core or full");
  if (options.dryRun && options.check) throw new Error("--dry-run and --check are mutually exclusive");
  if (options.check && options.force) throw new Error("--check and --force are mutually exclusive");
  if (options.uninstall && options.check) throw new Error("--uninstall and --check are mutually exclusive");
  if (options.uninstall && options.fixEntryText) throw new Error("--uninstall and --fix-entry-text are mutually exclusive");
  return options;
}

async function readManifest(manifestPath) {
  if (!(await exists(manifestPath))) return undefined;
  const decoded = decodeUtf8(await readFile(manifestPath), "deployment manifest", { allowBom: false });
  return validateManifest(JSON.parse(decoded.text));
}

async function hashIfExists(filePath) {
  return (await exists(filePath)) ? sha256(await readFile(filePath)) : undefined;
}

async function targetPaths(options) {
  const targetRoot = path.resolve(options.target);
  const targetInfo = await stat(targetRoot);
  if (!targetInfo.isDirectory()) throw new Error("target must be a directory");
  const entryPath = inside(targetRoot, options.entry, "entry");
  const destinationRoot = inside(targetRoot, options.dest, "destination");
  if (isInsidePath(destinationRoot, entryPath)) throw new Error("entry file cannot be inside deployment destination");
  return { targetRoot, entryPath, destinationRoot, manifestPath: path.join(destinationRoot, "MANIFEST.json") };
}

async function buildInstallState(options) {
  const paths = await targetPaths(options);
  const artifacts = await sourceArtifacts({ lang: options.lang, profile: options.profile });
  const version = decodeUtf8(await readFile(path.join(PACKAGE_ROOT, "VERSION")), "VERSION", { allowBom: false }).text.trim();
  const oldManifest = await readManifest(paths.manifestPath);
  const oldFiles = new Map((oldManifest?.files ?? []).map((item) => [item.path, item.sha256]));
  const newFiles = new Map(artifacts.map((item) => [item.destination, item]));
  const conflicts = [];
  const writes = [];
  const removals = [];

  for (const artifact of artifacts) {
    const destinationPath = inside(paths.destinationRoot, artifact.destination, "artifact path");
    const currentHash = await hashIfExists(destinationPath);
    const oldHash = oldFiles.get(artifact.destination);
    if (currentHash && currentHash !== artifact.hash && currentHash !== oldHash) {
      conflicts.push(`modified managed file: ${path.relative(paths.targetRoot, destinationPath)}`);
    }
    if (currentHash !== artifact.hash) writes.push({ ...artifact, destinationPath });
  }

  for (const [oldPath, oldHash] of oldFiles) {
    if (newFiles.has(oldPath)) continue;
    const destinationPath = inside(paths.destinationRoot, oldPath, "stale artifact path");
    const currentHash = await hashIfExists(destinationPath);
    if (!currentHash) continue;
    if (currentHash !== oldHash) conflicts.push(`modified stale managed file: ${path.relative(paths.targetRoot, destinationPath)}`);
    else removals.push(destinationPath);
  }

  const renderedFragment = await renderManagedFragment({
    ...paths,
    lang: options.lang,
    fragment: options.fragment,
  });

  let currentEntryText = "";
  let entryTextForUpdate = "";
  let currentEntryHasBom = false;
  let expectedEntryHasBom = false;
  let entryEol = "\n";
  if (await exists(paths.entryPath)) {
    const decoded = decodeUtf8(await readFile(paths.entryPath), "entry file");
    currentEntryText = decoded.text;
    currentEntryHasBom = decoded.hasBom;
    expectedEntryHasBom = options.fixEntryText ? false : decoded.hasBom;
    entryTextForUpdate = options.fixEntryText ? normalizeLf(decoded.text) : decoded.text;
    entryEol = options.fixEntryText ? "\n" : detectPreferredEol(decoded.text);
  }
  const expectedEntryText = updateManagedEntry(entryTextForUpdate, renderedFragment, entryEol);
  const entryChanged = expectedEntryText !== currentEntryText || expectedEntryHasBom !== currentEntryHasBom;

  const manifest = {
    schemaVersion: 2,
    packageVersion: version,
    language: options.lang,
    profile: options.profile,
    entry: {
      fragment: options.fragment ? "custom" : "default",
      blockSha256: sha256(Buffer.from(normalizeLf(renderedFragment).trimEnd(), "utf8")),
    },
    files: artifacts.map((artifact) => ({ path: artifact.destination, sha256: artifact.hash })),
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    ...paths,
    manifestBytes,
    oldManifest,
    conflicts,
    writes,
    removals,
    entryChanged,
    expectedEntryText,
    entryHasBom: expectedEntryHasBom,
    manifestChanged: await hashIfExists(paths.manifestPath) !== sha256(manifestBytes),
  };
}

function reportInstallPlan(state) {
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

async function pruneEmptyDirectories(root, current = root) {
  if (!(await exists(current))) return;
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.isDirectory()) await pruneEmptyDirectories(root, path.join(current, entry.name));
  }
  if (current !== root && (await readdir(current)).length === 0) await rmdir(current);
}

async function install(options) {
  const state = await buildInstallState(options);
  reportInstallPlan(state);
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
    await atomicWriteFile(item.destinationPath, item.bytes);
  }
  for (const item of state.removals) {
    await assertNoSymlinkPath(state.targetRoot, item, "stale artifact path");
    await unlink(item);
  }
  await pruneEmptyDirectories(state.destinationRoot);

  if (state.entryChanged) {
    await assertNoSymlinkPath(state.targetRoot, state.entryPath, "entry file");
    const content = Buffer.from(state.expectedEntryText, "utf8");
    const bytes = state.entryHasBom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), content]) : content;
    await atomicWriteFile(state.entryPath, bytes);
  }

  await assertNoSymlinkPath(state.targetRoot, state.manifestPath, "deployment manifest");
  if (state.manifestChanged || state.writes.length > 0 || state.removals.length > 0) {
    await atomicWriteFile(state.manifestPath, state.manifestBytes);
  }
}

async function buildUninstallState(options) {
  const paths = await targetPaths(options);
  const manifest = await readManifest(paths.manifestPath);
  if (!manifest) throw new Error("deployment manifest does not exist; refusing an untracked uninstall");

  const conflicts = [];
  const removals = [];
  for (const item of manifest.files) {
    const filePath = inside(paths.destinationRoot, item.path, "managed artifact path");
    const currentHash = await hashIfExists(filePath);
    if (!currentHash) continue;
    if (currentHash !== item.sha256) conflicts.push(`modified managed file: ${path.relative(paths.targetRoot, filePath)}`);
    removals.push(filePath);
  }

  if (!(await exists(paths.entryPath))) throw new Error("entry file does not exist; refusing to remove only the managed files");
  const decodedEntry = decodeUtf8(await readFile(paths.entryPath), "entry file");
  const expectedEntryText = removeManagedEntry(decodedEntry.text);
  return { ...paths, manifest, conflicts, removals, decodedEntry, expectedEntryText };
}

function reportUninstallPlan(state) {
  for (const conflict of state.conflicts) process.stdout.write(`CONFLICT ${conflict}\n`);
  for (const item of state.removals) process.stdout.write(`REMOVE ${path.relative(state.targetRoot, item)}\n`);
  process.stdout.write(`UPDATE ${path.relative(state.targetRoot, state.entryPath)}\n`);
  process.stdout.write(`REMOVE ${path.relative(state.targetRoot, state.manifestPath)}\n`);
}

async function uninstall(options) {
  const state = await buildUninstallState(options);
  reportUninstallPlan(state);
  if (state.conflicts.length > 0 && !options.force) {
    throw new Error("managed files contain local changes; inspect them or pass --force to remove them");
  }
  if (options.dryRun) return;

  for (const item of state.removals) {
    await assertNoSymlinkPath(state.targetRoot, item, "managed artifact path");
    await unlink(item);
  }
  await assertNoSymlinkPath(state.targetRoot, state.entryPath, "entry file");
  const content = Buffer.from(state.expectedEntryText, "utf8");
  const bytes = state.decodedEntry.hasBom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), content]) : content;
  await atomicWriteFile(state.entryPath, bytes);
  await assertNoSymlinkPath(state.targetRoot, state.manifestPath, "deployment manifest");
  await unlink(state.manifestPath);
  await pruneEmptyDirectories(state.destinationRoot);
  if ((await exists(state.destinationRoot)) && (await readdir(state.destinationRoot)).length === 0) await rmdir(state.destinationRoot);
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
  } else if (options.version) {
    const version = decodeUtf8(await readFile(path.join(PACKAGE_ROOT, "VERSION")), "VERSION", { allowBom: false }).text.trim();
    process.stdout.write(`${version}\n`);
  } else if (options.uninstall) {
    await uninstall(options);
  } else {
    await install(options);
  }
} catch (error) {
  usage();
  fail(error.message);
}
