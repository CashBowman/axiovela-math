import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { projectFile } from "./axiovela/assistant-api.mjs";
export function imageType(bytes) {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpeg";
  if (
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WEBP"
  )
    return "webp";
  throw Error("Use a PNG, JPEG or WebP image.");
}
export async function saveImage(root, bytes) {
  const type = imageType(bytes),
    relative = `assets/${randomUUID()}.${type}`;
  const file = await projectFile(root, "writeups/" + relative, true);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes, { flag: "wx" });
  return relative;
}
export async function readImage(root, relative) {
  if (
    typeof relative !== "string" ||
    !relative.startsWith("assets/") ||
    relative.includes("..")
  )
    throw Error("Invalid manuscript image.");
  const file = await projectFile(root, "writeups/" + relative);
  if ((await fs.stat(file)).size > 24 * 1024 * 1024)
    throw Error("Image exceeds 24 MB.");
  const bytes = await fs.readFile(file);
  return { bytes, type: imageType(bytes) };
}
export async function copyLatexImages(root, source, destination) {
  const names = [
    ...new Set(
      [
        ...source.matchAll(
          /\\includegraphics(?:\[[^\]]*\])?\{(assets\/[^{}]+)\}/g,
        ),
      ].map((m) => m[1]),
    ),
  ];
  if (names.length > 50)
    throw Error("Too many manuscript images in one render.");
  for (const name of names) {
    const { bytes } = await readImage(root, name);
    const target = path.join(destination, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
  }
}
