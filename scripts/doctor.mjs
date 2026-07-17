#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  analyzeManagedMarkers,
  END_MARKER,
  inside,
  manifestProfile,
  PACKAGE_ROOT,
  renderManagedFragment,
  sourceArtifacts,
  toPosix,
  validateManifest,
} from "../lib/deployment.mjs";
import { resolveExecutable, runProcess } from "../lib/process.mjs";
import { decodeUtf8, exists, lineEndings, normalizeLf, sha256 } from "../lib/text.mjs";

function usage() {
  process.stderr.write(
    "usage: node doctor.mjs [--target dir] [--entry AGENTS.md] [--dest .agent-io-safety] " +
      "[--lang auto|en|ru] [--profile auto|core|full] [--json] [--skip-text] " +
      "[--external|--external-run]\n",
  );
}

function parseArgs(argv) {
  const options = {
    target: ".", entry: "AGENTS.md", dest: ".agent-io-safety", lang: "auto", profile: "auto",
    json: false, skipText: false, external: false, externalRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (new Set(["--target", "--entry", "--dest", "--lang", "--profile"]).has(value)) {
      const next = argv[++index];
      if (!next) throw new Error(`${value} requires a value`);
      options[value.slice(2)] = next;
    } else if (value === "--json") options.json = true;
    else if (value === "--skip-text") options.skipText = true;
    else if (value === "--external") options.external = true;
    else if (value === "--external-run") {
      options.external = true;
      options.externalRun = true;
    } else if (value === "--help" || value === "-h") options.help = true;
    else throw new Error(`unknown option: ${value}`);
  }
  if (!new Set(["auto", "en", "ru"]).has(options.lang)) throw new Error("--lang must be auto, en, or ru");
  if (!new Set(["auto", "core", "full"]).has(options.profile)) {
    throw new Error("--profile must be auto, core, or full");
  }
  return options;
}

function add(checks, status, name, message, details) {
  checks.push({ status, name, message, ...(details === undefined ? {} : { details }) });
}

async function collectProjectFiles(root, relative = "") {
  const excluded = new Set([".git", ".agent-io-safety", "node_modules", "vendor", "dist", "build", "coverage"]);
  const output = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    if (entry.isDirectory() && excluded.has(entry.name)) continue;
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) output.push(...(await collectProjectFiles(root, child)));
    else if (entry.isFile()) output.push(toPosix(child));
  }
  return output;
}

function externalCandidates(files, hasGit) {
  const lower = files.map((file) => file.toLowerCase());
  const any = (predicate) => lower.some(predicate);
  const tools = [];
  if (any((file) => /\.(?:sh|bash|zsh)$/u.test(file))) {
    tools.push(
      ["ShellCheck", "shellcheck", ["--version"], "https://github.com/koalaman/shellcheck"],
      ["shfmt", "shfmt", ["--version"], "https://github.com/mvdan/sh"],
    );
  }
  if (lower.includes(".editorconfig")) {
    tools.push(["editorconfig-checker", "editorconfig-checker", ["--version"], "https://github.com/editorconfig-checker/editorconfig-checker"]);
  }
  if (any((file) => /^\.github\/workflows\/.+\.ya?ml$/u.test(file))) {
    tools.push(
      ["actionlint", "actionlint", ["--version"], "https://github.com/rhysd/actionlint"],
      ["zizmor", "zizmor", ["--version"], "https://github.com/zizmorcore/zizmor"],
    );
  }
  if (lower.includes(".pre-commit-config.yaml") || lower.includes(".pre-commit-config.yml")) {
    tools.push(["pre-commit", "pre-commit", ["--version"], "https://pre-commit.com/"]);
  }
  if (hasGit) {
    tools.push(
      ["Gitleaks", "gitleaks", ["version"], "https://github.com/gitleaks/gitleaks"],
      ["TruffleHog", "trufflehog", ["--version"], "https://github.com/trufflesecurity/trufflehog"],
    );
  }
  if (any((file) => file.endsWith(".schema.json") || file.includes("/schemas/"))) {
    tools.push(
      ["Ajv", "ajv", ["--version"], "https://github.com/ajv-validator/ajv"],
      ["check-jsonschema", "check-jsonschema", ["--version"], "https://github.com/python-jsonschema/check-jsonschema"],
    );
  }
  return tools;
}

function firstLine(bytes) {
  return bytes.toString("utf8").split(/\r?\n/u).map((line) => line.trim()).find(Boolean) ?? "";
}

