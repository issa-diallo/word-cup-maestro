import path from "node:path";
import { ensureDir, OUTPUT_DIR, writeJson } from "./files";
import { getPipelineMode } from "./env";
import { downloadYoutubeVideo } from "./downloader";
import { transcribeVideo } from "./transcription";
import { identifyViralSegments } from "./segments";
import { cutSegment, cropToVertical, burnSubtitles, type ClipFileResult } from "./clipper";
import { generateAssSubtitles } from "./subtitles";
import { getYoutubeContext } from "./youtube";
import { generateShorts } from "./shorts";
import { generateVoiceover } from "./voiceover";
import { generateVideoClip } from "./video";
import { renderShortMp4 } from "./render";
import { uploadRenderToR2 } from "./storage";
import { publishViaN8n } from "./publisher";
import type { PipelineMode } from "./env";
import type {
  ClippingPipelineReport,
  ClippingSegment,
  ClippingShortResult,
  PipelineReport,
  PipelineShortResult,
  RenderResult,
} from "./types";

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
      item.upload = await uploadRenderToR2(
        item.render,
        { shortId: short.id, title: short.title },
        { mode },
      );
    }

    if (options.publish !== false && item.upload && item.upload.status !== "failed") {
      item.publish = await publishViaN8n(short, item.upload, {
        mode,
        outputDir,
        platforms: options.platforms,
      });
    }

    shorts.push(item);
    await writeJson(path.join(outputDir, "report.partial.json"), {
      mode,
      source,
      startedAt,
      finishedAt: new Date().toISOString(),
      outputDir,
      shorts,
    });
  }

  const report: PipelineReport = {
    mode,
    source,
    startedAt,
    finishedAt: new Date().toISOString(),
    outputDir,
    shorts,
  };
  await writeJson(path.join(outputDir, "report.json"), report);
  return report;
}

export async function runClippingPipeline(
  options: RunPipelineOptions,
): Promise<ClippingPipelineReport> {
  if (!options.url || typeof options.url !== "string") throw new Error("Lien YouTube requis.");

  const mode = getPipelineMode(options.mode);
  const startedAt = new Date().toISOString();
  const outputDir = await ensureDir(path.join(OUTPUT_DIR, startedAt.replace(/[:.]/g, "-")));
  const source = await downloadYoutubeVideo(options.url, outputDir, { mock: mode === "dry-run" });
  const transcript = await transcribeVideo(source.path, {
    outputDir,
    mock: mode === "dry-run",
  });
  const segments = await identifyViralSegments(
    transcript,
    {
      title: source.title ?? source.id,
      author: source.author ?? "YouTube",
      durationSeconds: source.durationSeconds,
    },
    { outputDir, limit: options.limit, mock: mode === "dry-run" },
  );
  const clips: ClippingShortResult[] = [];

  for (const segment of segments) {
    const item: ClippingShortResult = { segment };
    const rawClip = await cutSegment(source.path, segment, outputDir);
    item.rawClip = toRenderResult(rawClip, segment);

    if (rawClip.status === "completed" && rawClip.path) {
      const verticalClip = await cropToVertical(rawClip.path, outputDir);
      item.verticalClip = toRenderResult(verticalClip, segment, { width: 1080, height: 1920 });

      if (verticalClip.status === "completed" && verticalClip.path) {
        const subtitleWords = transcript.words.filter(
          (word) => word.end >= segment.start && word.start <= segment.end,
        );
        const assPath = path.join(outputDir, "clips", "subtitles", `${segment.id}.ass`);
        item.subtitlesPath = await generateAssSubtitles(subtitleWords, segment.start, assPath);

        const finalClip = await burnSubtitles(verticalClip.path, item.subtitlesPath, outputDir);
        item.render = toRenderResult(finalClip, segment, {
          width: 1080,
          height: 1920,
          hasAudio: true,
        });
      }
    }

    if (item.render?.status === "completed") {
      item.upload = await uploadRenderToR2(
        item.render,
        { shortId: segment.id, title: segment.title },
        { mode },
      );
    }

    if (options.publish !== false && item.upload && item.upload.status !== "failed") {
      item.publish = await publishViaN8n(segmentToShort(segment), item.upload, {
        mode,
        outputDir,
        platforms: options.platforms,
      });
    }

    clips.push(item);
    await writeJson(
      path.join(outputDir, "report.partial.json"),
      buildClippingReport({
        mode,
        source: { ...source, url: options.url },
        transcript,
        startedAt,
        outputDir,
        clips,
      }),
    );
  }

  const report = buildClippingReport({
    mode,
    source: { ...source, url: options.url },
    transcript,
    startedAt,
    outputDir,
    clips,
  });
  await writeJson(path.join(outputDir, "report.json"), report);
  return report;
}

function buildClippingReport(params: {
  mode: PipelineMode;
  source: ClippingPipelineReport["source"];
  transcript: Awaited<ReturnType<typeof transcribeVideo>>;
  startedAt: string;
  outputDir: string;
  clips: ClippingShortResult[];
}): ClippingPipelineReport {
  return {
    mode: params.mode,
    source: params.source,
    transcript: {
      rawPath: params.transcript.rawPath,
      transcriptPath: params.transcript.transcriptPath,
      words: params.transcript.words.length,
      segments: params.transcript.segments.length,
    },
    startedAt: params.startedAt,
    finishedAt: new Date().toISOString(),
    outputDir: params.outputDir,
    clips: params.clips,
  };
}

function toRenderResult(
  clip: ClipFileResult,
  segment: ClippingSegment,
  metadata: Partial<RenderResult> = {},
): RenderResult {
  return {
    shortId: segment.id,
    status: clip.status,
    path: clip.path,
    durationSeconds: segment.end - segment.start,
    ...metadata,
    error: clip.error,
  };
}

function segmentToShort(segment: ClippingSegment) {
  return {
    id: segment.id,
    angle: segment.title,
    hook: segment.hook,
    script: segment.hook,
    videoPrompt: "",
    title: segment.title,
    description: segment.description,
    hashtags: segment.hashtags,
  };
}
