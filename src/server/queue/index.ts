import { Queue } from "bullmq";
import IORedis from "ioredis";

export type ExtractionJobData = {
  receiptId: string;
  imageUrl: string;   // public Supabase URL — worker fetches & re-encodes to base64
  userId: string;
  mimeType: string;
};

const QUEUE_NAME = "receipt-extraction";

/**
 * Creates a short-lived Redis connection suitable for serverless use.
 * Call enqueueExtractionJob() which handles open/close automatically.
 */
function makeConnection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL env var is not set");

  return new IORedis(url, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableOfflineQueue: false,  // fail fast in serverless instead of buffering
    tls: url.startsWith("rediss://") ? {} : undefined,
  });
}

/**
 * Enqueue a receipt extraction job.
 * Opens a connection, adds the job, then closes — safe for Vercel serverless.
 */
export async function enqueueExtractionJob(data: ExtractionJobData): Promise<void> {
  const connection = makeConnection();
  const queue = new Queue<ExtractionJobData>(QUEUE_NAME, { connection });

  await queue.add("extract", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  });

  // Close queue + underlying connection before Vercel function returns
  await queue.close();
}

/**
 * Creates a persistent Redis connection for the long-running Render worker.
 * Do NOT use this in Next.js / Vercel.
 */
export function makeWorkerConnection(): IORedis {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL env var is not set");

  return new IORedis(url, {
    maxRetriesPerRequest: null,
    tls: url.startsWith("rediss://") ? {} : undefined,
  });
}

export { QUEUE_NAME };