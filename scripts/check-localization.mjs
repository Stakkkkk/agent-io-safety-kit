#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { PACKAGE_ROOT } from "../lib/deployment.mjs";
import { decodeUtf8Text } from "../lib/text.mjs";

async function markdownFiles(root, relative = "") {
  const output = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) output.push(...(await markdownFiles(root, child)));
    else if (entry.isFile() && entry.name.endsWith(".md")) output.push(child);
  }
  return output;
}

function headings(text) {
  return [...text.matchAll(/^(#{1,6})\s+/gmu)].map((match) => match[1].length);
}

function fences(text) {
  return [...text.matchAll(/^```/gmu)].length;
}

function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/u);
  if (!match) return undefined;
  return Object.fromEntries(match[1].split("\n").map((line) => {
    const index = line.indexOf(":");
    return [line.slice(0, index), line.slice(index + 1).trim()];
  }));
}

const pairs = [
  ["README.md", "README.ru.md"], ["00-MECHANISM.md", "00-MECHANISM.ru.md"],
  ["01-DEPLOYMENT.md", "01-DEPLOYMENT.ru.md"], ["RULE.md", "RULE.ru.md"],
  ["snippets/AGENTS.md.fragment", "snippets/ru/AGENTS.md.fragment"],
];

for (const relative of await markdownFiles(path.join(PACKAGE_ROOT, "docs"))) {
  if (!relative.startsWith(`ru${path.sep}`)) pairs.push([path.join("docs", relative), path.join("docs", "ru", relative)]);
}
for (const skill of await readdir(path.join(PACKAGE_ROOT, "skills"), { withFileTypes: true })) {
  if (!skill.isDirectory()) continue;
  const root = path.join(PACKAGE_ROOT, "skills", skill.name);
  for (const relative of await markdownFiles(root)) {
    if (relative.endsWith(".ru.md")) continue;
    const localized = relative.replace(/\.md$/u, ".ru.md");
    pairs.push([path.join("skills", skill.name, relative), path.join("skills", skill.name, localized)]);
  }
}

const errors = [];
for (const [canonicalPath, localizedPath] of pairs) {
  try {
    const canonical = decodeUtf8Text(await readFile(path.join(PACKAGE_ROOT, canonicalPath)), canonicalPath, { allowBom: false });
    const localized = decodeUtf8Text(await readFile(path.join(PACKAGE_ROOT, localizedPath)), localizedPath, { allowBom: false });
    if (JSON.stringify(headings(canonical)) !== JSON.stringify(headings(localized))) {
      errors.push(`${localizedPath}: heading-level structure differs from ${canonicalPath}`);
    }
    if (fences(canonical) !== fences(localized) || fences(canonical) % 2 !== 0) {
      errors.push(`${localizedPath}: code-fence structure differs from ${canonicalPath}`);
    }
    const canonicalFrontmatter = frontmatter(canonical);
    const localizedFrontmatter = frontmatter(localized);
    if (canonicalFrontmatter && (!localizedFrontmatter || canonicalFrontmatter.name !== localizedFrontmatter.name || canonicalFrontmatter.description !== localizedFrontmatter.description)) {
      errors.push(`${localizedPath}: skill frontmatter must preserve canonical name and description`);
    }
  } catch (error) {
    errors.push(`${localizedPath}: ${error.code === "ENOENT" ? "missing localization" : error.message}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`ERROR ${error}\n`);
  process.exitCode = 1;
} else process.stdout.write(`OK localization structure: ${pairs.length} pairs\n`);
