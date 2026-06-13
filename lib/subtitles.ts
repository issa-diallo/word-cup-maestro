import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureDir } from "./files";
import type { TranscriptWord } from "./transcription";

const ASS_HEADER = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV
Style: Default,Arial,85,&H00FFFFFF,&H00FFFF00,&H00000000,&H99000000,-1,0,1,3,2,2,60,60,120

[Events]
Format: Layer, Start, End, Style, Text`;

export async function generateAssSubtitles(
  words: TranscriptWord[],
  clipStart: number,
  outputPath: string,
) {
  await ensureDir(path.dirname(outputPath));

  const events = words
    .map((word) => ({
      text: escapeAssText(word.word),
      start: Math.max(0, word.start - clipStart),
      end: Math.max(0, word.end - clipStart),
    }))
    .filter((word) => word.text && word.end > word.start)
    .map(
      (word, index, subtitleWords) =>
        `Dialogue: 0,${formatAssTime(word.start)},${formatAssTime(word.end)},Default,${formatSubtitleWindow(
          subtitleWords,
          index,
        )}`,
    );

  const content = `${ASS_HEADER}\n${events.join("\n")}\n`;
  await writeFile(outputPath, content);
  return outputPath;
}

function formatAssTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = Math.floor(safeSeconds % 60);
  const centiseconds = Math.floor((safeSeconds % 1) * 100);

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(
    centiseconds,
  ).padStart(2, "0")}`;
}

function escapeAssText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/\r?\n/g, " ")
    .trim();
}

function formatSubtitleWindow(words: Array<{ text: string }>, activeIndex: number) {
  const previous = words[activeIndex - 1]?.text;
  const active = words[activeIndex].text;
  const next = words[activeIndex + 1]?.text;
  const parts: string[] = [];

  if (previous) parts.push(`{\\c&H00FFFFFF&}${previous}`);
  parts.push(`{\\c&H00FFFF&}${active}{\\r}`);
  if (next) parts.push(`{\\c&H00FFFFFF&}${next}`);

  return parts.join(" ");
}
