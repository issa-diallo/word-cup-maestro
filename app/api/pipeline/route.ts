import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline";

export async function POST(request: Request) {
  try {
    const { url, mode, limit, publish, platforms } = await request.json();
    const report = await runPipeline({
      url,
      mode,
      limit: Number(limit || 1),
      publish: publish !== false,
      platforms: Array.isArray(platforms) ? platforms : undefined
    });
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pipeline impossible.";
    const status = message.includes("Lien YouTube invalide") || message.includes("Lien YouTube requis") ? 400 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
