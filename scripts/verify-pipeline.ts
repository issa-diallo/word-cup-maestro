import "dotenv/config";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { runPipeline } from "../lib/pipeline";
import { envPresence, getEnv, redactSecrets } from "../lib/env";

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
  const url =
    String(args.get("url") || "") || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const mode = String(args.get("mode") || "dry-run");
  const limit = Number(args.get("limit") || 1);
  const publish = args.get("no-publish") !== true;
  const strict = args.get("strict") === true;

  console.log(
    JSON.stringify(
      {
        env: envPresence([
          "OPENAI_API_KEY",
          "ELEVENLABS_API_KEY",
          "KLING_API_KEY_access_token",
          "KLING_API_KEY_secret_key",
          "CLOUDFLARE_R2_PUBLIC_URL",
          "N8N_WEBHOOK_URL"
        ]),
        mode,
        limit,
        strict
      },
      null,
      2
    )
  );

  const report = await runPipeline({ url, mode, limit, publish });
  if (strict) await assertReport(report, { limit, publish });

  const summary = {
    mode: report.mode,
    outputDir: report.outputDir,
    shorts: report.shorts.map((item) => ({
      id: item.short.id,
      voiceover: item.voiceover?.status,
      clip: item.clip?.status,
      render: item.render?.status,
      dimensions: item.render ? `${item.render.width}x${item.render.height}` : undefined,
      upload: item.upload?.status,
      publicUrl: item.upload?.publicUrl,
      publish: item.publish?.status
    }))
  };
  console.log(JSON.stringify(redactSecrets(summary), null, 2));
}

async function assertReport(
  report: Awaited<ReturnType<typeof runPipeline>>,
  options: { limit: number; publish: boolean }
) {
  assert(report.shorts.length === options.limit, `Nombre de shorts attendu: ${options.limit}.`);

  for (const item of report.shorts) {
    const requiredFields = [
      item.short.angle,
      item.short.hook,
      item.short.script,
      item.short.videoPrompt,
      item.short.title,
      item.short.description
    ];
    assert(requiredFields.every((field) => typeof field === "string" && field.length > 0), "Short incomplet.");
    assert(Array.isArray(item.short.hashtags) && item.short.hashtags.length > 0, "Hashtags manquants.");

    assert(item.voiceover?.status === "completed", `Voix off non terminee pour ${item.short.id}.`);
    await assertNonEmptyFile(item.voiceover.path, "MP3 voix off");

    assert(item.clip?.status === "completed", `Clip non termine pour ${item.short.id}.`);
    await assertNonEmptyFile(item.clip.path, "MP4 clip");
    assert(item.clip.provider === "mock" || item.clip.provider === "kling", "Provider video invalide.");
    assert(Boolean(item.clip.jobId), "Job id video manquant.");

    assert(item.render?.status === "completed", `Rendu non termine pour ${item.short.id}.`);
    await assertNonEmptyFile(item.render.path, "MP4 final");
    assert(item.render.width === 1080 && item.render.height === 1920, "Le rendu final n'est pas en 1080x1920.");
    assert(item.render.hasAudio === true, "Audio absent du rendu final.");

    assert(item.upload?.status === "dry-run" || item.upload?.status === "uploaded", "Upload invalide.");
    assert(Boolean(item.upload?.objectKey?.match(/^videos\/\d{4}-\d{2}-\d{2}\//)), "Cle R2 invalide.");
    const publicBase = getEnv("CLOUDFLARE_R2_PUBLIC_URL");
    if (publicBase) {
      assert(
        item.upload?.publicUrl?.startsWith(publicBase.replace(/\/+$/, "")),
        "URL publique R2 ne vient pas de CLOUDFLARE_R2_PUBLIC_URL."
      );
    }

    if (options.publish) {
      assert(item.publish?.status === "dry-run" || item.publish?.status === "published", "Publication invalide.");
      assert(Boolean(item.publish?.requestId), "Request id publication manquant.");
      if (item.publish?.status === "dry-run") {
        const responsePath = (item.publish.response as { path?: string } | undefined)?.path;
        await assertNonEmptyFile(responsePath, "payload n8n dry-run");
        const payload = JSON.parse(await readFile(String(responsePath), "utf8"));
        assert(payload.payload?.platforms?.includes("instagram"), "Plateforme Instagram absente.");
        assert(payload.payload?.platforms?.includes("youtube"), "Plateforme YouTube absente.");
        assert(payload.payload?.video_url === item.upload?.publicUrl, "video_url publication invalide.");
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Verification stricte echouee: ${message}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Verification impossible.");
  process.exit(1);
});
