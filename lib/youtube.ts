export type YoutubeContext = {
  url: string;
  videoId: string;
  title: string;
  author: string;
  description: string;
  durationSeconds?: number;
  keywords: string[];
  transcript: string;
};

const YOUTUBE_ID_PATTERNS = [
  /youtu\.be\/([a-zA-Z0-9_-]{6,})/,
  /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{6,})/,
  /youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/,
  /youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/
];

export function extractYoutubeId(url: string) {
  for (const pattern of YOUTUBE_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractBalancedJson(source: string, start: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
    } else {
      if (char === "\"") inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) return source.slice(start, i + 1);
      }
    }
  }

  return "";
}

async function getOembed(url: string) {
  const response = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    { next: { revalidate: 300 } }
  );

  if (!response.ok) return null;
  return response.json() as Promise<{ title?: string; author_name?: string }>;
}

export async function getYoutubeContext(url: string): Promise<YoutubeContext> {
  const videoId = extractYoutubeId(url);
  if (!videoId) throw new Error("Lien YouTube invalide.");

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const [oembed, pageResponse] = await Promise.all([
    getOembed(watchUrl),
    fetch(watchUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 300 }
    })
  ]);

  const page = pageResponse.ok ? await pageResponse.text() : "";
  const key = "var ytInitialPlayerResponse = ";
  const start = page.indexOf(key);
  let description = "";
  let durationSeconds: number | undefined;
  let keywords: string[] = [];
  let transcript = "";
  let title = oembed?.title ?? "Video YouTube";
  let author = oembed?.author_name ?? "YouTube";

  if (start >= 0) {
    try {
      const json = extractBalancedJson(page, start + key.length);
      const player = JSON.parse(json);
      title = player.videoDetails?.title ?? title;
      author = player.videoDetails?.author ?? author;
      description = player.videoDetails?.shortDescription ?? "";
      durationSeconds = Number(player.videoDetails?.lengthSeconds) || undefined;
      keywords = player.videoDetails?.keywords ?? [];

      const captionTrack =
        player.captions?.playerCaptionsTracklistRenderer?.captionTracks?.[0];
      if (captionTrack?.baseUrl) {
        const captionResponse = await fetch(captionTrack.baseUrl);
        if (captionResponse.ok) {
          const xml = await captionResponse.text();
          transcript = xml
            .replace(/<text[^>]*>/g, " ")
            .replace(/<\/text>/g, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, "\"")
            .replace(/\s+/g, " ")
            .trim();
        }
      }
    } catch {
      description = "";
    }
  }

  return {
    url: watchUrl,
    videoId,
    title,
    author,
    description,
    durationSeconds,
    keywords,
    transcript
  };
}
