import { NextResponse } from "next/server";
import { generateVoiceover } from "@/lib/voiceover";
import { getPipelineMode } from "@/lib/env";
import type { ViralShort } from "@/lib/shorts";

export async function POST(request: Request) {
  try {
    const { short, script, mode } = await request.json();
    const voiceShort: ViralShort =
      short && typeof short === "object"
        ? short
        : {
            id: "voice-test",
            angle: "Test voix",
            hook: "Test voix off",
            script,
            videoPrompt: "",
            title: "Test voix off",
            description: "",
            hashtags: []
          };

    if (!voiceShort.script || typeof voiceShort.script !== "string") {
      return NextResponse.json({ error: "Script manquant." }, { status: 400 });
    }

    const result = await generateVoiceover(voiceShort, { mode: getPipelineMode(mode) });
    return NextResponse.json(result, { status: result.status === "completed" ? 200 : 502 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation voix impossible." },
      { status: 500 }
    );
  }
}
