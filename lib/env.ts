const SECRET_KEY_PATTERN = /(KEY|TOKEN|SECRET|PASSWORD|WEBHOOK|ACCESS)/i;

export type PipelineMode = "real" | "dry-run";

export function getEnv(name: string) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function requireEnv(name: string) {
  const value = getEnv(name);
  if (!value) throw new Error(`${name} est requis.`);
  return value;
}

export function hasEnv(name: string) {
  return Boolean(getEnv(name));
}

export function getNumberEnv(name: string, fallback: number) {
  const value = Number(getEnv(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getPipelineMode(mode?: string): PipelineMode {
  return mode === "real" ? "real" : "dry-run";
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? "[redacted]" : redactSecrets(entry),
    ]),
  );
}

export function envPresence(keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, hasEnv(key)]));
}
