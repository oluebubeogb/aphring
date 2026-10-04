import * as Minio from "minio";

const endpoint = process.env.MINIO_ENDPOINT || "localhost";
const port = parseInt(process.env.MINIO_PORT || "9000", 10);
const useSSL = process.env.MINIO_USE_SSL === "true";

export const minioClient = new Minio.Client({
  endPoint: endpoint,
  port,
  useSSL,
  accessKey: process.env.MINIO_ACCESS_KEY || "aphring",
  secretKey: process.env.MINIO_SECRET_KEY || "aphring_minio_secret",
});

const BUCKET = process.env.MINIO_BUCKET || "aphring-documents";

export async function ensureBucket() {
  const exists = await minioClient.bucketExists(BUCKET);
  if (!exists) {
    await minioClient.makeBucket(BUCKET, "us-east-1");
    console.log(`Created MinIO bucket: ${BUCKET}`);
  }
}

export async function uploadFile(
  objectName: string,
  buffer: Buffer,
  mimeType: string
) {
  await minioClient.putObject(BUCKET, objectName, buffer, buffer.length, {
    "Content-Type": mimeType,
  });
  return objectName;
}

export async function getFileStream(objectName: string) {
  return minioClient.getObject(BUCKET, objectName);
}

export { BUCKET };