async function addExternalChecks(checks, targetRoot, runVersions) {
  const files = await collectProjectFiles(targetRoot);
  add(checks, "info", "external", `scanned ${files.length} project files; mode=${runVersions ? "execute" : "detect-only"}`);
  for (const [name, command, args, official] of externalCandidates(files, await exists(path.join(targetRoot, ".git")))) {
    const executable = await resolveExecutable(command);
    if (!executable) {
      add(checks, "warn", `external:${name}`, `${name} is not installed`, { official });
      continue;
    }
    if (!runVersions) {
      add(checks, "ok", `external:${name}`, `${name} detected at ${executable}`, { official, executed: false });
      continue;
    }
    try {
      const result = await runProcess(executable, args, {
        cwd: targetRoot, timeoutMs: 5_000, maxStdoutBytes: 256 * 1024, maxStderrBytes: 256 * 1024,
      });
      if (result.timedOut || result.limit || result.code !== 0 || result.signal) {
        add(checks, "warn", `external:${name}`, `${name} version check failed`, {
          official, timedOut: result.timedOut, limit: result.limit, code: result.code, signal: result.signal,
        });
      } else add(checks, "ok", `external:${name}`, `${name} available${firstLine(result.stdout) ? `: ${firstLine(result.stdout)}` : ""}`, { official, executed: true });
    } catch (error) {
      add(checks, "warn", `external:${name}`, `${name} could not be checked: ${error.message}`, { official });
    }
  }

  if (files.some((file) => /\.(?:ps1|psm1|psd1)$/iu.test(file))) {
    const host = (await resolveExecutable("pwsh")) ?? (await resolveExecutable("powershell"));
    if (!host) add(checks, "warn", "external:PSScriptAnalyzer", "no PowerShell host detected", { executed: false });
    else if (!runVersions) {
      add(checks, "info", "external:PSScriptAnalyzer", `PowerShell detected at ${host}; module availability was not executed`, { executed: false });
    } else {
      const script = "if (Get-Module -ListAvailable PSScriptAnalyzer) { (Get-Module -ListAvailable PSScriptAnalyzer | Select-Object -First 1).Version.ToString(); exit 0 } else { exit 1 }";
      try {
        const result = await runProcess(host, ["-NoProfile", "-Command", script], {
          cwd: targetRoot, timeoutMs: 5_000, maxStdoutBytes: 256 * 1024, maxStderrBytes: 256 * 1024,
        });
        add(checks, result.code === 0 ? "ok" : "warn", "external:PSScriptAnalyzer",
          result.code === 0 ? `PSScriptAnalyzer available: ${firstLine(result.stdout)}` : "PSScriptAnalyzer is not installed",
          { executed: true, timedOut: result.timedOut, limit: result.limit });
      } catch (error) {
        add(checks, "warn", "external:PSScriptAnalyzer", `PSScriptAnalyzer could not be checked: ${error.message}`, { executed: true });
      }
    }
  }
}

