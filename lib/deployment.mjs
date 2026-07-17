import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeUtf8, detectPreferredEol, exists, normalizeLf, sha256 } from "./text.mjs";

export const BEGIN_MARKER = "<!-- agent-io-safety:begin -->";
export const END_MARKER = "<!-- agent-io-safety:end -->";
export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function toPosix(value) {
  return value.split(path.sep).join("/");
}

export function inside(root, candidate, label) {
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return absolute;
  throw new Error(`${label} must stay inside target root`);
}

export function isInsidePath(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export async function assertNoSymlinkPath(root, candidate, label) {
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
      if (metadata.isSymbolicLink()) throw new Error(`${label} contains symlink: ${path.relative(root, current)}`);
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
  }
}

export async function collectFiles(root, relative = "") {
  const directory = path.join(root, relative);
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const childRelative = path.join(relative, entry.name);
    if (entry.isDirectory()) output.push(...(await collectFiles(root, childRelative)));
    else if (entry.isFile()) output.push(childRelative);
  }
  return output;
}

async function localizedSource(canonicalPath, lang) {
  if (lang !== "ru" || !canonicalPath.endsWith(".md")) return canonicalPath;
  const localizedPath = canonicalPath.replace(/\.md$/u, ".ru.md");
  return (await exists(localizedPath)) ? localizedPath : canonicalPath;
}

function includeDoc(relative, lang, profile) {
  const normalized = toPosix(relative);
  if (profile === "full") return true;
  return lang === "ru" ? normalized.startsWith("ru/") : !normalized.startsWith("ru/");
}

export async function sourceArtifacts({ lang = "en", profile = "core" } = {}) {
  if (!new Set(["en", "ru"]).has(lang)) throw new Error("language must be en or ru");
  if (!new Set(["core", "full"]).has(profile)) throw new Error("profile must be core or full");

  const mappings = [
    { source: path.join(PACKAGE_ROOT, "VERSION"), destination: "VERSION" },
    { source: await localizedSource(path.join(PACKAGE_ROOT, "RULE.md"), lang), destination: "RULE.md" },
  ];

  for (const relative of await collectFiles(path.join(PACKAGE_ROOT, "lib"))) {
    mappings.push({ source: path.join(PACKAGE_ROOT, "lib", relative), destination: path.join("lib", relative) });
  }

  for (const relative of await collectFiles(path.join(PACKAGE_ROOT, "docs"))) {
    if (!includeDoc(relative, lang, profile)) continue;
    mappings.push({ source: path.join(PACKAGE_ROOT, "docs", relative), destination: path.join("docs", relative) });
  }

  if (profile === "full") {
    for (const relative of await collectFiles(path.join(PACKAGE_ROOT, "examples"))) {
      mappings.push({ source: path.join(PACKAGE_ROOT, "examples", relative), destination: path.join("examples", relative) });
    }
  }

  const skillsRoot = path.join(PACKAGE_ROOT, "skills");
  for (const relative of await collectFiles(skillsRoot)) {
    if (relative.endsWith(".ru.md")) continue;
    const canonicalPath = path.join(skillsRoot, relative);
    mappings.push({
      source: await localizedSource(canonicalPath, lang),
      destination: path.join("skills", relative),
    });
  }

  const artifacts = [];
  for (const mapping of mappings) {
    const bytes = await readFile(mapping.source);
    artifacts.push({ ...mapping, bytes, hash: sha256(bytes), destination: toPosix(mapping.destination) });
  }
  return artifacts.sort((left, right) => left.destination.localeCompare(right.destination));
}

export function validateManifest(manifest) {
  if (!manifest || !new Set([1, 2]).has(manifest.schemaVersion) || !Array.isArray(manifest.files)) {
    throw new Error("deployment manifest has invalid structure");
  }
  if (!new Set(["en", "ru"]).has(manifest.language ?? "en")) throw new Error("deployment manifest has invalid language");
  if (typeof manifest.packageVersion !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(manifest.packageVersion)) {
    throw new Error("deployment manifest has invalid package version");
  }
  if (manifest.schemaVersion >= 2 && !new Set(["core", "full"]).has(manifest.profile)) {
    throw new Error("deployment manifest has invalid profile");
  }
  const paths = new Set();
  for (const [index, item] of manifest.files.entries()) {
    if (!item || typeof item.path !== "string" || !/^[a-f0-9]{64}$/u.test(item.sha256 ?? "")) {
      throw new Error(`deployment manifest file ${index} is invalid`);
    }
    const portable = item.path.replaceAll("\\", "/");
    const segments = portable.split("/");
    if (portable !== item.path || portable.startsWith("/") || /^[A-Za-z]:\//u.test(portable) ||
        segments.some((segment) => segment === "" || segment === "." || segment === ".." || segment.includes("\0"))) {
      throw new Error(`deployment manifest file ${index} escapes the destination`);
    }
    if (paths.has(portable)) throw new Error(`deployment manifest contains duplicate path: ${portable}`);
    paths.add(portable);
  }
  if (manifest.entry !== undefined) {
    if (!manifest.entry || !/^[a-f0-9]{64}$/u.test(manifest.entry.blockSha256 ?? "") ||
        !new Set(["default", "custom"]).has(manifest.entry.fragment)) {
      throw new Error("deployment manifest has invalid entry metadata");
    }
  }
  return manifest;
}

