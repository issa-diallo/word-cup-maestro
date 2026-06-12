import { NextResponse } from "next/server";
import { generateShorts } from "@/lib/shorts";
import { getYoutubeContext } from "@/lib/youtube";

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Colle un lien YouTube valide." }, { status: 400 });
    }

    const source = await getYoutubeContext(url);
    const result = await generateShorts(source);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analyse impossible.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
