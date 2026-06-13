import { spawn } from "node:child_process";
import path from "node:path";
import { getFfmpegPath } from "./ffmpeg";
import { ensureDir, fileExists } from "./files";
import type { ViralClipSegment } from "./segments";

export type ClipFileResult = {
  segmentId: string;
  status: "completed" | "failed";
  path?: string;
  error?: string;
};

export async function cutSegment(
  sourcePath: string,
  segment: ViralClipSegment,
  outputDir: string,
): Promise<ClipFileResult> {
  const rawDir = await ensureDir(path.join(outputDir, "clips", "raw"));
  const outputPath = path.join(rawDir, `${segment.id}.mp4`);
  const videoCodec = await getVideoCodec(sourcePath);
  const copyArgs = [
    "-y",
    "-ss",
    String(segment.start),
    "-to",
    String(segment.end),
    "-i",
    sourcePath,
    "-c",
    "copy",
    outputPath,
  ];
  const encodeArgs = [
    "-y",
    "-ss",
    String(segment.start),
    "-to",
    String(segment.end),
    "-i",
    sourcePath,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    outputPath,
  ];

  try {
    if (videoCodec === "h264") {
      await runFfmpeg(copyArgs);
    } else {
      await runFfmpeg(encodeArgs);
    }

    if (!(await fileExists(outputPath))) throw new Error("Clip brut absent apres decoupe.");
    return { segmentId: segment.id, status: "completed", path: outputPath };
  } catch (error) {
    if (videoCodec === "h264") {
      try {
        await runFfmpeg(encodeArgs);
        if (await fileExists(outputPath)) {
          return { segmentId: segment.id, status: "completed", path: outputPath };
        }
      } catch {
        // The original error usually contains the more useful stream-copy failure.
      }
    }

    return {
      segmentId: segment.id,
      status: "failed",
      path: outputPath,
      error: error instanceof Error ? error.message : "Decoupe FFmpeg impossible.",
    };
  }
}

async function getVideoCodec(sourcePath: string) {
  const result = await runFfmpeg(["-hide_banner", "-i", sourcePath], { allowFailure: true });
  const match = result.stderr.match(/Video:\s*([^,\s]+)/i);
  return match?.[1]?.toLowerCase();
}

function runFfmpeg(args: string[], options: { allowFailure?: boolean } = {}) {
  const binary = getFfmpegPath();

  return new Promise<{ stderr: string }>((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || options.allowFailure) {
        resolve({ stderr });
        return;
      }

      reject(new Error(stderr.slice(-1200) || `ffmpeg a echoue avec le code ${code}.`));
    });
  });
}
