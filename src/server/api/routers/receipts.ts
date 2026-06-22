import { z } from "zod";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { receipts, lineItems } from "~/server/db/schema";
import { uploadReceiptImage, deleteReceiptImage } from "~/lib/supabase";
import { aiUploadLimiter, MAX_AI_UPLOADS_PER_HOUR } from "~/server/lib/rate-limit";
import { enqueueExtractionJob } from "~/server/queue";

// CSV helpers
const CSV_HEADERS = [
  "Date", "Merchant", "Category", "Subtotal (INR)", "GST Rate (%)",
  "GST Amount (INR)", "Fees (INR)", "Fines (INR)", "Total (INR)", "Currency",
  "Business Expense", "ITC Claimable (INR)", "Flagged", "Flag Reason",
];

function escapeCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

export const receiptsRouter = createTRPCRouter({
  upload: protectedProcedure
    .input(z.object({
      fileName: z.string(),
      mimeType: z.string(),
      fileBase64: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // ── Rate limit ──────────────────────────────────────────────────────
      const rl = aiUploadLimiter.check(ctx.session.user.id);
      if (!rl.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `AI extraction limit reached (${MAX_AI_UPLOADS_PER_HOUR}/hr). Try again in ${rl.resetInSeconds}s.`,
        });
      }

      // ── Upload image to Supabase Storage ────────────────────────────────
      const buffer = Buffer.from(input.fileBase64, "base64");
      const imageUrl = await uploadReceiptImage(
        buffer, input.fileName, input.mimeType, ctx.session.user.id,
      );

      // ── Insert processing row ───────────────────────────────────────────
      const [receiptRecord] = await ctx.db
        .insert(receipts)
        .values({ userId: ctx.session.user.id, imageUrl, status: "processing" })
        .returning();

      if (!receiptRecord) throw new Error("Failed to create receipt record");

      // ── Push job to Upstash Redis — returns immediately ─────────────────
      // The Render worker picks this up, calls Groq, and updates the DB row.
      // The frontend polls getById every 3s until status !== "processing".
      await enqueueExtractionJob({
        receiptId: receiptRecord.id,
        imageUrl,
        userId: ctx.session.user.id,
        mimeType: input.mimeType,
      });

      return receiptRecord;
    }),

  getAll: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.receipts.findMany({
        where: eq(receipts.userId, ctx.session.user.id),
        orderBy: desc(receipts.createdAt),
        limit: input?.limit ?? 50,
        with: { items: true },
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.receipts.findFirst({
        where: and(
          eq(receipts.id, input.id),
          eq(receipts.userId, ctx.session.user.id),
        ),
        with: { items: true },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const receipt = await ctx.db.query.receipts.findFirst({
        where: and(
          eq(receipts.id, input.id),
          eq(receipts.userId, ctx.session.user.id),
        ),
      });

      if (!receipt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Receipt not found." });
      }

      await ctx.db.delete(receipts).where(
        and(eq(receipts.id, input.id), eq(receipts.userId, ctx.session.user.id)),
      );

      await deleteReceiptImage(receipt.imageUrl);
    }),

  setBusinessExp: protectedProcedure
    .input(z.object({ id: z.string(), isBusinessExp: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const receipt = await ctx.db.query.receipts.findFirst({
        where: and(
          eq(receipts.id, input.id),
          eq(receipts.userId, ctx.session.user.id),
        ),
      });
      if (!receipt) throw new TRPCError({ code: "NOT_FOUND", message: "Receipt not found." });

      const gstCredit = input.isBusinessExp ? parseFloat(receipt.tax ?? "0") : 0;
      const [updated] = await ctx.db
        .update(receipts)
        .set({ isBusinessExp: input.isBusinessExp, gstCredit: gstCredit.toString() })
        .where(eq(receipts.id, input.id))
        .returning();
      return updated;
    }),

  exportCsv: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      businessOnly: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(receipts.userId, ctx.session.user.id),
        eq(receipts.status, "done"),
      ];
      if (input.startDate) conditions.push(gte(receipts.date, new Date(input.startDate)));
      if (input.endDate) {
        const end = new Date(input.endDate);
        end.setHours(23, 59, 59, 999);
        conditions.push(lte(receipts.date, end));
      }
      if (input.businessOnly) conditions.push(eq(receipts.isBusinessExp, true));

      const rows = await ctx.db.query.receipts.findMany({
        where: and(...conditions),
        orderBy: asc(receipts.date),
      });

      const dataRows = rows.map((r) =>
        [
          r.date ? r.date.toISOString().split("T")[0] : "",
          r.merchant ?? "", r.category ?? "",
          r.subtotal ?? "0", r.gstRate ?? "0", r.tax ?? "0",
          r.fees ?? "0", r.fines ?? "0", r.total ?? "0",
          r.currency, r.isBusinessExp ? "Yes" : "No",
          r.gstCredit ?? "0", r.flagged ? "Yes" : "No", r.flagReason ?? "",
        ].map(String).map(escapeCell).join(","),
      );

      const csv = [CSV_HEADERS.map(escapeCell).join(","), ...dataRows].join("\n");
      return { csv, count: rows.length };
    }),
});