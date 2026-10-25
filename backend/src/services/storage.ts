import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import { v4 as uuid } from "uuid";

export const STORAGE_PATH = process.env.STORAGE_PATH || "/app/uploads";

export async function ensureStorage() {
  await fs.mkdir(path.join(STORAGE_PATH, "documents"), { recursive: true });
  await fs.mkdir(path.join(STORAGE_PATH, "audio"), { recursive: true });
  console.log(`Storage ready at: ${STORAGE_PATH}`);
}

/** Safe storage key: never uses the client filename as a path component. */
export function makeObjectName(folder: "documents" | "audio", originalName: string) {
  const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 8);
  return `${folder}/${uuid()}${ext}`;
}

function resolveKey(objectName: string) {
  const full = path.resolve(STORAGE_PATH, objectName);
  if (!full.startsWith(path.resolve(STORAGE_PATH) + path.sep)) throw new Error("Invalid storage key");
  return full;
}

export async function saveFile(objectName: string, buffer: Buffer) {
  const full = resolveKey(objectName);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buffer);
  return objectName;
}

export function getFileStream(objectName: string) {
  return createReadStream(resolveKey(objectName));
}

export async function clearStorage() {
  for (const folder of ["documents", "audio"]) {
    const dir = path.join(STORAGE_PATH, folder);
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
  }
}
