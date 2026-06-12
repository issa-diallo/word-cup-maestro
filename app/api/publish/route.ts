import { NextResponse } from "next/server";

export async function POST() {
  const missing = [
    "YOUTUBE_CLIENT_ID",
    "YOUTUBE_CLIENT_SECRET",
    "YOUTUBE_REFRESH_TOKEN",
    "TIKTOK_CLIENT_KEY",
    "TIKTOK_CLIENT_SECRET",
    "INSTAGRAM_ACCESS_TOKEN"
  ].filter((key) => !process.env[key]);

  if (missing.length) {
    return NextResponse.json(
      {
        error: "Publication automatique non configuree.",
        missing,
        next: "Ajoute les identifiants OAuth dans .env.local, puis branche les APIs de publication."
      },
      { status: 501 }
    );
  }

  return NextResponse.json({
    status: "ready",
    message: "Les credentials sont presents. Il reste a connecter les endpoints officiels de chaque plateforme."
  });
}
