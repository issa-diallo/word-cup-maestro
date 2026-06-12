import { existsSync } from "node:fs";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

export function getFfmpegPath() {
  if (ffmpegPath && existsSync(ffmpegPath)) return ffmpegPath;

  const localPath = path.join(
    process.cwd(),
    "node_modules",
    "ffmpeg-static",
    process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
  );
  if (existsSync(localPath)) return localPath;

  throw new Error("ffmpeg-static est indisponible.");
}
