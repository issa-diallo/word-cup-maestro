import { NextResponse } from "next/server";
import { getTelegramClipJob } from "@/lib/telegram-clip-jobs";
import { assertTelegramAgentAuthorized, TelegramApiError } from "@/lib/telegram-agent";

export async function GET(request: Request) {
  try {
    assertTelegramAgentAuthorized(request);

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId")?.trim();
    if (!jobId) throw new TelegramApiError(400, "jobId est requis.");

    const job = getTelegramClipJob(jobId);
    if (!job) throw new TelegramApiError(404, "Job introuvable ou expire.");

    return NextResponse.json(
      {
        status: job.status,
        jobId: job.id,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        source: job.result?.source,
        clips: job.result?.clips ?? [],
        error: job.error,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof TelegramApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Statut du job indisponible." }, { status: 500 });
  }
}
