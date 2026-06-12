import { createHmac, randomUUID } from "node:crypto";
import type { PipelineMode } from "./env";
import { getEnv } from "./env";

export type KlingTask = {
  jobId: string;
  status: "submitted" | "processing" | "completed" | "failed";
  url?: string;
  raw?: unknown;
};

function base64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createKlingJwt(accessKey: string, secretKey: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 }));
  const signature = base64url(
    createHmac("sha256", secretKey).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

function getKlingAuthHeader() {
  const accessKey = getEnv("KLING_API_KEY_access_token");
  const secretKey = getEnv("KLING_API_KEY_secret_key");
  if (!accessKey || !secretKey) throw new Error("Identifiants Kling absents.");
  return `Bearer ${createKlingJwt(accessKey, secretKey)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  const child = isRecord(value) ? value[key] : undefined;
  return isRecord(child) ? child : undefined;
}

function readString(value: unknown, key: string): string | undefined {
  const child = isRecord(value) ? value[key] : undefined;
  return typeof child === "string" ? child : undefined;
}

function parseKlingTask(data: unknown): KlingTask {
  const payload = readRecord(data, "data") ?? data;
  const taskResult = readRecord(payload, "task_result");
  const videos = (taskResult?.videos ?? (isRecord(payload) ? payload.videos : undefined)) || [];
  const firstVideo = Array.isArray(videos) ? videos[0] : videos;
  const taskStatus = String(
    readString(payload, "task_status") ?? readString(payload, "status") ?? "",
  ).toLowerCase();
  const status =
    taskStatus.includes("succeed") || taskStatus.includes("complete")
      ? "completed"
      : taskStatus.includes("fail")
        ? "failed"
        : taskStatus.includes("process")
          ? "processing"
          : "submitted";

  return {
    jobId: readString(payload, "task_id") ?? readString(payload, "id") ?? randomUUID(),
    status,
    url:
      readString(firstVideo, "url") ??
      readString(firstVideo, "video_url") ??
      readString(payload, "url"),
    raw: data,
  };
}

export async function createKlingTextToVideoTask(prompt: string): Promise<KlingTask> {
  const response = await fetch("https://api.klingai.com/v1/videos/text2video", {
    method: "POST",
    headers: {
      Authorization: getKlingAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_name: getEnv("KLING_MODEL_NAME") ?? "kling-v2-1-master",
      prompt: prompt.slice(0, 2500),
      cfg_scale: 0.5,
      mode: "std",
      duration: "5",
      aspect_ratio: "9:16",
    }),
  });

  if (!response.ok) throw new Error(`Kling create task a echoue (${response.status}).`);
  return parseKlingTask(await response.json());
}

export async function pollKlingTask(jobId: string, maxAttempts = 24): Promise<KlingTask> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(`https://api.klingai.com/v1/videos/text2video/${jobId}`, {
      headers: { Authorization: getKlingAuthHeader() },
    });

    if (!response.ok) throw new Error(`Kling poll a echoue (${response.status}).`);
    const task = parseKlingTask(await response.json());
    if (task.status === "completed" || task.status === "failed") return task;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  return { jobId, status: "processing" };
}

export function shouldUseKling(mode: PipelineMode) {
  return (
    mode === "real" &&
    Boolean(getEnv("KLING_API_KEY_access_token") && getEnv("KLING_API_KEY_secret_key"))
  );
}
