import { NextResponse } from "next/server";
import { runClippingPipeline, runPipeline } from "@/lib/pipeline";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url, mode, type, publish } = body;
    const options = {
      url,
      mode,
      limit: normalizeLimit(body.limit),
      publish: mode === "real" ? false : publish === true,
      platforms: normalizePlatforms(body.platforms),
    };
    const report =
      type === "clipping" ? await runClippingPipeline(options) : await runPipeline(options);

    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pipeline impossible.";
    const status =
      message.includes("Lien YouTube invalide") || message.includes("Lien YouTube requis")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function normalizeLimit(value: unknown) {
  const limit = Number(value || 1);
  return Number.isFinite(limit) ? Math.max(1, Math.min(6, Math.floor(limit))) : 1;
}

function normalizePlatforms(value: unknown) {
  if (!Array.isArray(value)) return undefined;

  const allowed = new Set(["instagram", "youtube", "tiktok"]);
  const platforms = value
    .filter((platform): platform is string => typeof platform === "string")
    .map((platform) => platform.trim().toLowerCase())
    .filter((platform) => allowed.has(platform));

  return platforms.length ? [...new Set(platforms)] : undefined;
}
