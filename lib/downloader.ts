import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { getFfmpegPath } from "./ffmpeg";
import { ensureDir } from "./files";

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

export type DownloadedVideo = {
  id: string;
  title?: string;
  author?: string;
  path: string;
  durationSeconds: number;
};

type YtDlpJson = {
  id?: string;
  title?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  duration_string?: string;
  ext?: string;
  requested_downloads?: Array<{ filepath?: string }>;
  filepath?: string;
  _filename?: string;
};

export async function downloadYoutubeVideo(
  url: string,
  outputDir: string,
  options: { mock?: boolean; maxDurationSeconds?: number } = {},
): Promise<DownloadedVideo> {
  assertYoutubeUrl(url);

  const sourceDir = await ensureDir(path.join(outputDir, "clips", "source"));

  if (options.mock) {
    const filePath = path.join(sourceDir, "mock-source.mp4");
    await createMockSourceVideo(filePath);
    return {
      id: "mock",
      title: "Mock Source",
      author: "Mock",
      path: filePath,
      durationSeconds: 5,
    };
  }

  const executable = getYtDlpPath();
  const args = [
    "--format",
    "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]",
    "--merge-output-format",
    "mp4",
    "--ffmpeg-location",
    getFfmpegPath(),
    "--output",
    path.join(sourceDir, "%(id)s.%(ext)s"),
    "--no-playlist",
    "--print-json",
    ...buildDurationFilterArgs(options.maxDurationSeconds),
    url,
  ];

  const { stdout } = await runCommand(executable, args);
  const metadata = parseYtDlpJson(stdout);
  const id =
    metadata.id || path.basename(metadata.filepath || metadata._filename || "source", ".mp4");
  const filePath = findDownloadedPath(metadata, sourceDir, id);
  const durationSeconds = Number(metadata.duration);

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("yt-dlp n'a pas retourne de duree video valide.");
  }

  if (options.maxDurationSeconds && durationSeconds > options.maxDurationSeconds) {
    throw new Error(
      `Duree source trop longue (${Math.round(durationSeconds)}s). Limite: ${options.maxDurationSeconds}s.`,
    );
  }

  if (!existsSync(filePath)) {
    throw new Error(`Video source introuvable apres telechargement: ${filePath}`);
  }

  return {
    id,
    title: metadata.title,
    author: metadata.uploader || metadata.channel,
    path: filePath,
    durationSeconds,
  };
}

function buildDurationFilterArgs(maxDurationSeconds: number | undefined) {
  if (!maxDurationSeconds || !Number.isFinite(maxDurationSeconds)) return [];
  return ["--match-filter", `duration <= ${Math.floor(maxDurationSeconds)}`];
}

export function getYtDlpPath() {
  const localPath = path.join(
    process.cwd(),
    "bin",
    process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp",
  );
  return existsSync(localPath) ? localPath : "yt-dlp";
}

function assertYoutubeUrl(value: string) {
  if (!value || typeof value !== "string") throw new Error("Lien YouTube requis.");

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Lien YouTube invalide.");
  }

  if (!["https:", "http:"].includes(parsed.protocol) || !YOUTUBE_HOSTS.has(parsed.hostname)) {
    throw new Error("Lien YouTube invalide.");
  }
}

function parseYtDlpJson(stdout: string): YtDlpJson {
  const jsonLine = stdout
    .trim()
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.trim().startsWith("{"));

  if (!jsonLine) throw new Error("yt-dlp n'a pas retourne de metadata JSON.");

  try {
    return JSON.parse(jsonLine) as YtDlpJson;
  } catch {
    throw new Error("Metadata JSON yt-dlp illisible.");
  }
}

function findDownloadedPath(metadata: YtDlpJson, outputDir: string, id: string) {
  const requestedPath = metadata.requested_downloads?.find(
    (download) => download.filepath,
  )?.filepath;
  if (requestedPath) return requestedPath;
  if (metadata.filepath) return metadata.filepath;
  if (metadata._filename) return metadata._filename;

  const ext = metadata.ext === "mp4" ? metadata.ext : "mp4";
  return path.join(outputDir, `${id}.${ext}`);
}

async function createMockSourceVideo(filePath: string) {
  await runFfmpegCommand([
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x11110f:s=1080x1920:d=5:r=30",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-t",
    "5",
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

function runFfmpegCommand(args: string[]) {
  const executable = getFfmpegPath();

  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(new Error(`ffmpeg indisponible: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.slice(-800) || `ffmpeg a echoue avec le code ${code}.`));
    });
  });
}

function runCommand(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(new Error(`yt-dlp indisponible: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(stderr.trim() || `yt-dlp a echoue avec le code ${code}.`));
    });
  });
}
