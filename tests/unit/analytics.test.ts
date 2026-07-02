import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectShortsAnalytics } from "../../lib/analytics";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "analytics-unit-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("collectShortsAnalytics", () => {
  it("creates deterministic dry-run metrics, ranks winners, and writes a report", async () => {
    const shorts = [
      { id: "clip-1", title: "Premier but", platform: "youtube" as const },
      { id: "clip-2", title: "Reaction du banc", platform: "instagram" as const },
      { id: "clip-3", title: "Arret decisif", platform: "youtube" as const },
      { id: "clip-4", title: "Celebration", platform: "instagram" as const },
    ];

    const report = await collectShortsAnalytics({ shorts, mode: "dry-run", outputDir: tempDir });

    expect(report.mode).toBe("dry-run");
    expect(report.records).toHaveLength(4);
    expect(report.winners).toHaveLength(3);
    expect(report.summary.total).toBe(4);
    expect(report.summary.best).toEqual({
      id: report.winners[0].id,
      title: report.winners[0].title,
      platform: report.winners[0].platform,
      score: report.winners[0].metrics.score,
    });
    expect(report.winners.map((winner) => winner.metrics.score)).toEqual(
      [...report.winners.map((winner) => winner.metrics.score)].sort((a, b) => b - a),
    );

    for (const record of report.records) {
      expect(record.provider).toBe("mock");
      expect(record.metrics.views).toBeGreaterThan(0);
      expect(record.metrics.engagementRate).toBeGreaterThan(0);
      expect(record.metrics.score).toBeGreaterThan(0);
    }

    await expect(readFile(report.outputPath, "utf8")).resolves.toContain('"records"');
  });

  it("supports empty input and fails explicitly for real mode", async () => {
    const emptyReport = await collectShortsAnalytics({ shorts: [], outputDir: tempDir });

    expect(emptyReport.records).toEqual([]);
    expect(emptyReport.winners).toEqual([]);
    expect(emptyReport.summary).toEqual({ total: 0 });

    await expect(
      collectShortsAnalytics({ shorts: [], mode: "real", outputDir: tempDir }),
    ).rejects.toThrow("Collecte analytics reelle non configuree");
  });
});
