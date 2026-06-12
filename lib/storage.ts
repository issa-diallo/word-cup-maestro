import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { datePath, slugify } from "./files";
import { getEnv, type PipelineMode } from "./env";
import type { RenderResult, UploadResult } from "./types";

function publicUrlForKey(key: string) {
  const base = getEnv("CLOUDFLARE_R2_PUBLIC_URL");
  return base ? `${base.replace(/\/+$/, "")}/${key}` : undefined;
}

function objectKey(shortId: string, title: string) {
  return `videos/${datePath()}/${shortId}-${slugify(title)}.mp4`;
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function sha256Hex(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function signingKey(secretAccessKey: string, date: string) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, date);
  const regionKey = hmac(dateKey, "auto");
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

async function putObjectToR2(params: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  key: string;
  body: Buffer;
}) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const shortDate = amzDate.slice(0, 8);
  const host = `${params.accountId}.r2.cloudflarestorage.com`;
  const path = `/${params.bucket}/${params.key.split("/").map(encodeURIComponent).join("/")}`;
  const payloadHash = sha256Hex(params.body);
  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`
  ].join("\n");
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    "PUT",
    path,
    "",
    `${canonicalHeaders}\n`,
    signedHeaders,
    payloadHash
  ].join("\n");
  const credentialScope = `${shortDate}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const signature = createHmac("sha256", signingKey(params.secretAccessKey, shortDate))
    .update(stringToSign)
    .digest("hex");
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${params.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`
  ].join(", ");

  const response = await fetch(`https://${host}${path}`, {
    method: "PUT",
    headers: {
      Authorization: authorization,
      "Content-Type": "video/mp4",
      "Content-Length": String(params.body.length),
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate
    },
    body: new Uint8Array(params.body)
  });

  if (!response.ok) throw new Error(`R2 a refuse l'upload (${response.status}).`);
}

export async function uploadRenderToR2(
  render: RenderResult,
  metadata: { shortId: string; title: string },
  options: { mode: PipelineMode } = { mode: "dry-run" }
): Promise<UploadResult> {
  const key = objectKey(metadata.shortId, metadata.title);
  const publicUrl = publicUrlForKey(key);

  if (!render.path || render.status !== "completed") {
    return { shortId: metadata.shortId, status: "failed", objectKey: key, error: "MP4 final absent." };
  }

  if (options.mode !== "real") {
    return { shortId: metadata.shortId, status: "dry-run", objectKey: key, publicUrl };
  }

  const accountId = getEnv("CLOUDFLARE_R2_ACCOUNT_ID");
  const accessKeyId = getEnv("CLOUDFLARE_R2_ACCESS_KEY_ID");
  const secretAccessKey = getEnv("CLOUDFLARE_R2_SECRET_ACCESS_KEY");
  const bucket = getEnv("CLOUDFLARE_R2_BUCKET");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    return { shortId: metadata.shortId, status: "failed", objectKey: key, error: "Configuration R2 incomplete." };
  }

  try {
    await putObjectToR2({
      accountId,
      accessKeyId,
      secretAccessKey,
      bucket,
      key,
      body: await readFile(render.path)
    });

    const head = await fetch(publicUrl, { method: "HEAD" });
    if (!head.ok) throw new Error(`URL publique R2 non verifiee (${head.status}).`);

    return { shortId: metadata.shortId, status: "uploaded", objectKey: key, publicUrl };
  } catch (error) {
    return {
      shortId: metadata.shortId,
      status: "failed",
      objectKey: key,
      publicUrl,
      error: error instanceof Error ? error.message : "Upload R2 impossible."
    };
  }
}
