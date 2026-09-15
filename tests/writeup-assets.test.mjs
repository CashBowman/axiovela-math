import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  saveImage,
  readImage,
  copyLatexImages,
} from "../server/writeup-assets.mjs";
test("manuscript images survive reload and are copied into isolated LaTeX renders", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "math-images-"));
  try {
    const bytes = await fs.readFile(
      new URL("../public/workbench-mark.png", import.meta.url),
    );
    const name = await saveImage(root, bytes);
    assert.deepEqual((await readImage(root, name)).bytes, bytes);
    const out = path.join(root, "exports/test");
    await fs.mkdir(out, { recursive: true });
    await copyLatexImages(root, `\\includegraphics[width=2cm]{${name}}`, out);
    assert.deepEqual(await fs.readFile(path.join(out, name)), bytes);
    await assert.rejects(
      readImage(root, "assets/../../secret"),
      /Invalid manuscript/,
    );
    await assert.rejects(saveImage(root, Buffer.from("<svg/>")), /PNG/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
