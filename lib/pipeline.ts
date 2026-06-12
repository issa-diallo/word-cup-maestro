import path from "node:path";
import { ensureDir, OUTPUT_DIR, writeJson } from "./files";
import { getPipelineMode } from "./env";
import { getYoutubeContext } from "./youtube";
import { generateShorts } from "./shorts";
import { generateVoiceover } from "./voiceover";
import { generateVideoClip } from "./video";
import { renderShortMp4 } from "./render";
import { uploadRenderToR2 } from "./storage";
import { publishViaN8n } from "./publisher";
import type { PipelineMode } from "./env";
import type { PipelineReport, PipelineShortResult } from "./types";

export type RunPipelineOptions = {
  url: string;
  mode?: PipelineMode | string;
  limit?: number;
  publish?: boolean;
  platforms?: string[];
};

export async function runPipeline(options: RunPipelineOptions): Promise<PipelineReport> {
  if (!options.url || typeof options.url !== "string") throw new Error("Lien YouTube requis.");

  const mode = getPipelineMode(options.mode);
  const startedAt = new Date().toISOString();
  const outputDir = await ensureDir(path.join(OUTPUT_DIR, startedAt.replace(/[:.]/g, "-")));
  const source = await getYoutubeContext(options.url);
  const analysis = await generateShorts(source, { mock: mode === "dry-run" });
  const selectedShorts = analysis.shorts.slice(0, Math.max(1, Math.min(options.limit ?? 4, 4)));
  const shorts: PipelineShortResult[] = [];

  for (const short of selectedShorts) {
    const item: PipelineShortResult = { short };
    item.voiceover = await generateVoiceover(short, { mode, outputDir });

    if (item.voiceover.status === "completed") {
      item.clip = await generateVideoClip(short, { mode, outputDir });
    }

    if (item.clip?.status === "completed") {
      item.render = await renderShortMp4(short, item.clip, item.voiceover, { outputDir });
    }

    if (item.render?.status === "completed") {
      item.upload = await uploadRenderToR2(item.render, { shortId: short.id, title: short.title }, { mode });
    }

    if (options.publish !== false && item.upload && item.upload.status !== "failed") {
      item.publish = await publishViaN8n(short, item.upload, {
        mode,
        outputDir,
        platforms: options.platforms
      });
    }

    shorts.push(item);
    await writeJson(path.join(outputDir, "report.partial.json"), {
      mode,
      source,
      startedAt,
      finishedAt: new Date().toISOString(),
      outputDir,
      shorts
    });
  }

  const report: PipelineReport = {
    mode,
    source,
    startedAt,
    finishedAt: new Date().toISOString(),
    outputDir,
    shorts
  };
  await writeJson(path.join(outputDir, "report.json"), report);
  return report;
}
