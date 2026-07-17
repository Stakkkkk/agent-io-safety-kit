import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function isUtf8Bom(bytes) {
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

export function isUtf16Bom(bytes) {
  return bytes.length >= 2 &&
    ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff));
}

export function decodeUtf8(bytes, label, { allowBom = true } = {}) {
  const hasBom = isUtf8Bom(bytes);
  if (hasBom && !allowBom) throw new Error(`${label} must be UTF-8 without BOM`);
  if (isUtf16Bom(bytes)) throw new Error(`${label} is UTF-16`);

  const content = hasBom ? bytes.subarray(3) : bytes;
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(content), hasBom };
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8: ${error.message}`);
  }
}

export function decodeUtf8Text(bytes, label, options) {
  return decodeUtf8(bytes, label, options).text;
}

export function lineEndings(text) {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const remainder = text.replace(/\r\n/g, "");
  const lf = (remainder.match(/\n/g) ?? []).length;
  const cr = (remainder.match(/\r/g) ?? []).length;
  const kinds = [["crlf", crlf], ["lf", lf], ["cr", cr]].filter(([, count]) => count > 0);
  return { crlf, lf, cr, style: kinds.length === 0 ? "none" : kinds.length === 1 ? kinds[0][0] : "mixed" };
}

export function detectPreferredEol(text) {
  const endings = lineEndings(text);
  return endings.crlf > endings.lf ? "\r\n" : "\n";
}

export function normalizeLf(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function atomicWriteFile(filePath, bytes, { preserveMode = true } = {}) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });

  let existingMode;
  if (preserveMode) {
    try {
      existingMode = (await stat(filePath)).mode;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.agent-io-${process.pid}-${randomBytes(6).toString("hex")}.tmp`,
  );
  let handle;
  try {
    handle = await open(temporaryPath, "wx");
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    if (existingMode !== undefined) await chmod(temporaryPath, existingMode);
    await rename(temporaryPath, filePath);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}
