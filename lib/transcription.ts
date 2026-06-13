import { createReadStream } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { getEnv } from "./env";
import { ensureDir, writeJson } from "./files";

export type TranscriptWord = {
  word: string;
  start: number;
  end: number;
};

export type TranscriptSegment = {
  text: string;
  start: number;
  end: number;
};

export type VideoTranscript = {
  words: TranscriptWord[];
  segments: TranscriptSegment[];
  rawPath?: string;
  transcriptPath?: string;
};

type WhisperWord = {
  word?: string;
  start?: number;
  end?: number;
};

type WhisperResponse = {
  words?: WhisperWord[];
  segments?: Array<{ text?: string; start?: number; end?: number }>;
  text?: string;
};

export async function transcribeVideo(
  videoPath: string,
  options: { outputDir?: string; language?: string; mock?: boolean } = {},
): Promise<VideoTranscript> {
  const outputDir = await ensureDir(options.outputDir ?? path.dirname(videoPath));

  if (options.mock) {
    const transcript = createMockTranscript();
    return writeTranscriptFiles(transcript, outputDir, { mock: true });
  }

  const apiKey = getEnv("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY est requis pour transcrire la video.");

  const openai = new OpenAI({ apiKey });
  const raw = (await openai.audio.transcriptions.create({
    file: createReadStream(videoPath),
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
    ...(options.language === undefined ? {} : { language: options.language }),
  })) as WhisperResponse;

  const words = normalizeWords(raw.words);
  const transcript = {
    words,
    segments: words.length ? groupWordsIntoSegments(words) : normalizeSegments(raw.segments),
  };

  return writeTranscriptFiles(transcript, outputDir, raw);
}

export function groupWordsIntoSegments(words: TranscriptWord[]) {
  const segments: TranscriptSegment[] = [];
  let current: TranscriptWord[] = [];

  for (const word of words) {
    if (!current.length) {
      current.push(word);
      continue;
    }

    const nextDuration = word.end - current[0].start;
    const previousText = current[current.length - 1].word;
    const sentenceEnded = /[.!?]$/.test(previousText);

    if (nextDuration > 8 || (nextDuration >= 3 && sentenceEnded)) {
      segments.push(wordsToSegment(current));
      current = [word];
    } else {
      current.push(word);
    }
  }

  if (current.length) {
    if (segments.length && current[current.length - 1].end - current[0].start < 3) {
      const previous = segments.pop();
      segments.push(wordsToSegment(previous ? [...segmentToWords(previous), ...current] : current));
    } else {
      segments.push(wordsToSegment(current));
    }
  }

  return segments;
}

function normalizeWords(words: WhisperWord[] | undefined) {
  if (!Array.isArray(words)) return [];

  return words
    .map((word) => ({
      word: typeof word.word === "string" ? word.word.trim() : "",
      start: Number(word.start),
      end: Number(word.end),
    }))
    .filter(
      (word): word is TranscriptWord =>
        Boolean(word.word) &&
        Number.isFinite(word.start) &&
        Number.isFinite(word.end) &&
        word.end >= word.start,
    );
}

function normalizeSegments(segments: WhisperResponse["segments"]) {
  if (!Array.isArray(segments)) return [];

  return segments
    .map((segment) => ({
      text: typeof segment.text === "string" ? segment.text.trim() : "",
      start: Number(segment.start),
      end: Number(segment.end),
    }))
    .filter(
      (segment): segment is TranscriptSegment =>
        Boolean(segment.text) &&
        Number.isFinite(segment.start) &&
        Number.isFinite(segment.end) &&
        segment.end >= segment.start,
    );
}

function wordsToSegment(words: TranscriptWord[]): TranscriptSegment {
  return {
    text: words
      .map((word) => word.word)
      .join(" ")
      .replace(/\s+([,.;:!?])/g, "$1"),
    start: words[0].start,
    end: words[words.length - 1].end,
  };
}

function segmentToWords(segment: TranscriptSegment): TranscriptWord[] {
  const parts = segment.text.split(/\s+/).filter(Boolean);
  const duration = Math.max(0.1, segment.end - segment.start);
  const step = duration / Math.max(1, parts.length);

  return parts.map((word, index) => ({
    word,
    start: segment.start + step * index,
    end: index === parts.length - 1 ? segment.end : segment.start + step * (index + 1),
  }));
}

async function writeTranscriptFiles(
  transcript: Omit<VideoTranscript, "rawPath" | "transcriptPath">,
  outputDir: string,
  raw: unknown,
) {
  const rawPath = path.join(outputDir, "transcript.raw.json");
  const transcriptPath = path.join(outputDir, "transcript.json");

  await writeJson(rawPath, raw);
  await writeJson(transcriptPath, transcript);

  return { ...transcript, rawPath, transcriptPath };
}

function createMockTranscript(): Omit<VideoTranscript, "rawPath" | "transcriptPath"> {
  const words = [
    { word: "Ce", start: 0, end: 0.25 },
    { word: "moment", start: 0.25, end: 0.7 },
    { word: "peut", start: 0.7, end: 0.95 },
    { word: "changer", start: 0.95, end: 1.35 },
    { word: "tout.", start: 1.35, end: 1.75 },
    { word: "Regarde", start: 3.2, end: 3.6 },
    { word: "ce", start: 3.6, end: 3.75 },
    { word: "qui", start: 3.75, end: 3.95 },
    { word: "arrive", start: 3.95, end: 4.35 },
    { word: "ensuite.", start: 4.35, end: 4.9 },
  ];

  return {
    words,
    segments: groupWordsIntoSegments(words),
  };
}
