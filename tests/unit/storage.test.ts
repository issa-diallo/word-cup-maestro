import { afterEach, describe, expect, it } from "vitest";
import { uploadRenderToR2 } from "../../lib/storage";
import type { RenderResult } from "../../lib/types";

const render: RenderResult = {
  shortId: "clip-1",
  status: "completed",
  path: "/tmp/final.mp4",
  width: 1080,
  height: 1920,
  hasAudio: true,
};

const touched = new Set<string>();
function setEnv(name: string, value: string | undefined) {
  touched.add(name);
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  for (const key of touched) delete process.env[key];
  touched.clear();
});

describe("uploadRenderToR2", () => {
  it("returns a dry-run object key and public URL without touching the file", async () => {
    setEnv("CLOUDFLARE_R2_PUBLIC_URL", "https://cdn.example.com/base/");

    const result = await uploadRenderToR2(render, { shortId: "clip-1", title: "But Décisif!" });

    expect(result.status).toBe("dry-run");
    expect(result.objectKey).toMatch(/^videos\/\d{4}-\d{2}-\d{2}\/clip-1-but-decisif\.mp4$/);
    expect(result.publicUrl).toMatch(
      /^https:\/\/cdn\.example\.com\/base\/videos\/\d{4}-\d{2}-\d{2}\/clip-1-but-decisif\.mp4$/,
    );
  });

  it("fails clearly when the render is missing", async () => {
    const result = await uploadRenderToR2(
      { ...render, status: "failed", path: undefined },
      { shortId: "clip-1", title: "Clip" },
      { mode: "dry-run" },
    );

    expect(result).toEqual({
      shortId: "clip-1",
      status: "failed",
      objectKey: expect.stringMatching(/^videos\/\d{4}-\d{2}-\d{2}\/clip-1-clip\.mp4$/),
      error: "MP4 final absent.",
    });
  });

  it("fails real uploads before network calls when configuration is incomplete", async () => {
    setEnv("CLOUDFLARE_R2_PUBLIC_URL", "https://cdn.example.com");

    const result = await uploadRenderToR2(
      render,
      { shortId: "clip-1", title: "Clip" },
      { mode: "real" },
    );

    expect(result.status).toBe("failed");
    expect(result.error).toBe("Configuration R2 incomplete.");
  });
});
