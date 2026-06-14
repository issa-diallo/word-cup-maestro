import { getClippingMaxSourceSeconds } from "../lib/pipeline";
import { toTelegramSafeError } from "../lib/telegram-agent";

const originalMaxDuration = process.env.CLIPPING_MAX_SOURCE_SECONDS;

try {
  delete process.env.CLIPPING_MAX_SOURCE_SECONDS;
  assert(getClippingMaxSourceSeconds() === 900, "Default max source duration should be 900s.");

  process.env.CLIPPING_MAX_SOURCE_SECONDS = "120";
  assert(getClippingMaxSourceSeconds() === 120, "Env max source duration should be honored.");

  process.env.CLIPPING_MAX_SOURCE_SECONDS = "invalid";
  assert(getClippingMaxSourceSeconds() === 900, "Invalid env max source duration should fallback.");

  const safeMessage = toTelegramSafeError(
    new Error("Duree source trop longue (1200s). Limite: 900s."),
    "Generation des previews impossible.",
  );
  assert(
    safeMessage === "Duree source trop longue (1200s). Limite: 900s.",
    "Duration guard should be safe to return to Telegram.",
  );

  console.log("PASS clipping guards");
} finally {
  if (originalMaxDuration === undefined) {
    delete process.env.CLIPPING_MAX_SOURCE_SECONDS;
  } else {
    process.env.CLIPPING_MAX_SOURCE_SECONDS = originalMaxDuration;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}
