/**
 * BullMQ Worker — standalone Node.js process deployed on Render.com.
 *
 * Render build command : npm install --include=dev
 * Render start command : npx tsx src/server/queue/worker.ts
 *
 * Also exposes GET /health so UptimeRobot can ping every 5 min
 * to prevent Render free-tier from sleeping.
 */

import http from "http";
import { Worker, type Job, type ConnectionOptions } from "bullmq";
import OpenAI from "openai";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { and, avg, eq } from "drizzle-orm";
import { z } from "zod";
import * as schema from "../db/schema.js";
import { QUEUE_NAME, makeWorkerConnection } from "./index.js";
import type { ExtractionJobData } from "./index.js";

// ── DB ────────────────────────────────────────────────────────────────────────
// Prefer DIRECT_URL (port 5432) — avoids pgbouncer transaction-mode limits.
const pool = new Pool({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const db = drizzle(pool, { schema });

// ── Groq ──────────────────────────────────────────────────────────────────────
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// ── Zod schema ────────────────────────────────────────────────────────────────
const ReceiptExtractionSchema = z.object({
  merchant: z.string(),
  date: z.string().nullable(),
  category: z.enum([
    "Food & Dining", "Groceries", "Transport", "Healthcare",
    "Shopping", "Entertainment", "Utilities", "Taxes & Fees", "Other",
  ]),
  items: z.array(z.object({
    name: z.string(),
    quantity: z.number(),
    price: z.number(),
  })),
  subtotal: z.number(),
  tax: z.number(),
  fees: z.number(),
  fines: z.number(),
  total: z.number(),
  currency: z.string().default("INR"),
  isBusinessExp: z.boolean(),
  gstRate: z.number().nullable(),
});

// ── Job processor ─────────────────────────────────────────────────────────────
async function processReceipt(job: Job<ExtractionJobData>) {
  const { receiptId, imageUrl, userId, mimeType } = job.data;
  const start = Date.now();

  console.log(`[worker] job=${job.id} receipt=${receiptId} starting`);

  // Fetch the image from Supabase public URL and re-encode to base64.
  // This avoids storing large base64 blobs in Redis.
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Image fetch failed: ${imgRes.status}`);
  const fileBase64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");

  // Call Groq Vision
  const response = await groq.chat.completions.create({
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    response_format: { type: "json_object" },
    messages: [{
      role: "user",
      content: [
        {
          type: "text",
          text: `Analyze this receipt. Return a raw JSON object matching this schema:
{
  "merchant": string,
  "date": "YYYY-MM-DD" or null,
  "category": "Food & Dining" | "Groceries" | "Transport" | "Healthcare" | "Shopping" | "Entertainment" | "Utilities" | "Taxes & Fees" | "Other",
  "items": [{"name": string, "quantity": number, "price": number}],
  "subtotal": number, "tax": number, "fees": number, "fines": number, "total": number,
  "currency": string, "isBusinessExp": boolean, "gstRate": number
}`,
        },
        {
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${fileBase64}` },
        },
      ],
    }],
  });

  const rawJson = response.choices[0]?.message.content;
  if (!rawJson) throw new Error("Groq returned empty response");

  const data = ReceiptExtractionSchema.parse(JSON.parse(rawJson));
  const gstCredit = data.isBusinessExp ? data.tax : 0;

  console.log(
    `[worker] job=${job.id} receipt=${receiptId} ` +
    `tokens=${response.usage?.total_tokens ?? "?"} ` +
    `elapsed=${Date.now() - start}ms`,
  );

  // Anomaly detection: flag if total > 3× user's category average
  const avgRows = await db
    .select({ categoryAvg: avg(schema.receipts.total) })
    .from(schema.receipts)
    .where(
      and(
        eq(schema.receipts.userId, userId),
        eq(schema.receipts.category, data.category),
        eq(schema.receipts.status, "done"),
      ),
    );

  const categoryAvg = parseFloat(avgRows[0]?.categoryAvg ?? "0");
  const flagged = categoryAvg > 0 && data.total > categoryAvg * 3;
  const flagReason = flagged
    ? `Unusually high: ₹${data.total.toFixed(2)} vs avg ₹${categoryAvg.toFixed(2)} in ${data.category}`
    : null;

  // Persist in a transaction
  await db.transaction(async (tx) => {
    await tx
      .update(schema.receipts)
      .set({
        merchant: data.merchant,
        date: data.date ? new Date(data.date) : null,
        category: data.category,
        subtotal: data.subtotal.toString(),
        tax: data.tax.toString(),
        fees: data.fees.toString(),
        fines: data.fines.toString(),
        total: data.total.toString(),
        currency: data.currency,
        isBusinessExp: data.isBusinessExp,
        gstRate: data.gstRate?.toString() ?? null,
        gstCredit: gstCredit.toString(),
        flagged,
        flagReason,
        status: "done",
      })
      .where(eq(schema.receipts.id, receiptId));

    if (data.items.length > 0) {
      await tx.insert(schema.lineItems).values(
        data.items.map((item) => ({
          receiptId,
          name: item.name,
          quantity: item.quantity,
          price: item.price.toString(),
        })),
      );
    }
  });

  console.log(`[worker] job=${job.id} receipt=${receiptId} done ✓`);
}

// ── BullMQ worker ─────────────────────────────────────────────────────────────
const connection = makeWorkerConnection();

const worker = new Worker<ExtractionJobData>(QUEUE_NAME, processReceipt, {
  connection: connection as unknown as ConnectionOptions,
  concurrency: 2,
});

worker.on("failed", (job, err) => {
  console.error(`[worker] job=${job?.id} FAILED: ${err.message}`);
  if (job?.data.receiptId) {
    void db
      .update(schema.receipts)
      .set({ status: "failed" })
      .where(eq(schema.receipts.id, job.data.receiptId))
      .catch((e) => console.error("[worker] DB status update failed:", e));
  }
});

worker.on("error", (err) => {
  console.error("[worker] error:", err.message);
});

// ── Health HTTP server ────────────────────────────────────────────────────────
// Render free-tier requires a bound port. UptimeRobot pings /health every
// 5 min to prevent the service from sleeping after 15 min of inactivity.
const PORT = parseInt(process.env.PORT ?? "8080", 10);

http
  .createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
    } else {
      res.writeHead(404);
      res.end();
    }
  })
  .listen(PORT, () => {
    console.log(`[worker] health → http://0.0.0.0:${PORT}/health`);
    console.log(`[worker] listening on queue: ${QUEUE_NAME}`);
  });