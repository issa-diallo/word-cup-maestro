import { NextResponse } from "next/server";
import { publishViaN8n } from "@/lib/publisher";
import { getPipelineMode } from "@/lib/env";
import type { UploadResult } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const { video_url, title, description, hashtags, platforms, mode } = await request.json();
    if (!video_url || typeof video_url !== "string") {
      return NextResponse.json({ error: "video_url est requis." }, { status: 400 });
    }
    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "title est requis." }, { status: 400 });
    }

    const short = {
      id: "publish-test",
      angle: "",
      hook: "",
      script: "",
      videoPrompt: "",
      title,
      description: typeof description === "string" ? description : "",
      hashtags: Array.isArray(hashtags) ? hashtags : []
    };
    const upload: UploadResult = {
      shortId: short.id,
      status: "uploaded",
      objectKey: "manual",
      publicUrl: video_url
    };
    const result = await publishViaN8n(short, upload, {
      mode: getPipelineMode(mode),
      platforms: Array.isArray(platforms) ? platforms : undefined
    });

    return NextResponse.json(result, { status: result.status === "failed" ? 502 : 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Publication impossible." },
      { status: 500 }
    );
  }
}
