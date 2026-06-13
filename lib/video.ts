import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureDir, fileExists, hashText, OUTPUT_DIR, slugify } from "./files";
import { getFfmpegPath } from "./ffmpeg";
import { createKlingTextToVideoTask, pollKlingTask, shouldUseKling } from "./kling";
import type { PipelineMode } from "./env";
import type { ViralShort } from "./shorts";
import type { VideoGenerationResult } from "./types";

function runFfmpeg(args: string[]) {
  const binary = getFfmpegPath();

  return new Promise<void>((resolve, reject) => {
    const child = spawn(binary, args);
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(-800) || `ffmpeg a echoue avec le code ${code}.`));
    });
  });
}

async function createMockClip(short: ViralShort, filePath: string) {
  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x11110f:s=1080x1920:d=5:r=30",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=420:sample_rate=44100:d=5",
    "-vf",
    "drawbox=x=0:y=0:w=iw:h=ih:color=0x0e8f68@0.18:t=fill,drawbox=x=70:y=180:w=940:h=180:color=0xff3d00@0.82:t=fill,drawbox=x=70:y=1420:w=940:h=260:color=black@0.62:t=fill",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    filePath,
  ]);
}

async function downloadClip(url: string, filePath: string) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Telechargement du clip Kling impossible (${response.status}).`);
  await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
}

export async function generateVideoClip(
  short: ViralShort,
  options: { mode: PipelineMode; outputDir?: string } = { mode: "dry-run" },
): Promise<VideoGenerationResult> {
  const outputDir = await ensureDir(path.join(options.outputDir ?? OUTPUT_DIR, "clips"));
  const fileName = `${short.id}-${slugify(short.title)}-${hashText(short.videoPrompt, 8)}.mp4`;
  const filePath = path.join(outputDir, fileName);

  if (await fileExists(filePath)) {
    return {
      shortId: short.id,
      provider: "mock",
      prompt: short.videoPrompt,
      jobId: hashText(filePath),
      status: "completed",
      path: filePath,
    };
  }

  try {
    if (shouldUseKling(options.mode)) {
      const created = await createKlingTextToVideoTask(short.videoPrompt);
      const finished = await pollKlingTask(created.jobId, 48);
      if (finished.status === "completed" && finished.url) {
        await downloadClip(finished.url, filePath);
      }
      return {
        shortId: short.id,
        provider: "kling",
        prompt: short.videoPrompt,
        jobId: finished.jobId,
        status: finished.status,
        url: finished.url,
        path: finished.status === "completed" ? filePath : undefined,
      };
    }

    await createMockClip(short, filePath);
    return {
      shortId: short.id,
      provider: "mock",
      prompt: short.videoPrompt,
      jobId: `mock-${hashText(short.videoPrompt)}`,
      status: "completed",
      path: filePath,
    };
  } catch (error) {
    return {
      shortId: short.id,
      provider: shouldUseKling(options.mode) ? "kling" : "mock",
      prompt: short.videoPrompt,
      jobId: `failed-${hashText(short.videoPrompt)}`,
      status: "failed",
      error: error instanceof Error ? error.message : "Generation video impossible.",
    };
  }
}
