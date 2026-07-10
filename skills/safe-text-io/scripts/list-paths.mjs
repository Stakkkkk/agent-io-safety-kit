#!/usr/bin/env node
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function usage() {
  process.stderr.write(
    "usage: node list-paths.mjs [--json] [--recursive] [--files] [--dirs] <path> [<path> ...]\n",
  );
}

function parseArgs(argv) {
  const options = {
    help: false,
    json: false,
    recursive: false,
    files: false,
    dirs: false,
    paths: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") options.help = true;
    else if (value === "--json") options.json = true;
    else if (value === "--recursive") options.recursive = true;
    else if (value === "--files") options.files = true;
    else if (value === "--dirs") options.dirs = true;
    else if (value.startsWith("--")) throw new Error(`unknown option: ${value}`);
    else options.paths.push(value);
  }

  if (options.files && options.dirs) throw new Error("--files and --dirs are mutually exclusive");
  if (!options.help && options.paths.length === 0) throw new Error("at least one path is required");
  return options;
}

function classify(metadata) {
  if (metadata.isSymbolicLink()) return "symlink";
  if (metadata.isFile()) return "file";
  if (metadata.isDirectory()) return "directory";
  return "other";
}

function includeType(type, options) {
  if (options.files) return type === "file";
  if (options.dirs) return type === "directory";
  return true;
}

function comparePath(left, right) {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

async function entryFor(displayPath) {
  const metadata = await lstat(displayPath);
  return { path: displayPath, type: classify(metadata), metadata };
}

async function collectDirectory(inputPath, options) {
  const entries = [];
  const names = await readdir(inputPath);
  names.sort();

  for (const name of names) {
    const childPath = path.join(inputPath, name);
    const entry = await entryFor(childPath);
    if (includeType(entry.type, options)) entries.push({ path: entry.path, type: entry.type });
    if (options.recursive && entry.type === "directory") {
      entries.push(...(await collectDirectory(childPath, options)));
    }
  }

  return entries.sort(comparePath);
}

async function collect(inputPath, options) {
  const entry = await entryFor(inputPath);
  if (entry.type === "directory") return collectDirectory(inputPath, options);
  return includeType(entry.type, options) ? [{ path: entry.path, type: entry.type }] : [];
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    usage();
    process.exitCode = 0;
    return;
  }

  const results = [];
  for (const inputPath of options.paths) results.push(...(await collect(inputPath, options)));
  results.sort(comparePath);

  if (options.json) {
    process.stdout.write(Buffer.from(`${JSON.stringify(results, null, 2)}\n`, "utf8"));
  } else {
    const text = results.map((entry) => entry.path).join("\n");
    process.stdout.write(Buffer.from(text ? `${text}\n` : "", "utf8"));
  }
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  usage();
  process.stderr.write(Buffer.from(`list-paths: ${error.message}\n`, "utf8"));
  process.exitCode = 1;
}
