import { NextResponse } from "next/server";
import { publishViaN8n } from "@/lib/publisher";
import type { UploadResult } from "@/lib/types";
import type { ViralShort } from "@/lib/shorts";
import {
  assertR2PublicVideoUrl,
  assertTelegramAgentAuthorized,
  normalizeHashtags,
  normalizeTelegramPlatforms,
  readTelegramJson,
  TelegramApiError,
  toTelegramSafeError,
} from "@/lib/telegram-agent";

type TelegramPublishClip = {
  id: string;
  title: string;
  description: string;
  hashtags: string[];
  videoUrl: string;
};

export async function POST(request: Request) {
  try {
    assertTelegramAgentAuthorized(request);

    const body = await readTelegramJson(request);
    assertPublishConfirmed(body.confirmed);

    const platforms = normalizeTelegramPlatforms(body.platforms);
    const clips = normalizeClips(body.clips);

    const results = await Promise.all(
      clips.map(async (clip) => {
        const short = clipToShort(clip);
        const upload: UploadResult = {
          shortId: clip.id,
          status: "uploaded",
          objectKey: new URL(clip.videoUrl).pathname.replace(/^\/+/, "") || clip.id,
          publicUrl: clip.videoUrl,
        };
        const result = await publishViaN8n(short, upload, {
          mode: "real",
          platforms,
        });

        return {
          id: clip.id,
          status: result.status,
          requestId: result.requestId,
          error: result.error
            ? toTelegramSafeError(new Error(result.error), "Publication impossible.")
            : undefined,
        };
      }),
    );

    const hasFailure = results.some((result) => result.status === "failed");

    return NextResponse.json(
      {
        status: hasFailure ? "partial" : "published",
        results,
      },
      { status: hasFailure ? 502 : 200 },
    );
  } catch (error) {
    return handleTelegramError(error, "Publication impossible.");
  }
}

function assertPublishConfirmed(value: unknown) {
  if (value !== true) {
    throw new TelegramApiError(400, "Confirmation humaine requise pour publier.");
  }
}

function normalizeClips(value: unknown): TelegramPublishClip[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TelegramApiError(400, "clips doit contenir au moins un clip valide.");
  }

  if (value.length > 6) {
    throw new TelegramApiError(400, "Maximum 6 clips par requete.");
  }

  return value.map((clip, index) => {
    if (!clip || typeof clip !== "object") {
      throw new TelegramApiError(400, `Clip ${index + 1} invalide.`);
    }

    const record = clip as Record<string, unknown>;
    const id = normalizeRequiredString(record.id, `clips[${index}].id`);
    const title = normalizeRequiredString(record.title, `clips[${index}].title`);
    const videoUrl = assertR2PublicVideoUrl(record.videoUrl, `clips[${index}].videoUrl`);

    return {
      id,
      title,
      videoUrl,
      description: typeof record.description === "string" ? record.description.trim() : "",
      hashtags: normalizeHashtags(record.hashtags),
    };
  });
}

function normalizeRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TelegramApiError(400, `${fieldName} est requis.`);
  }

  return value.trim();
}

function clipToShort(clip: TelegramPublishClip): ViralShort {
  return {
    id: clip.id,
    angle: clip.title,
    hook: clip.title,
    script: clip.description,
    videoPrompt: "",
    title: clip.title,
    description: clip.description,
    hashtags: clip.hashtags,
  };
}

function handleTelegramError(error: unknown, fallback: string) {
  if (error instanceof TelegramApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return NextResponse.json({ error: fallback }, { status: 500 });
}
