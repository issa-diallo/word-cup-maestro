import { NextResponse } from "next/server";
import { runClippingPipeline } from "@/lib/pipeline";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const report = await runClippingPipeline({
      url: body.url,
      mode: body.mode,
      limit: normalizeLimit(body.limit),
      publish: body.publish !== false,
      platforms: normalizePlatforms(body.platforms),
    });

    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Clipping impossible.";
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
