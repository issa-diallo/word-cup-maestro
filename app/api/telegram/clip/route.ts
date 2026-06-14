import { NextResponse } from "next/server";
import { runClippingPipeline } from "@/lib/pipeline";
import { createTelegramClipJob, formatTelegramClipReport } from "@/lib/telegram-clip-jobs";
import {
  assertTelegramAgentAuthorized,
  assertYoutubeUrl,
  normalizeTelegramLimit,
  normalizeTelegramPlatforms,
  readTelegramJson,
  TelegramApiError,
} from "@/lib/telegram-agent";

export async function POST(request: Request) {
  try {
    assertTelegramAgentAuthorized(request);

    const body = await readTelegramJson(request);
    const url = assertYoutubeUrl(body.url);
    const limit = normalizeTelegramLimit(body.limit);
    const platforms = normalizeTelegramPlatforms(body.platforms);

    if (body.async === true) {
      const job = createTelegramClipJob({ url, limit, platforms });
      return NextResponse.json(
        {
          status: "processing",
          jobId: job.id,
          message:
            "Generation des previews lancee. Utilise /api/telegram/clip/status avec ce jobId.",
          createdAt: job.createdAt,
        },
        { status: 202 },
      );
    }

    const report = await runClippingPipeline({
      url,
      mode: "real",
      limit,
      publish: false,
      platforms,
    });
    const result = formatTelegramClipReport(report, platforms);

    return NextResponse.json(result, { status: result.status === "ready" ? 200 : 502 });
  } catch (error) {
    return handleTelegramError(error, "Generation des previews impossible.");
  }
}

function handleTelegramError(error: unknown, fallback: string) {
  if (error instanceof TelegramApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message =
    error instanceof Error &&
    (error.message.includes("Lien YouTube") || error.message.includes("URL YouTube"))
      ? error.message
      : fallback;
  const status = message === fallback ? 500 : 400;

  return NextResponse.json({ error: message }, { status });
}
