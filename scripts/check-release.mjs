#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { PACKAGE_ROOT } from "../lib/deployment.mjs";
import { decodeUtf8Text } from "../lib/text.mjs";

function fail(message) {
  throw new Error(message);
}

try {
  const tagIndex = process.argv.indexOf("--tag");
  const tag = tagIndex === -1 ? undefined : process.argv[tagIndex + 1];
  if (tagIndex !== -1 && !tag) fail("--tag requires a value");
  const packageJson = JSON.parse(decodeUtf8Text(await readFile(path.join(PACKAGE_ROOT, "package.json")), "package.json", { allowBom: false }));
  const version = decodeUtf8Text(await readFile(path.join(PACKAGE_ROOT, "VERSION")), "VERSION", { allowBom: false }).trim();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) fail(`VERSION is not semver: ${version}`);
  if (packageJson.version !== version) fail(`package.json=${packageJson.version}, VERSION=${version}`);
  if (!packageJson.files?.includes("lib/")) fail("package.json files must include lib/");
  if (tag && tag.replace(/^v/u, "") !== version) fail(`tag=${tag}, VERSION=${version}`);
  const changelog = decodeUtf8Text(await readFile(path.join(PACKAGE_ROOT, "CHANGELOG.md")), "CHANGELOG.md", { allowBom: false });
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const releaseHeading = new RegExp(`^## ${escapedVersion}(?: - \\d{4}-\\d{2}-\\d{2})?$`, "mu");
  if (!releaseHeading.test(changelog)) fail(`CHANGELOG.md has no ${version} section`);
  if (!/^## Unreleased\s*\n/u.test(changelog.slice(changelog.indexOf("## Unreleased")))) fail("CHANGELOG.md has no Unreleased section");
  process.stdout.write(`OK release metadata: ${tag ?? `v${version}`}\n`);
} catch (error) {
  process.stderr.write(`check-release: ${error.message}\n`);
  process.exitCode = 1;
}
