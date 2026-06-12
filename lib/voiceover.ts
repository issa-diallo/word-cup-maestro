import { writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import OpenAI from "openai";
import { ensureDir, fileExists, hashText, OUTPUT_DIR, slugify } from "./files";
import { getEnv, type PipelineMode } from "./env";
import { getFfmpegPath } from "./ffmpeg";
import type { ViralShort } from "./shorts";
import type { VoiceoverResult } from "./types";

const ELEVENLABS_DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";

function runFfmpeg(args: string[]) {
  const binary = getFfmpegPath();

  return new Promise<void>((resolve, reject) => {
    const child = spawn(binary, args);
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(-800) || `ffmpeg a echoue avec le code ${code}.`));
    });
  });
}

async function createMockVoiceover(script: string, filePath: string) {
  const duration = Math.max(4, Math.min(14, Math.ceil(script.length / 95)));
  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:sample_rate=44100",
    "-t",
    String(duration),
    "-q:a",
    "6",
    filePath
  ]);
}

async function generateElevenLabs(script: string, filePath: string) {
  const apiKey = getEnv("ELEVENLABS_API_KEY");
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY absent.");

  const voiceId = getEnv("ELEVENLABS_VOICE_ID") ?? ELEVENLABS_DEFAULT_VOICE;
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey
    },
    body: JSON.stringify({
      text: script.slice(0, 4000),
      model_id: getEnv("ELEVENLABS_MODEL_ID") ?? "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.48,
        similarity_boost: 0.75
      }
    })
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs a refuse la generation (${response.status}).`);
  }

  await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
}

async function generateOpenAiVoice(script: string, filePath: string) {
  const apiKey = getEnv("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY absent.");

  const openai = new OpenAI({ apiKey });
  const speech = await openai.audio.speech.create({
    model: getEnv("OPENAI_TTS_MODEL") ?? "tts-1",
    voice: (getEnv("OPENAI_TTS_VOICE") ?? "onyx") as "alloy",
    input: script.slice(0, 4000),
    response_format: "mp3"
  });

  await writeFile(filePath, Buffer.from(await speech.arrayBuffer()));
}

export async function generateVoiceover(
  short: ViralShort,
  options: { mode: PipelineMode; outputDir?: string } = { mode: "dry-run" }
): Promise<VoiceoverResult> {
  const outputDir = await ensureDir(path.join(options.outputDir ?? OUTPUT_DIR, "audio"));
  const fileName = `${short.id}-${slugify(short.title)}-${hashText(short.script, 8)}.mp3`;
  const filePath = path.join(outputDir, fileName);

  if (await fileExists(filePath)) {
    return {
      shortId: short.id,
      provider: options.mode === "real" && getEnv("ELEVENLABS_API_KEY") ? "elevenlabs" : "mock",
      status: "completed",
      path: filePath
    };
  }

  try {
    if (options.mode === "real" && getEnv("ELEVENLABS_API_KEY")) {
      await generateElevenLabs(short.script, filePath);
      return { shortId: short.id, provider: "elevenlabs", status: "completed", path: filePath };
    }

    if (options.mode === "real" && getEnv("OPENAI_API_KEY")) {
      await generateOpenAiVoice(short.script, filePath);
      return { shortId: short.id, provider: "openai", status: "completed", path: filePath };
    }

    await createMockVoiceover(short.script, filePath);
    return { shortId: short.id, provider: "mock", status: "completed", path: filePath };
  } catch (error) {
    return {
      shortId: short.id,
      provider: "mock",
      status: "failed",
      error: error instanceof Error ? error.message : "Generation voix impossible."
    };
  }
}
