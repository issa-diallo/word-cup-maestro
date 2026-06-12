import { hashText, writeJson, OUTPUT_DIR } from "./files";
import { getEnv, type PipelineMode } from "./env";
import path from "node:path";
import type { ViralShort } from "./shorts";
import type { PublishResult, UploadResult } from "./types";

export type PublishPayload = {
  video_url: string;
  title: string;
  description: string;
  hashtags: string[];
  platforms: string[];
  request_id: string;
};

export function buildPublishPayload(short: ViralShort, upload: UploadResult, platforms = ["instagram", "youtube"]) {
  if (!upload.publicUrl) throw new Error("video_url manquante.");
  const requestId = hashText(`${upload.publicUrl}:${short.title}:${platforms.join(",")}`, 20);
  return {
    video_url: upload.publicUrl,
    title: short.title,
    description: `${short.description}\n\n${short.hashtags.join(" ")}`,
    hashtags: short.hashtags,
    platforms,
    request_id: requestId
  } satisfies PublishPayload;
}

export async function publishViaN8n(
  short: ViralShort,
  upload: UploadResult,
  options: { mode: PipelineMode; outputDir?: string; platforms?: string[] } = { mode: "dry-run" }
): Promise<PublishResult> {
  try {
    const payload = buildPublishPayload(short, upload, options.platforms);
    const responsePath = path.join(options.outputDir ?? OUTPUT_DIR, "publishing", `${payload.request_id}.json`);

    if (options.mode !== "real") {
      await writeJson(responsePath, { status: "dry-run", payload });
      return { shortId: short.id, status: "dry-run", requestId: payload.request_id, response: { path: responsePath } };
    }

    const webhookUrl = getEnv("N8N_WEBHOOK_URL");
    if (!webhookUrl) throw new Error("N8N_WEBHOOK_URL absent.");

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": payload.request_id
      },
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    const body = text ? tryParseJson(text) : null;
    await writeJson(responsePath, {
      status: response.status,
      request_id: payload.request_id,
      response: body ?? text
    });

    if (!response.ok) throw new Error(`n8n a retourne ${response.status}.`);
    return { shortId: short.id, status: "published", requestId: payload.request_id, response: body ?? text };
  } catch (error) {
    return {
      shortId: short.id,
      status: "failed",
      requestId: hashText(`${short.id}:failed`, 20),
      error: error instanceof Error ? error.message : "Publication n8n impossible."
    };
  }
}

function tryParseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
