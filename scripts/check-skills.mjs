#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { PACKAGE_ROOT } from "../lib/deployment.mjs";
import { decodeUtf8Text } from "../lib/text.mjs";

const allowed = new Set(["name", "description", "license", "allowed-tools", "metadata"]);
const errors = [];

function parseFrontmatter(text, label) {
  const match = text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/u);
  if (!match) throw new Error(`${label}: invalid or missing YAML frontmatter`);
  const result = {};
  for (const line of match[1].split("\n")) {
    const index = line.indexOf(":");
    if (index <= 0) throw new Error(`${label}: unsupported frontmatter line: ${line}`);
    const key = line.slice(0, index).trim();
    if (!allowed.has(key)) throw new Error(`${label}: unexpected frontmatter key: ${key}`);
    if (Object.hasOwn(result, key)) throw new Error(`${label}: duplicate frontmatter key: ${key}`);
    result[key] = line.slice(index + 1).trim();
  }
  return result;
}

for (const entry of await readdir(path.join(PACKAGE_ROOT, "skills"), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const label = `skills/${entry.name}/SKILL.md`;
  try {
    const text = decodeUtf8Text(await readFile(path.join(PACKAGE_ROOT, label)), label, { allowBom: false });
    const frontmatter = parseFrontmatter(text, label);
    if (!frontmatter.name) throw new Error(`${label}: missing name`);
    if (!frontmatter.description) throw new Error(`${label}: missing description`);
    if (frontmatter.name !== entry.name) throw new Error(`${label}: name must match the skill directory`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(frontmatter.name) || frontmatter.name.length > 64) {
      throw new Error(`${label}: name must be hyphen-case and at most 64 characters`);
    }
    if (frontmatter.description.length > 1024 || /[<>]/u.test(frontmatter.description)) {
      throw new Error(`${label}: description must be at most 1024 characters and contain no angle brackets`);
    }
  } catch (error) {
    errors.push(error.message);
  }
}

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`ERROR ${error}\n`);
  process.exitCode = 1;
} else process.stdout.write("OK skill structure\n");
