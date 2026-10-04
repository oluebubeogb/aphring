import fs from "fs/promises";
import path from "path";

const STORAGE_PATH = process.env.STORAGE_PATH || "/app/uploads";

export async function ensureBucket() {
  await fs.mkdir(STORAGE_PATH, { recursive: true });
  await fs.mkdir(path.join(STORAGE_PATH, "documents"), { recursive: true });
  console.log(`Storage ready at: ${STORAGE_PATH}`);
}

export async function uploadFile(
  objectName: string,
  buffer: Buffer,
  _mimeType: string
) {
  const fullPath = path.join(STORAGE_PATH, objectName);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, buffer);
  return objectName;
}

export async function getFileStream(objectName: string) {
  const fullPath = path.join(STORAGE_PATH, objectName);
  const { createReadStream } = await import("fs");
  return createReadStream(fullPath);
}

export const BUCKET = "local";
