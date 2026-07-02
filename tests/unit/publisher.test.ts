import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPublishPayload, publishViaN8n } from "../../lib/publisher";
import type { ViralShort } from "../../lib/shorts";
import type { UploadResult } from "../../lib/types";

const short: ViralShort = {
  id: "short-1",
  angle: "Angle",
  hook: "Hook",
  script: "Script",
  videoPrompt: "Prompt",
  title: "Titre test",
  description: "Description test",
  hashtags: ["#foot", "#worldcup"],
};

const upload: UploadResult = {
  shortId: "short-1",
  status: "uploaded",
  objectKey: "videos/test.mp4",
  publicUrl: "https://cdn.example.com/videos/test.mp4",
};

let tempDir: string;
const originalWebhook = process.env.N8N_WEBHOOK_URL;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "publisher-unit-"));
  delete process.env.N8N_WEBHOOK_URL;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(tempDir, { recursive: true, force: true });
  if (originalWebhook === undefined) delete process.env.N8N_WEBHOOK_URL;
  else process.env.N8N_WEBHOOK_URL = originalWebhook;
});

describe("publisher", () => {
  it("builds deterministic n8n payloads", () => {
    const payload = buildPublishPayload(short, upload, ["youtube"]);

    expect(payload).toMatchObject({
      video_url: upload.publicUrl,
      title: short.title,
      description: "Description test\n\n#foot #worldcup",
      hashtags: short.hashtags,
      platforms: ["youtube"],
    });
    expect(payload.request_id).toHaveLength(20);
    expect(buildPublishPayload(short, upload, ["youtube"]).request_id).toBe(payload.request_id);
    expect(() => buildPublishPayload(short, { ...upload, publicUrl: undefined })).toThrow(
      "video_url manquante.",
    );
  });

  it("writes a dry-run publishing payload", async () => {
    const result = await publishViaN8n(short, upload, { mode: "dry-run", outputDir: tempDir });

    expect(result.status).toBe("dry-run");
    expect(result.requestId).toHaveLength(20);
    const responsePath = (result.response as { path: string }).path;
    const stored = JSON.parse(await readFile(responsePath, "utf8"));
    expect(stored.status).toBe("dry-run");
    expect(stored.payload.video_url).toBe(upload.publicUrl);
  });

  it("returns failed when real mode has no webhook", async () => {
    const result = await publishViaN8n(short, upload, { mode: "real", outputDir: tempDir });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("N8N_WEBHOOK_URL absent.");
  });

  it("publishes to n8n in real mode and parses JSON responses", async () => {
    process.env.N8N_WEBHOOK_URL = "https://n8n.example.com/webhook";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const result = await publishViaN8n(short, upload, { mode: "real", outputDir: tempDir });

    expect(result.status).toBe("published");
    expect(result.response).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://n8n.example.com/webhook",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
  });

  it("stores non-JSON n8n failures without throwing secrets", async () => {
    process.env.N8N_WEBHOOK_URL = "https://n8n.example.com/webhook";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 502 }));

    const result = await publishViaN8n(short, upload, { mode: "real", outputDir: tempDir });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("n8n a retourne 502.");
  });
});
