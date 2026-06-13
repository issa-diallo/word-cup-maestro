import path from "node:path";
import OpenAI from "openai";
import { getEnv } from "./env";
import { writeJson } from "./files";
import type { VideoTranscript } from "./transcription";

const MIN_SEGMENT_SECONDS = 30;
const MAX_SEGMENT_SECONDS = 90;

export type ClippingVideoMeta = {
  title: string;
  author: string;
  durationSeconds: number;
};

export type ViralClipSegment = {
  id: string;
  start: number;
  end: number;
  title: string;
  description: string;
  hashtags: string[];
  hook: string;
};

type SegmentResponse = {
  segments?: Array<Partial<ViralClipSegment>>;
};

export async function identifyViralSegments(
  transcript: VideoTranscript,
  videoMeta: ClippingVideoMeta,
  options: { outputDir?: string; limit?: number; mock?: boolean } = {},
): Promise<ViralClipSegment[]> {
  const limit = clampLimit(options.limit);

  if (options.mock || !getEnv("OPENAI_API_KEY")) {
    return writeSegments(fallbackSegments(transcript, videoMeta, limit), options.outputDir);
  }

  const openai = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Tu es un expert en montage video viral pour TikTok, YouTube Shorts et Instagram Reels. On te donne la transcription horodatee d'une video YouTube. Tu dois identifier les segments les plus viraux : hooks forts, moments droles, revelations, statistiques chocs, retournements, emotions fortes.\n\nRegles :\n- Chaque segment dure entre 30 et 90 secondes.\n- Le segment doit commencer par un hook qui accroche des la premiere seconde.\n- Ne coupe pas une phrase en plein milieu.\n- Retourne uniquement un JSON valide, aucun texte autour.",
      },
      {
        role: "user",
        content: `Video : "${videoMeta.title}" par "${videoMeta.author}" - duree totale : ${videoMeta.durationSeconds}s.\n\nTranscription horodatee :\n${formatTranscript(transcript)}\n\nIdentifie entre 3 et 6 segments viraux. Reponds avec ce JSON exact :\n{\n  "segments": [\n    {\n      "id": "clip-1",\n      "start": 12.4,\n      "end": 58.1,\n      "title": "Titre accrocheur pour le short",\n      "description": "Description courte pour YouTube/Instagram (150 chars max)",\n      "hashtags": ["#Tag1", "#Tag2", "#Tag3"],\n      "hook": "Premiere phrase prononcee dans le clip qui sert de hook"\n    }\n  ]\n}`,
      },
    ],
  });

  const parsed = parseSegmentResponse(completion.choices[0]?.message.content);
  const normalized = parsed.segments
    ? parsed.segments
        .map((segment, index) => normalizeSegment(segment, videoMeta, index))
        .filter((segment): segment is ViralClipSegment => Boolean(segment))
        .slice(0, limit)
    : [];

  return writeSegments(
    normalized.length ? normalized : fallbackSegments(transcript, videoMeta, limit),
    options.outputDir,
  );
}

function parseSegmentResponse(content: string | null | undefined): SegmentResponse {
  if (!content) return {};

  try {
    return JSON.parse(content) as SegmentResponse;
  } catch {
    return {};
  }
}

function normalizeSegment(
  segment: Partial<ViralClipSegment>,
  videoMeta: ClippingVideoMeta,
  index: number,
) {
  const start = roundSeconds(Number(segment.start));
  const end = roundSeconds(Number(segment.end));
  const duration = end - start;

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end > videoMeta.durationSeconds ||
    duration < MIN_SEGMENT_SECONDS ||
    duration > MAX_SEGMENT_SECONDS
  ) {
    return null;
  }

  return {
    id: cleanString(segment.id) || `clip-${index + 1}`,
    start,
    end,
    title: cleanString(segment.title) || `${videoMeta.title} - moment fort`,
    description:
      cleanString(segment.description).slice(0, 150) || "Extrait fort de la video source.",
    hashtags: normalizeHashtags(segment.hashtags),
    hook: cleanString(segment.hook) || "Le moment fort commence ici.",
  };
}

function fallbackSegments(
  transcript: VideoTranscript,
  videoMeta: ClippingVideoMeta,
  limit: number,
): ViralClipSegment[] {
  const candidates = transcript.segments.length
    ? transcript.segments
    : [{ text: videoMeta.title, start: 0, end: Math.min(videoMeta.durationSeconds, 60) }];

  const segments: ViralClipSegment[] = [];
  const usedStarts = new Set<number>();

  for (const candidate of candidates) {
    if (segments.length >= limit) break;

    const start = Math.max(
      0,
      Math.min(candidate.start, Math.max(0, videoMeta.durationSeconds - MIN_SEGMENT_SECONDS)),
    );
    if (usedStarts.has(Math.floor(start))) continue;

    const end = Math.min(
      videoMeta.durationSeconds,
      start + Math.min(60, videoMeta.durationSeconds - start),
    );
    if (end - start < Math.min(MIN_SEGMENT_SECONDS, videoMeta.durationSeconds)) continue;

    usedStarts.add(Math.floor(start));
    segments.push({
      id: `clip-${segments.length + 1}`,
      start: roundSeconds(start),
      end: roundSeconds(end),
      title: `${videoMeta.title} - moment ${segments.length + 1}`,
      description:
        cleanString(candidate.text).slice(0, 150) || "Extrait authentique de la video source.",
      hashtags: ["#Football", "#WorldCup", "#Shorts"],
      hook: cleanString(candidate.text).slice(0, 120) || videoMeta.title,
    });
  }

  if (!segments.length && videoMeta.durationSeconds > 0) {
    const end = Math.min(
      videoMeta.durationSeconds,
      Math.max(MIN_SEGMENT_SECONDS, videoMeta.durationSeconds),
    );
    segments.push({
      id: "clip-1",
      start: 0,
      end: roundSeconds(end),
      title: `${videoMeta.title} - moment fort`,
      description: "Extrait authentique de la video source.",
      hashtags: ["#Football", "#WorldCup", "#Shorts"],
      hook: videoMeta.title,
    });
  }

  return segments;
}

function formatTranscript(transcript: VideoTranscript) {
  const lines = transcript.segments.length
    ? transcript.segments.map(
        (segment) => `[${segment.start.toFixed(2)}-${segment.end.toFixed(2)}] ${segment.text}`,
      )
    : transcript.words.map(
        (word) => `[${word.start.toFixed(2)}-${word.end.toFixed(2)}] ${word.word}`,
      );

  return lines.join("\n").slice(0, 60000);
}

function normalizeHashtags(value: unknown) {
  const fallback = ["#Football", "#WorldCup", "#Shorts"];
  if (!Array.isArray(value)) return fallback;

  const tags = value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .slice(0, 8);

  return tags.length ? tags : fallback;
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function clampLimit(limit: number | undefined) {
  if (!Number.isFinite(limit)) return 4;
  return Math.max(1, Math.min(6, Math.floor(Number(limit))));
}

function roundSeconds(value: number) {
  return Math.round(value * 100) / 100;
}

async function writeSegments(segments: ViralClipSegment[], outputDir: string | undefined) {
  if (outputDir) await writeJson(path.join(outputDir, "segments.json"), { segments });
  return segments;
}
