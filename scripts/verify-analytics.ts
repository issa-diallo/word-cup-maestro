import "dotenv/config";
import { stat } from "node:fs/promises";
import { collectShortsAnalytics } from "../lib/analytics";

async function main() {
  const report = await collectShortsAnalytics({
    mode: "dry-run",
    shorts: [
      {
        id: "clip-1",
        title: "But incroyable dans les dernieres secondes",
        platform: "youtube",
        videoUrl: "https://example.com/r2/videos/clip-1.mp4",
        requestId: "mock-request-1",
        objectKey: "videos/mock/clip-1.mp4",
      },
      {
        id: "clip-1",
        title: "But incroyable dans les dernieres secondes",
        platform: "instagram",
        videoUrl: "https://example.com/r2/videos/clip-1.mp4",
        requestId: "mock-request-1",
        objectKey: "videos/mock/clip-1.mp4",
      },
      {
        id: "clip-2",
        title: "La reaction du banc devient virale",
        platform: "youtube",
        videoUrl: "https://example.com/r2/videos/clip-2.mp4",
        requestId: "mock-request-2",
        objectKey: "videos/mock/clip-2.mp4",
      },
    ],
  });

  assert(report.records.length === 3, "Expected three analytics records.");
  assert(report.winners.length === 3, "Expected winners ranking to include all mock records.");
  assert(Boolean(report.summary.best), "Expected a best short summary.");

  for (const record of report.records) {
    assert(record.provider === "mock", "Expected mock analytics provider.");
    assert(record.metrics.views > 0, "Expected positive views.");
    assert(record.metrics.likes >= 0, "Expected non-negative likes.");
    assert(record.metrics.comments >= 0, "Expected non-negative comments.");
    assert(record.metrics.shares >= 0, "Expected non-negative shares.");
    assert(record.metrics.engagementRate > 0, "Expected positive engagement rate.");
    assert(record.metrics.score > 0, "Expected positive score.");
  }

  const output = await stat(report.outputPath);
  assert(output.isFile() && output.size > 0, "Expected analytics report file.");

  console.log(
    JSON.stringify(
      {
        status: "PASS analytics dry-run",
        outputPath: report.outputPath,
        best: report.summary.best,
      },
      null,
      2,
    ),
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Verification analytics impossible.");
  process.exit(1);
});
