import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { getEnv } from "./env";

export const TELEGRAM_ALLOWED_PLATFORMS = ["youtube", "instagram", "tiktok"] as const;

export type TelegramPlatform = (typeof TELEGRAM_ALLOWED_PLATFORMS)[number];

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

export function assertTelegramAgentAuthorized(request: Request) {
  const configuredSecret = getEnv("TELEGRAM_AGENT_SECRET");
  if (!configuredSecret) throw new TelegramApiError(500, "TELEGRAM_AGENT_SECRET absent.");

  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match || !constantTimeEquals(match[1].trim(), configuredSecret)) {
    throw new TelegramApiError(401, "Non autorise.");
  }
}

export async function readTelegramJson(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new TelegramApiError(400, "Body JSON invalide.");
    }

    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof TelegramApiError) throw error;
    throw new TelegramApiError(400, "Body JSON invalide.");
  }
}

export function assertYoutubeUrl(value: unknown) {
  if (!value || typeof value !== "string") {
    throw new TelegramApiError(400, "url est requis.");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TelegramApiError(400, "URL YouTube invalide.");
  }

  if (!["https:", "http:"].includes(parsed.protocol) || !YOUTUBE_HOSTS.has(parsed.hostname)) {
    throw new TelegramApiError(400, "URL YouTube invalide.");
  }

  return parsed.toString();
}

export function normalizeTelegramLimit(value: unknown, fallback = 3) {
  const limit = Number(value ?? fallback);
  if (!Number.isFinite(limit)) return fallback;
  return Math.max(1, Math.min(6, Math.floor(limit)));
}

export function normalizeTelegramPlatforms(value: unknown): TelegramPlatform[] {
  if (!Array.isArray(value)) return ["youtube", "instagram"];

  const allowed = new Set<string>(TELEGRAM_ALLOWED_PLATFORMS);
  const platforms = value
    .filter((platform): platform is string => typeof platform === "string")
    .map((platform) => platform.trim().toLowerCase())
    .filter((platform): platform is TelegramPlatform => allowed.has(platform));

  return platforms.length ? [...new Set(platforms)] : ["youtube", "instagram"];
}

export function normalizeHashtags(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((hashtag): hashtag is string => typeof hashtag === "string")
    .map((hashtag) => hashtag.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function assertPublicHttpsUrl(value: unknown, fieldName: string) {
  if (!value || typeof value !== "string") {
    throw new TelegramApiError(400, `${fieldName} est requis.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TelegramApiError(400, `${fieldName} doit etre une URL HTTPS publique.`);
  }

  if (parsed.protocol !== "https:" || isLocalHostname(parsed.hostname)) {
    throw new TelegramApiError(400, `${fieldName} doit etre une URL HTTPS publique.`);
  }

  return parsed.toString();
}

export class TelegramApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function constantTimeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const ipVersion = isIP(normalized);

  if (ipVersion === 4) return isPrivateIpv4(normalized);
  if (ipVersion === 6) return isPrivateIpv6(normalized);

  return normalized === "localhost" || normalized.endsWith(".local");
}

function isPrivateIpv4(ip: string) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;

  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIpv6(ip: string) {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}
