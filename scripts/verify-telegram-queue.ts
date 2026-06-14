import {
  createTelegramClipJob,
  getTelegramClipJobQueuePosition,
  getTelegramMaxQueuedJobs,
} from "../lib/telegram-clip-jobs";
import { TelegramApiError } from "../lib/telegram-agent";

const originalMaxQueuedJobs = process.env.TELEGRAM_CLIP_MAX_QUEUED_JOBS;

try {
  process.env.TELEGRAM_CLIP_MAX_QUEUED_JOBS = "2";

  if (getTelegramMaxQueuedJobs() !== 2) {
    throw new Error("Expected TELEGRAM_CLIP_MAX_QUEUED_JOBS to configure queue depth.");
  }

  const firstJob = createTestJob();
  if (firstJob.status !== "queued") {
    throw new Error(`Expected new async Telegram job to start queued, got ${firstJob.status}.`);
  }

  const secondJob = createTestJob();
  if (getTelegramClipJobQueuePosition(firstJob.id) !== 1) {
    throw new Error("Expected first queued Telegram job to have queue position 1.");
  }
  if (getTelegramClipJobQueuePosition(secondJob.id) !== 2) {
    throw new Error("Expected second queued Telegram job to have queue position 2.");
  }

  try {
    createTestJob();
    throw new Error("Expected full Telegram clip queue to fail.");
  } catch (error) {
    if (!(error instanceof TelegramApiError)) throw error;
    if (error.status !== 429) throw new Error(`Expected HTTP 429, got ${error.status}.`);
    if (error.message !== "File de clipping pleine. Reessaie dans quelques minutes.") {
      throw new Error(`Unexpected queue-full message: ${error.message}`);
    }
  }

  console.log("PASS telegram clip queue");
} finally {
  if (originalMaxQueuedJobs === undefined) {
    delete process.env.TELEGRAM_CLIP_MAX_QUEUED_JOBS;
  } else {
    process.env.TELEGRAM_CLIP_MAX_QUEUED_JOBS = originalMaxQueuedJobs;
  }
}

function createTestJob() {
  return createTelegramClipJob({
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    limit: 1,
    platforms: ["youtube", "instagram"],
    start: false,
  });
}
