import { NextResponse } from "next/server";
import { generateShorts } from "@/lib/shorts";
import { getYoutubeContext } from "@/lib/youtube";
import { getPipelineMode } from "@/lib/env";

export async function POST(request: Request) {
  try {
    const { url, mode } = await request.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Colle un lien YouTube valide." }, { status: 400 });
    }

    const source = await getYoutubeContext(url);
    const result = await generateShorts(source, { mock: getPipelineMode(mode) === "dry-run" });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analyse impossible.";
    const status = message.includes("Lien YouTube invalide") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
