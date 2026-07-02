import path from "node:path";
import { ensureDir, OUTPUT_DIR, writeJson } from "./files";
import { getPipelineMode, type PipelineMode } from "./env";

export type AnalyticsPlatform = "youtube" | "instagram" | "tiktok";

export type ShortAnalyticsInput = {
  id: string;
  title: string;
  platform: AnalyticsPlatform;
  videoUrl?: string;
  requestId?: string;
  objectKey?: string;
  publishedAt?: string;
};

export type ShortAnalyticsMetrics = {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  retentionRate?: number;
  engagementRate: number;
  score: number;
};

export type ShortAnalyticsRecord = ShortAnalyticsInput & {
  collectedAt: string;
  provider: "mock" | "upload-post" | "youtube" | "instagram";
  metrics: ShortAnalyticsMetrics;
};

export type ShortAnalyticsReport = {
  mode: PipelineMode;
  collectedAt: string;
  outputPath: string;
  records: ShortAnalyticsRecord[];
  winners: ShortAnalyticsRecord[];
  summary: {
    total: number;
    best?: {
      id: string;
      title: string;
      platform: AnalyticsPlatform;
      score: number;
    };
  };
};

export async function collectShortsAnalytics(options: {
  shorts: ShortAnalyticsInput[];
  mode?: PipelineMode | string;
  outputDir?: string;
}): Promise<ShortAnalyticsReport> {
  const mode = getPipelineMode(options.mode);
  const collectedAt = new Date().toISOString();
  const outputDir = await ensureDir(options.outputDir ?? path.join(OUTPUT_DIR, "analytics"));

  if (mode === "real") {
    throw new Error("Collecte analytics reelle non configuree. Utilise le mode dry-run/mock.");
  }

  const records = options.shorts.map((short) => buildMockAnalyticsRecord(short, collectedAt));
  const winners = [...records]
    .sort((left, right) => right.metrics.score - left.metrics.score)
    .slice(0, Math.min(3, records.length));
  const best = winners[0];
  const outputPath = path.join(outputDir, `analytics-${collectedAt.replace(/[:.]/g, "-")}.json`);
  const report: ShortAnalyticsReport = {
    mode,
    collectedAt,
    outputPath,
    records,
    winners,
    summary: {
      total: records.length,
      best: best
        ? {
            id: best.id,
            title: best.title,
            platform: best.platform,
            score: best.metrics.score,
          }
        : undefined,
    },
  };

  await writeJson(outputPath, report);
  return report;
}

function buildMockAnalyticsRecord(
  short: ShortAnalyticsInput,
  collectedAt: string,
): ShortAnalyticsRecord {
  const seed = stableNumber(`${short.id}:${short.title}:${short.platform}`);
  const views = 500 + (seed % 150_000);
  const likes = Math.round(views * (0.03 + ((seed >> 3) % 120) / 10_000));
  const comments = Math.round(views * (0.002 + ((seed >> 5) % 30) / 10_000));
  const shares = Math.round(views * (0.004 + ((seed >> 7) % 45) / 10_000));
  const retentionRate = Math.round((35 + ((seed >> 9) % 55)) * 10) / 10;
  const engagementRate = roundRate((likes + comments + shares) / views);
  const score = Math.round((views / 100 + engagementRate * 1200 + retentionRate * 8) * 10) / 10;

  return {
    ...short,
    collectedAt,
    provider: "mock",
    metrics: {
      views,
      likes,
      comments,
      shares,
      retentionRate,
      engagementRate,
      score,
    },
  };
}

function stableNumber(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function roundRate(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
