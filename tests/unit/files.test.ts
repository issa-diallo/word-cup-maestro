import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { datePath, ensureDir, fileExists, hashText, slugify, writeJson } from "../../lib/files";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "files-unit-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("file helpers", () => {
  it("slugifies text into a safe readable slug with fallback", () => {
    expect(slugify("Équipe de France: But incroyable !!!")).toBe("equipe-de-france-but-incroyable");
    expect(slugify("---")).toBe("short");
    expect(slugify("a".repeat(100))).toHaveLength(70);
  });

  it("hashes text to deterministic sha256 prefixes", () => {
    expect(hashText("hello", 8)).toBe(hashText("hello", 8));
    expect(hashText("hello", 8)).toHaveLength(8);
    expect(hashText("hello")).toHaveLength(12);
  });

  it("ensures directories and detects only non-empty files", async () => {
    const dir = path.join(tempDir, "nested");
    await expect(ensureDir(dir)).resolves.toBe(dir);

    const missing = path.join(dir, "missing.txt");
    const empty = path.join(dir, "empty.txt");
    const full = path.join(dir, "full.txt");
    await writeFile(empty, "");
    await writeFile(full, "content");

    await expect(fileExists(missing)).resolves.toBe(false);
    await expect(fileExists(empty)).resolves.toBe(false);
    await expect(fileExists(full)).resolves.toBe(true);
  });

  it("writes pretty JSON and formats date paths", async () => {
    const filePath = path.join(tempDir, "a", "b", "report.json");
    await writeJson(filePath, { ok: true });

    await expect(readFile(filePath, "utf8")).resolves.toBe(`{\n  "ok": true\n}\n`);
    expect(datePath(new Date("2026-07-02T12:34:56Z"))).toBe("2026-07-02");
  });
});
