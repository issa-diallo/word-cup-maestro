import { spawn } from "node:child_process";
import path from "node:path";
import { getFfmpegPath } from "./ffmpeg";
import { ensureDir, fileExists } from "./files";
import type { ClippingSegment } from "./types";

export type ClipFileResult = {
  segmentId: string;
  status: "completed" | "failed";
  path?: string;
  error?: string;
};

export async function cutSegment(
  sourcePath: string,
  segment: ClippingSegment,
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

export async function cropToVertical(clipPath: string, outputDir: string): Promise<ClipFileResult> {
  const verticalDir = await ensureDir(path.join(outputDir, "clips", "vertical"));
  const segmentId = path.basename(clipPath, path.extname(clipPath));
  const outputPath = path.join(verticalDir, `${segmentId}.mp4`);

  try {
    await runFfmpeg([
      "-y",
      "-i",
      clipPath,
      "-vf",
      "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      outputPath,
    ]);

    if (!(await fileExists(outputPath))) throw new Error("Clip vertical absent apres recadrage.");
    return { segmentId, status: "completed", path: outputPath };
  } catch (error) {
    return {
      segmentId,
      status: "failed",
      path: outputPath,
      error: error instanceof Error ? error.message : "Recadrage vertical impossible.",
    };
  }
}

export async function burnSubtitles(
  clipPath: string,
  assPath: string,
  outputDir: string,
): Promise<ClipFileResult> {
  const finalDir = await ensureDir(path.join(outputDir, "clips", "final"));
  const segmentId = path.basename(clipPath, path.extname(clipPath));
  const outputPath = path.join(finalDir, `${segmentId}.mp4`);

  try {
    await runFfmpeg([
      "-y",
      "-i",
      clipPath,
      "-vf",
      `ass=${escapeFilterPath(assPath)}`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "22",
      "-c:a",
      "copy",
      outputPath,
    ]);

    if (!(await fileExists(outputPath))) throw new Error("Clip final absent apres incrustation.");
    return { segmentId, status: "completed", path: outputPath };
  } catch (error) {
    return {
      segmentId,
      status: "failed",
      path: outputPath,
      error: error instanceof Error ? error.message : "Incrustation des sous-titres impossible.",
    };
  }
}

async function getVideoCodec(sourcePath: string) {
  const result = await runFfmpeg(["-hide_banner", "-i", sourcePath], { allowFailure: true });
  const match = result.stderr.match(/Video:\s*([^,\s]+)/i);
  return match?.[1]?.toLowerCase();
}

function escapeFilterPath(filePath: string) {
  return filePath.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
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
