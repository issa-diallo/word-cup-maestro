import { afterEach, describe, expect, it } from "vitest";
import {
  assertPublicHttpsUrl,
  assertR2PublicVideoUrl,
  assertTelegramAgentAuthorized,
  assertYoutubeUrl,
  normalizeHashtags,
  normalizeTelegramLimit,
  normalizeTelegramPlatforms,
  readTelegramJson,
  TelegramApiError,
  toTelegramSafeError,
} from "../../lib/telegram-agent";

const touched = new Set<string>();
function setEnv(name: string, value: string | undefined) {
  touched.add(name);
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  for (const key of touched) delete process.env[key];
  touched.clear();
});

describe("telegram-agent auth and JSON", () => {
  it("authorizes bearer tokens with configured secret", () => {
    setEnv("TELEGRAM_AGENT_SECRET", "secret-token");
    const request = new Request("https://app.test", {
      headers: { authorization: "Bearer secret-token" },
    });

    expect(() => assertTelegramAgentAuthorized(request)).not.toThrow();
    expect(() => assertTelegramAgentAuthorized(new Request("https://app.test"))).toThrow(
      TelegramApiError,
    );
  });

  it("fails safely when the Telegram secret is missing", () => {
    expect(() => assertTelegramAgentAuthorized(new Request("https://app.test"))).toThrow(
      "Configuration Telegram indisponible.",
    );
  });

  it("reads object JSON and rejects invalid JSON shapes", async () => {
    await expect(
      readTelegramJson(
        new Request("https://app.test", {
          method: "POST",
          body: JSON.stringify({ ok: true }),
        }),
      ),
    ).resolves.toEqual({ ok: true });

    await expect(
      readTelegramJson(
        new Request("https://app.test", {
          method: "POST",
          body: JSON.stringify(["bad"]),
        }),
      ),
    ).rejects.toThrow("Body JSON invalide.");
  });
});

describe("telegram-agent normalization", () => {
  it("validates YouTube URLs", () => {
    expect(assertYoutubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("https://youtu.be/dQw4w9WgXcQ");
    expect(assertYoutubeUrl("https://www.youtube.com/watch?v=abc")).toBe(
      "https://www.youtube.com/watch?v=abc",
    );
    expect(() => assertYoutubeUrl("https://example.com/video")).toThrow("URL YouTube invalide.");
    expect(() => assertYoutubeUrl("not a url")).toThrow("URL YouTube invalide.");
    expect(() => assertYoutubeUrl(undefined)).toThrow("url est requis.");
  });

  it("normalizes limits, platforms and hashtags", () => {
    expect(normalizeTelegramLimit("4")).toBe(4);
    expect(normalizeTelegramLimit("100")).toBe(6);
    expect(normalizeTelegramLimit("0")).toBe(1);
    expect(normalizeTelegramLimit("bad", 3)).toBe(3);

    expect(normalizeTelegramPlatforms(["YouTube", "instagram", "bad", "youtube"])).toEqual([
      "youtube",
      "instagram",
    ]);
    expect(normalizeTelegramPlatforms(undefined)).toEqual(["youtube", "instagram"]);
    expect(normalizeTelegramPlatforms(["bad"])).toEqual(["youtube", "instagram"]);

    expect(normalizeHashtags([" #foot ", "", 3, "#worldcup"])).toEqual(["#foot", "#worldcup"]);
    expect(normalizeHashtags("nope")).toEqual([]);
  });
});

describe("telegram-agent URL safety", () => {
  it("accepts public HTTPS URLs and rejects local or non-HTTPS URLs", () => {
    expect(assertPublicHttpsUrl("https://cdn.example.com/video.mp4", "videoUrl")).toBe(
      "https://cdn.example.com/video.mp4",
    );
    expect(() => assertPublicHttpsUrl("http://cdn.example.com/video.mp4", "videoUrl")).toThrow(
      "videoUrl doit etre une URL HTTPS publique.",
    );
    expect(() => assertPublicHttpsUrl("https://localhost/video.mp4", "videoUrl")).toThrow(
      "videoUrl doit etre une URL HTTPS publique.",
    );
    expect(() => assertPublicHttpsUrl("https://192.168.1.10/video.mp4", "videoUrl")).toThrow(
      "videoUrl doit etre une URL HTTPS publique.",
    );
    expect(() => assertPublicHttpsUrl(undefined, "videoUrl")).toThrow("videoUrl est requis.");
  });

  it("requires publish URLs to come from the configured R2 public base", () => {
    setEnv("CLOUDFLARE_R2_PUBLIC_URL", "https://r2.example.com/base/");

    expect(assertR2PublicVideoUrl("https://r2.example.com/base/video.mp4", "videoUrl")).toBe(
      "https://r2.example.com/base/video.mp4",
    );
    expect(() => assertR2PublicVideoUrl("https://other.example.com/video.mp4", "videoUrl")).toThrow(
      "videoUrl doit venir des previews R2 generees.",
    );
  });

  it("fails R2 validation when public base is missing", () => {
    expect(() => assertR2PublicVideoUrl("https://r2.example.com/video.mp4", "videoUrl")).toThrow(
      "Configuration video publique indisponible.",
    );
  });
});

describe("telegram-agent safe errors", () => {
  it("returns known user-actionable errors and hides unknown internals", () => {
    expect(toTelegramSafeError(new Error("URL YouTube invalide."), "fallback")).toBe(
      "URL YouTube invalide.",
    );
    expect(toTelegramSafeError(new Error("database password leaked"), "fallback")).toBe("fallback");
    expect(toTelegramSafeError("not error", "fallback")).toBe("fallback");
  });
});
