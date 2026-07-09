import { AwsClient } from "aws4fetch";
import { env } from "../../env";

// aws4fetch signs with WebCrypto — tiny and Bun-native. Path-style URLs work
// for MinIO, Cloudflare R2 and AWS S3 alike.
const client = new AwsClient({
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  region: env.S3_REGION,
  service: "s3",
});

const PUT_EXPIRES_SECONDS = 900;
const GET_EXPIRES_SECONDS = 120;

export function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.-]+/g, "_").slice(0, 120);
}

export function buildStorageKey(companyId: string, fileName: string): string {
  // Non-guessable, non-sequential keys (US-503)
  return `${companyId}/${crypto.randomUUID()}/${sanitizeFileName(fileName)}`;
}

function objectUrl(key: string): URL {
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return new URL(`${env.S3_ENDPOINT}/${env.S3_BUCKET}/${encoded}`);
}

export async function presignUpload(
  key: string,
  contentType: string,
): Promise<{ url: string; headers: Record<string, string>; expiresIn: number }> {
  const url = objectUrl(key);
  url.searchParams.set("X-Amz-Expires", String(PUT_EXPIRES_SECONDS));
  const signed = await client.sign(
    new Request(url, { method: "PUT", headers: { "Content-Type": contentType } }),
    { aws: { signQuery: true } },
  );
  return {
    url: signed.url,
    headers: { "Content-Type": contentType },
    expiresIn: PUT_EXPIRES_SECONDS,
  };
}

export async function presignDownload(
  key: string,
  fileName: string,
): Promise<{ url: string; expiresIn: number }> {
  const url = objectUrl(key);
  url.searchParams.set("X-Amz-Expires", String(GET_EXPIRES_SECONDS));
  url.searchParams.set(
    "response-content-disposition",
    `attachment; filename="${sanitizeFileName(fileName)}"`,
  );
  const signed = await client.sign(new Request(url, { method: "GET" }), {
    aws: { signQuery: true },
  });
  return { url: signed.url, expiresIn: GET_EXPIRES_SECONDS };
}
