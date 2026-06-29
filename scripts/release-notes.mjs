#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function usage() {
  process.stderr.write("usage: node release-notes.mjs <vX.Y.Z|X.Y.Z>\n");
}

function fail(message, code = 2) {
  process.stderr.write(`release-notes: ${message}\n`);
  process.exit(code);
}

function extractReleaseNotes(changelog, version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const heading = new RegExp(`^##\\s+${escaped}(?:\\s+-\\s+.*)?\\s*$`, "m");
  const match = changelog.match(heading);
  if (!match || match.index === undefined) return undefined;

  const start = match.index + match[0].length;
  const rest = changelog.slice(start).replace(/^\r?\n/, "");
  const nextHeading = rest.search(/^##\s+/m);
  return (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim();
}

if (process.argv.length !== 3 || process.argv[2] === "--help" || process.argv[2] === "-h") {
  usage();
  process.exit(process.argv.length === 3 ? 0 : 2);
}

try {
  const version = process.argv[2].replace(/^v/u, "");
  const changelog = await readFile(path.join(packageRoot, "CHANGELOG.md"), "utf8");
  const notes = extractReleaseNotes(changelog, version);
  if (!notes) fail(`could not find CHANGELOG.md section for ${version}`, 1);
  process.stdout.write(`${notes}\n`);
} catch (error) {
  fail(error.message);
}
