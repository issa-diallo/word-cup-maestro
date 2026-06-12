import { spawn } from "node:child_process";
import path from "node:path";
import { ensureDir, fileExists, hashText, OUTPUT_DIR, slugify } from "./files";
import { getFfmpegPath } from "./ffmpeg";
import type { ViralShort } from "./shorts";
import type { RenderResult, VideoGenerationResult, VoiceoverResult } from "./types";

function runCommand(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.slice(-1000) || `${command} a echoue avec le code ${code}.`));
    });
  });
}

function runFfmpegProbe(filePath: string) {
  const binary = requireFfmpeg();
  return new Promise<string>((resolve, reject) => {
    const child = spawn(binary, ["-hide_banner", "-i", filePath, "-f", "null", "-"]);
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code: number | null) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(stderr.slice(-1000) || `ffmpeg probe a echoue avec le code ${code}.`));
    });
  });
}

function requireFfmpeg() {
  return getFfmpegPath();
}

export async function renderShortMp4(
  short: ViralShort,
  clip: VideoGenerationResult,
  voiceover: VoiceoverResult,
  options: { outputDir?: string } = {}
): Promise<RenderResult> {
  const clipPath = clip.path;
  const audioPath = voiceover.path;
  if (!clipPath || !(await fileExists(clipPath))) {
    return { shortId: short.id, status: "failed", error: "Clip video local manquant." };
  }
  if (!audioPath || !(await fileExists(audioPath))) {
    return { shortId: short.id, status: "failed", error: "Voix off locale manquante." };
  }

  const outputDir = await ensureDir(path.join(options.outputDir ?? OUTPUT_DIR, "final"));
  const outputPath = path.join(
    outputDir,
    `${short.id}-${slugify(short.title)}-${hashText(`${clipPath}:${audioPath}`, 8)}.mp4`
  );

  if (await fileExists(outputPath)) return verifyMp4(short.id, outputPath);

  try {
    await runCommand(requireFfmpeg(), [
      "-y",
      "-stream_loop",
      "-1",
      "-i",
      clipPath,
      "-i",
      audioPath,
      "-vf",
      "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,drawbox=x=0:y=0:w=iw:h=250:color=black@0.45:t=fill,drawbox=x=0:y=h-260:w=iw:h=260:color=black@0.48:t=fill,drawbox=x=54:y=72:w=972:h=90:color=0xff3d00@0.7:t=fill",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-shortest",
      "-movflags",
      "+faststart",
      outputPath
    ]);

    return verifyMp4(short.id, outputPath);
  } catch (error) {
    return {
      shortId: short.id,
      status: "failed",
      error: error instanceof Error ? error.message : "Rendu MP4 impossible."
    };
  }
}

export async function verifyMp4(shortId: string, filePath: string): Promise<RenderResult> {
  try {
    const raw = await runFfmpegProbe(filePath);
    const dimensions = raw.match(/Video:.*?(\d{3,5})x(\d{3,5})/);
    const duration = raw.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    const width = dimensions ? Number(dimensions[1]) : undefined;
    const height = dimensions ? Number(dimensions[2]) : undefined;
    const durationSeconds = duration
      ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])
      : undefined;
    const hasAudio = /Audio:/i.test(raw);
    const valid = width === 1080 && height === 1920 && hasAudio;

    return {
      shortId,
      status: valid ? "completed" : "failed",
      path: filePath,
      width,
      height,
      durationSeconds,
      hasAudio,
      error: valid ? undefined : "Verification MP4 echouee: ratio ou audio invalide."
    };
  } catch (error) {
    return {
      shortId,
      status: "failed",
      path: filePath,
      error: error instanceof Error ? error.message : "Verification MP4 impossible."
    };
  }
}
