import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function withTemp(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-io-safety-tests-"));
  try {
    return await callback(root);
  } finally {
    const systemTemp = path.resolve(os.tmpdir());
    const resolved = path.resolve(root);
    const relative = path.relative(systemTemp, resolved);
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "unsafe temp cleanup");
    assert.match(path.basename(resolved), /^agent-io-safety-tests-/, "unexpected temp cleanup target");
    await rm(resolved, { recursive: true, force: true });
  }
}
