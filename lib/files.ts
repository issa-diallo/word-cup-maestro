import { createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const OUTPUT_DIR = path.join(process.cwd(), "output", "viral-shorts");

export function slugify(input: string) {
  const slug = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);

  return slug || "short";
}

export function hashText(input: string, length = 12) {
  return createHash("sha256").update(input).digest("hex").slice(0, length);
}

export async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function fileExists(filePath: string) {
  try {
    const info = await stat(filePath);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

export async function writeJson(filePath: string, data: unknown) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

export function datePath(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