async function doctor(options) {
  const checks = [];
  const targetRoot = path.resolve(options.target);
  try {
    if (!(await stat(targetRoot)).isDirectory()) throw new Error("not a directory");
    add(checks, "ok", "target", targetRoot);
  } catch (error) {
    add(checks, "error", "target", `cannot use target: ${error.message}`);
    return checks;
  }
  add(checks, Number(process.versions.node.split(".")[0]) >= 18 ? "ok" : "error", "node", `Node.js ${process.versions.node}`);

  const entryPath = inside(targetRoot, options.entry, "entry");
  const destinationRoot = inside(targetRoot, options.dest, "destination");
  const manifestPath = path.join(destinationRoot, "MANIFEST.json");
  let manifest;
  try {
    manifest = validateManifest(JSON.parse(decodeUtf8(await readFile(manifestPath), "deployment manifest", { allowBom: false }).text));
    add(checks, "ok", "manifest", `${path.relative(targetRoot, manifestPath)} is valid (schema ${manifest.schemaVersion})`);
  } catch (error) {
    add(checks, "error", "manifest", error.code === "ENOENT" ? `${path.relative(targetRoot, manifestPath)} does not exist` : error.message);
  }

  const lang = options.lang === "auto" ? (manifest?.language ?? "en") : options.lang;
  const profile = options.profile === "auto" ? manifestProfile(manifest) : options.profile;
  if (manifest) {
    add(checks, manifest.language === lang ? "ok" : "error", "language", `installed=${manifest.language} expected=${lang}`);
    add(checks, manifestProfile(manifest) === profile ? "ok" : "error", "profile", `installed=${manifestProfile(manifest)} expected=${profile}`);
  }

  try {
    const entry = decodeUtf8(await readFile(entryPath), "entry file");
    const markers = analyzeManagedMarkers(entry.text);
    if (markers.errors.length > 0) add(checks, "error", "entry", markers.errors.join("; "));
    else if (!markers.present) add(checks, "error", "entry", "managed block is missing");
    else {
      const block = entry.text.slice(markers.begin, markers.end + END_MARKER.length);
      const blockHash = sha256(Buffer.from(normalizeLf(block).trimEnd(), "utf8"));
      if (manifest?.entry?.blockSha256) {
        add(checks, blockHash === manifest.entry.blockSha256 ? "ok" : "error", "entry", blockHash === manifest.entry.blockSha256 ? "managed block matches the manifest" : "managed block differs from the installed fragment");
      } else add(checks, "warn", "entry", "managed block is structurally valid, but no manifest block hash is available");

      if (manifest?.entry?.fragment === "default") {
        const expected = await renderManagedFragment({ targetRoot, entryPath, destinationRoot, lang });
        const expectedHash = sha256(Buffer.from(normalizeLf(expected).trimEnd(), "utf8"));
        if (blockHash !== expectedHash) add(checks, "error", "entry-source", "managed block differs from the current default fragment");
        else add(checks, "ok", "entry-source", "managed block matches the current default fragment");
      }
    }
    if (entry.hasBom) add(checks, "warn", "entry-text", `${path.relative(targetRoot, entryPath)} has UTF-8 BOM`);
    const eol = lineEndings(entry.text);
    if (eol.style === "mixed") add(checks, "warn", "entry-text", `${path.relative(targetRoot, entryPath)} has mixed line endings`, eol);
  } catch (error) {
    add(checks, "error", "entry", error.code === "ENOENT" ? `${path.relative(targetRoot, entryPath)} does not exist` : error.message);
  }

  const version = decodeUtf8(await readFile(path.join(PACKAGE_ROOT, "VERSION")), "VERSION", { allowBom: false }).text.trim();
  if (manifest) add(checks, manifest.packageVersion === version ? "ok" : "error", "version", `installed=${manifest.packageVersion} current=${version}`);

  if (manifest?.files) {
    const expected = new Map((await sourceArtifacts({ lang, profile })).map((item) => [item.destination, item.hash]));
    const installed = new Map(manifest.files.map((item) => [item.path, item.sha256]));
    let errors = 0;
    for (const [relative, hash] of expected) {
      const destination = inside(destinationRoot, relative, "artifact path");
      const current = (await exists(destination)) ? sha256(await readFile(destination)) : undefined;
      if (installed.get(relative) !== hash || current !== hash) {
        errors += 1;
        add(checks, "error", "managed-files", `missing or modified: ${relative}`);
      }
    }
    for (const relative of installed.keys()) {
      if (!expected.has(relative)) {
        errors += 1;
        add(checks, "error", "managed-files", `stale manifest entry: ${relative}`);
      }
    }
    if (errors === 0) add(checks, "ok", "managed-files", `all ${expected.size} managed files match`);
  }

  if (!options.skipText) {
    const inspect = path.join(PACKAGE_ROOT, "skills", "safe-text-io", "scripts", "inspect-text.mjs");
    const inspections = [];
    if (await exists(entryPath)) inspections.push(["--ps51-safe", "--", entryPath]);
    if (await exists(destinationRoot)) inspections.push(["--fail-on-bom", "--ps51-safe", "--", destinationRoot]);
    if (inspections.length > 0) {
      const results = [];
      for (const args of inspections) {
        results.push(await runProcess(process.execPath, [inspect, ...args], {
          cwd: targetRoot, timeoutMs: 30_000, maxStdoutBytes: 4 * 1024 * 1024, maxStderrBytes: 4 * 1024 * 1024,
        }));
      }
      const failed = results.some((result) => result.timedOut || result.limit || result.signal || result.code !== 0);
      add(checks, failed ? "error" : "ok", "text", failed ? "text inspection failed" : "installed text files are valid UTF-8", {
        stdout: results.map((result) => result.stdout.toString("utf8").trim()).filter(Boolean).join("\n"),
        stderr: results.map((result) => result.stderr.toString("utf8").trim()).filter(Boolean).join("\n"),
      });
    }
  }
  if (options.external) await addExternalChecks(checks, targetRoot, options.externalRun);
  return checks;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) usage();
  else {
    const checks = await doctor(options);
    if (options.json) process.stdout.write(`${JSON.stringify(checks, null, 2)}\n`);
    else {
      for (const check of checks) process.stdout.write(`${check.status.toUpperCase()} ${check.name}: ${check.message}\n`);
    }
    process.exitCode = checks.some((check) => check.status === "error") ? 1 : 0;
  }
} catch (error) {
  usage();
  process.stderr.write(`doctor: ${error.message}\n`);
  process.exitCode = 2;
}
