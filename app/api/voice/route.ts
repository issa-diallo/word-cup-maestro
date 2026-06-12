import { NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY est requis pour generer la voix." },
      { status: 501 }
    );
  }

  const { script } = await request.json();
  if (!script || typeof script !== "string") {
    return NextResponse.json({ error: "Script manquant." }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const speech = await openai.audio.speech.create({
    model: "tts-1",
    voice: "onyx",
    input: script.slice(0, 4000),
    response_format: "mp3"
  });

  return new Response(await speech.arrayBuffer(), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Disposition": "attachment; filename=voiceover.mp3"
    }
  });
}
