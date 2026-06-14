import {
  assertR2PublicVideoUrl,
  assertTelegramAgentAuthorized,
  TelegramApiError,
} from "../lib/telegram-agent";

const originalSecret = process.env.TELEGRAM_AGENT_SECRET;
const originalR2PublicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL;

try {
  delete process.env.TELEGRAM_AGENT_SECRET;

  try {
    assertTelegramAgentAuthorized(new Request("https://example.com/api/telegram/clip"));
    throw new Error("Expected missing Telegram secret to fail.");
  } catch (error) {
    if (!(error instanceof TelegramApiError)) throw error;
    if (error.status !== 500) throw new Error(`Expected HTTP 500, got ${error.status}.`);
    if (error.message.includes("TELEGRAM_AGENT_SECRET")) {
      throw new Error("Telegram auth error leaked the secret env var name.");
    }
    if (error.message !== "Configuration Telegram indisponible.") {
      throw new Error(`Unexpected missing-secret error: ${error.message}`);
    }
  }

  process.env.TELEGRAM_AGENT_SECRET = "expected-token";

  try {
    assertTelegramAgentAuthorized(
      new Request("https://example.com/api/telegram/clip", {
        headers: { Authorization: "Bearer wrong-token" },
      }),
    );
    throw new Error("Expected wrong Telegram token to fail.");
  } catch (error) {
    if (!(error instanceof TelegramApiError)) throw error;
    if (error.status !== 401) throw new Error(`Expected HTTP 401, got ${error.status}.`);
    if (error.message !== "Non autorise.") {
      throw new Error(`Unexpected wrong-token error: ${error.message}`);
    }
  }

  assertTelegramAgentAuthorized(
    new Request("https://example.com/api/telegram/clip", {
      headers: { Authorization: "Bearer expected-token" },
    }),
  );

  process.env.CLOUDFLARE_R2_PUBLIC_URL = "https://cdn.example.com";
  assertR2PublicVideoUrl("https://cdn.example.com/videos/clip.mp4", "videoUrl");
  assertRejectsNonR2VideoUrl();

  console.log("PASS telegram auth guard");
} finally {
  if (originalSecret === undefined) {
    delete process.env.TELEGRAM_AGENT_SECRET;
  } else {
    process.env.TELEGRAM_AGENT_SECRET = originalSecret;
  }

  if (originalR2PublicUrl === undefined) {
    delete process.env.CLOUDFLARE_R2_PUBLIC_URL;
  } else {
    process.env.CLOUDFLARE_R2_PUBLIC_URL = originalR2PublicUrl;
  }
}

function assertRejectsNonR2VideoUrl() {
  try {
    assertR2PublicVideoUrl("https://other.example.com/videos/clip.mp4", "videoUrl");
    throw new Error("Expected non-R2 video URL to be rejected.");
  } catch (error) {
    if (!(error instanceof TelegramApiError)) throw error;
    if (error.status !== 400) throw new Error(`Expected HTTP 400, got ${error.status}.`);
    if (error.message !== "videoUrl doit venir des previews R2 generees.") {
      throw new Error(`Unexpected R2 URL guard message: ${error.message}`);
    }
  }
}
