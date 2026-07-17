#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import process from "node:process";
import { decodeUtf8Text } from "../../../lib/text.mjs";

function usage() {
  process.stderr.write("usage: node read-text.mjs [--json|--concat] [--] <path> [<path> ...]\n");
}

function parseArgs(argv) {
  const options = { paths: [], json: false, concat: false };
  let terminated = false;
  for (const value of argv) {
    if (terminated) options.paths.push(value);
    else if (value === "--") terminated = true;
    else if (value === "--help" || value === "-h") options.help = true;
    else if (value === "--json") options.json = true;
    else if (value === "--concat") options.concat = true;
    else if (value.startsWith("-")) throw new Error(`unknown option: ${value}; use -- before a path that starts with -`);
    else options.paths.push(value);
  }
  if (options.json && options.concat) throw new Error("--json and --concat are mutually exclusive");
  if (!options.help && options.paths.length === 0) throw new Error("at least one path is required");
  if (!options.help && options.paths.length > 1 && !options.json && !options.concat) {
    throw new Error("multiple paths require --json or explicit --concat to avoid ambiguous output boundaries");
  }
  return options;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) usage();
  else {
    const results = [];
    for (const filePath of options.paths) {
      results.push({ path: filePath, text: decodeUtf8Text(await readFile(filePath), filePath) });
    }
    if (options.json) process.stdout.write(Buffer.from(`${JSON.stringify(results)}\n`, "utf8"));
    else process.stdout.write(Buffer.from(results.map((item) => item.text).join(""), "utf8"));
  }
} catch (error) {
  usage();
  process.stderr.write(`read-text: ${error.message}\n`);
  process.exitCode = 2;
}
