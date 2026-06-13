import "dotenv/config";
import { readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { runClippingPipeline } from "../lib/pipeline";
import { envPresence, getEnv, redactSecrets } from "../lib/env";

type FfprobeStream = {
  codec_type?: string;
  width?: number;
  height?: number;
  duration?: string;
};

const require = createRequire(__filename);
const ffprobe = require("ffprobe-static") as { path: string };

const args = new Map<string, string | boolean>();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith("--")) continue;
  const key = arg.slice(2);
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) {
    args.set(key, next);
    index += 1;
  } else {
    args.set(key, true);
  }
}

async function main() {
  const url = String(args.get("url") || "") || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const mode = String(args.get("mode") || "dry-run");
  const limit = Number(args.get("limit") || 1);
  const publish = args.get("no-publish") !== true;
  const strict = args.get("strict") === true;

  console.log(
    JSON.stringify(
      {
        env: envPresence(["OPENAI_API_KEY", "CLOUDFLARE_R2_PUBLIC_URL", "N8N_WEBHOOK_URL"]),
        mode,
        limit,
        publish,
        strict,
      },
      null,
      2,
    ),
  );

  const report = await runClippingPipeline({ url, mode, limit, publish });
  if (strict) await assertReport(report, { limit, publish });

  const summary = {
    mode: report.mode,
    source: {
      id: report.source.id,
      durationSeconds: report.source.durationSeconds,
      path: report.source.path,
    },
    transcript: report.transcript,
    outputDir: report.outputDir,
    clips: report.clips.map((item) => ({
      id: item.segment.id,
      range: `${item.segment.start}-${item.segment.end}`,
      raw: item.rawClip?.status,
      vertical: item.verticalClip?.status,
      render: item.render?.status,
      upload: item.upload?.status,
      publicUrl: item.upload?.publicUrl,
      publish: item.publish?.status,
    })),
  };
  console.log(JSON.stringify(redactSecrets(summary), null, 2));
}

async function assertReport(
  report: Awaited<ReturnType<typeof runClippingPipeline>>,
  options: { limit: number; publish: boolean },
) {
  assert(report.clips.length === options.limit, `Nombre de clips attendu: ${options.limit}.`);
  assert(report.source.durationSeconds > 0, "Duree source invalide.");
  await assertNonEmptyFile(report.source.path, "MP4 source");

  assert(report.transcript.words > 0, "Aucun mot transcrit.");
  assert(report.transcript.segments > 0, "Aucun segment de transcription.");
  await assertNonEmptyFile(report.transcript.transcriptPath, "transcript.json");

  for (const item of report.clips) {
    assert(item.segment.start >= 0, `Start invalide pour ${item.segment.id}.`);
    assert(
      item.segment.end <= report.source.durationSeconds,
      `End hors bornes pour ${item.segment.id}.`,
    );
    assert(item.segment.end > item.segment.start, `Duree invalide pour ${item.segment.id}.`);
    assert(Boolean(item.segment.title), `Titre manquant pour ${item.segment.id}.`);
    assert(
      Array.isArray(item.segment.hashtags) && item.segment.hashtags.length > 0,
      "Hashtags manquants.",
    );

    assert(item.rawClip?.status === "completed", `Clip brut non termine pour ${item.segment.id}.`);
    await assertNonEmptyFile(item.rawClip.path, "MP4 brut");

    assert(
      item.verticalClip?.status === "completed",
      `Clip vertical non termine pour ${item.segment.id}.`,
    );
    await assertNonEmptyFile(item.verticalClip.path, "MP4 vertical");
    const verticalProbe = await probeVideo(String(item.verticalClip.path));
    assert(verticalProbe.width === 1080, "Largeur verticale invalide.");
    assert(verticalProbe.height === 1920, "Hauteur verticale invalide.");
    assert(verticalProbe.durationSeconds > 0, "Duree verticale invalide.");

    await assertNonEmptyFile(item.subtitlesPath, "ASS sous-titres");
    const subtitles = await readFile(String(item.subtitlesPath), "utf8");
    assert(subtitles.includes("Dialogue:"), "Aucune ligne Dialogue dans les sous-titres.");

    assert(item.render?.status === "completed", `Clip final non termine pour ${item.segment.id}.`);
    await assertNonEmptyFile(item.render.path, "MP4 final");
    const finalProbe = await probeVideo(String(item.render.path));
    assert(finalProbe.width === 1080, "Largeur finale invalide.");
    assert(finalProbe.height === 1920, "Hauteur finale invalide.");
    assert(finalProbe.durationSeconds > 0, "Duree finale invalide.");

    assert(
      item.upload?.status === "dry-run" || item.upload?.status === "uploaded",
      "Upload invalide.",
    );
    assert(
      Boolean(item.upload?.objectKey?.match(/^videos\/\d{4}-\d{2}-\d{2}\//)),
      "Cle R2 invalide.",
    );
    const publicBase = getEnv("CLOUDFLARE_R2_PUBLIC_URL");
    if (publicBase) {
      assert(
        item.upload?.publicUrl?.startsWith(publicBase.replace(/\/+$/, "")),
        "URL publique R2 ne vient pas de CLOUDFLARE_R2_PUBLIC_URL.",
      );
    }

    if (options.publish) {
      assert(
        item.publish?.status === "dry-run" || item.publish?.status === "published",
        "Publication invalide.",
      );
      assert(Boolean(item.publish?.requestId), "Request id publication manquant.");
      if (item.publish?.status === "dry-run") {
        const responsePath = (item.publish.response as { path?: string } | undefined)?.path;
        await assertNonEmptyFile(responsePath, "payload n8n dry-run");
        const payload = JSON.parse(await readFile(String(responsePath), "utf8"));
        assert(
          payload.payload?.video_url === item.upload?.publicUrl,
          "video_url publication invalide.",
        );
      }
    }
  }

  await assertNonEmptyFile(path.join(report.outputDir, "report.json"), "rapport final");
}

async function assertNonEmptyFile(filePath: string | undefined, label: string) {
  assert(Boolean(filePath), `${label}: chemin manquant.`);
  const info = await stat(String(filePath));
  assert(info.isFile() && info.size > 0, `${label}: fichier vide ou absent.`);
}

async function probeVideo(filePath: string) {
  const output = await runFfprobe([
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_streams",
    filePath,
  ]);
  const parsed = JSON.parse(output) as { streams?: FfprobeStream[] };
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  assert(video, `Flux video absent: ${filePath}`);

  return {
    width: Number(video.width),
    height: Number(video.height),
    durationSeconds: Number(video.duration || 0),
  };
}

function runFfprobe(ffprobeArgs: string[]) {
  const binary = ffprobe.path;

  return new Promise<string>((resolve, reject) => {
    const child = spawn(binary, ffprobeArgs, { stdio: ["ignore", "pipe", "pipe"] });
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
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(stderr.slice(-800) || `ffprobe a echoue avec le code ${code}.`));
    });
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Verification stricte echouee: ${message}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Verification clipping impossible.");
  process.exit(1);
});