export function manifestProfile(manifest) {
  return manifest?.schemaVersion === 1 ? "full" : manifest?.profile ?? "core";
}

export function analyzeManagedMarkers(text) {
  const begin = text.indexOf(BEGIN_MARKER);
  const end = text.indexOf(END_MARKER);
  const errors = [];
  if ((begin === -1) !== (end === -1)) errors.push("entry file contains only one managed marker");
  if (begin !== -1 && end < begin) errors.push("managed end marker appears before begin marker");
  if (begin !== -1 && text.indexOf(BEGIN_MARKER, begin + 1) !== -1) errors.push("entry file contains duplicate begin markers");
  if (end !== -1 && text.indexOf(END_MARKER, end + 1) !== -1) errors.push("entry file contains duplicate end markers");
  if (begin !== -1 && !((begin === 0 || text[begin - 1] === "\n") &&
      (begin + BEGIN_MARKER.length === text.length || new Set(["\r", "\n"]).has(text[begin + BEGIN_MARKER.length])))) {
    errors.push("managed begin marker must be on its own line");
  }
  if (end !== -1 && !((end === 0 || text[end - 1] === "\n") &&
      (end + END_MARKER.length === text.length || new Set(["\r", "\n"]).has(text[end + END_MARKER.length])))) {
    errors.push("managed end marker must be on its own line");
  }
  return { begin, end, present: begin !== -1 && end !== -1, errors };
}

export function updateManagedEntry(existingText, fragmentLf, eol) {
  const markers = analyzeManagedMarkers(existingText);
  if (markers.errors.length > 0) throw new Error(markers.errors[0]);

  const fragment = normalizeLf(fragmentLf).trimEnd().replace(/\n/g, eol);
  if (markers.present) {
    return existingText.slice(0, markers.begin) + fragment + existingText.slice(markers.end + END_MARKER.length);
  }

  const trimmed = existingText.replace(/[\r\n]*$/u, "");
  return trimmed.length === 0 ? `${fragment}${eol}` : `${trimmed}${eol}${eol}${fragment}${eol}`;
}

export function removeManagedEntry(existingText) {
  const markers = analyzeManagedMarkers(existingText);
  if (markers.errors.length > 0) throw new Error(markers.errors[0]);
  if (!markers.present) throw new Error("entry file does not contain a managed block");

  const before = existingText.slice(0, markers.begin).replace(/[\t ]*(?:\r?\n){0,2}$/u, "");
  const after = existingText.slice(markers.end + END_MARKER.length).replace(/^(?:\r?\n){0,2}/u, "");
  if (!before && !after) return "";
  if (!before) return after;
  if (!after) return `${before}${detectPreferredEol(existingText)}`;
  const eol = detectPreferredEol(existingText);
  return `${before}${eol}${eol}${after}`;
}

export async function renderManagedFragment({ targetRoot, entryPath, destinationRoot, lang, fragment }) {
  const fragmentPath = fragment
    ? path.resolve(fragment)
    : path.join(PACKAGE_ROOT, "snippets", lang === "ru" ? "ru" : "", "AGENTS.md.fragment");
  const template = decodeUtf8(await readFile(fragmentPath), "entry fragment", { allowBom: false }).text;
  const ruleRelative = toPosix(path.relative(path.dirname(entryPath), path.join(destinationRoot, "RULE.md")));
  const ruleLink = ruleRelative.startsWith(".") ? ruleRelative : `./${ruleRelative}`;
  const ruleFileRelative = toPosix(path.relative(targetRoot, path.join(destinationRoot, "RULE.md")));
  const ruleFilePath = ruleFileRelative.startsWith(".") ? ruleFileRelative : `./${ruleFileRelative}`;
  const readTextRelative = toPosix(
    path.relative(targetRoot, path.join(destinationRoot, "skills", "safe-text-io", "scripts", "read-text.mjs")),
  );
  const readTextPath = readTextRelative.startsWith(".") ? readTextRelative : `./${readTextRelative}`;
  const rendered = template
    .replaceAll("{{RULE_PATH}}", ruleLink)
    .replaceAll("{{RULE_FILE_PATH}}", ruleFilePath)
    .replaceAll("{{READ_TEXT_PATH}}", readTextPath);
  const normalized = normalizeLf(rendered).trim();
  const markers = analyzeManagedMarkers(normalized);
  if (markers.errors.length > 0 || !markers.present || !normalized.startsWith(BEGIN_MARKER) || !normalized.endsWith(END_MARKER)) {
    throw new Error("entry fragment must be exactly one managed block with begin/end markers");
  }
  return rendered;
}
