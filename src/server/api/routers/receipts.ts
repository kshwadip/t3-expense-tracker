import { z } from "zod";
import { eq, and, avg as sqlAvg } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { receipts, lineItems } from "~/server/db/schema";
import { uploadReceiptImage } from "~/lib/supabase";
import OpenAI from "openai";
import { sql } from "drizzle-orm";

// Groq via OpenAI-compatible SDK (fast Llama 4 vision)
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const ReceiptExtractionSchema = z.object({
  merchant: z.string(),
  date: z.string().nullable(),
  category: z.enum([
    "Food & Dining",
    "Groceries",
    "Transport",
    "Healthcare",
    "Shopping",
    "Entertainment",
    "Utilities",
    "Taxes & Fees",
    "Other",
  ]),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number(),
      price: z.number(),
    }),
  ),
  subtotal: z.number(),
  tax: z.number(),
  fees: z.number(),
  fines: z.number(),
  total: z.number(),
  currency: z.string().default("INR"),
  isBusinessExp: z.boolean(),
  gstRate: z.number().nullable(),
});

export const receiptsRouter = createTRPCRouter({
  // ── upload ────────────────────────────────────────────────────────────────
  upload: protectedProcedure
    .input(
      z.object({
        fileName: z.string(),
        mimeType: z.string(),
        fileBase64: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Store image in Supabase Storage
      const buffer = Buffer.from(input.fileBase64, "base64");
      const imageUrl = await uploadReceiptImage(
        buffer,
        input.fileName,
        input.mimeType,
        ctx.session.user.id,
      );

      // 2. Create pending receipt record
      const [receiptRecord] = await ctx.db
        .insert(receipts)
        .values({
          userId: ctx.session.user.id,
          imageUrl,
          status: "processing",
        })
        .returning();

      if (!receiptRecord) throw new Error("Failed to initialize receipt log");

      try {
        // 3. Call Groq vision (Llama 4 Scout)
        const response = await groq.chat.completions.create({
          model: "meta-llama/llama-4-scout-17b-16e-instruct",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Analyze this receipt image carefully. Return ONLY a raw JSON object matching:
{
  "merchant": string,
  "date": "YYYY-MM-DD" | null,
  "category": "Food & Dining" | "Groceries" | "Transport" | "Healthcare" | "Shopping" | "Entertainment" | "Utilities" | "Taxes & Fees" | "Other",
  "items": [{"name": string, "quantity": number, "price": number}],
  "subtotal": number,
  "tax": number,
  "fees": number,
  "fines": number,
  "total": number,
  "currency": string,
  "isBusinessExp": boolean,
  "gstRate": number | null
}
All monetary values in the receipt's native currency. tax = GST/VAT shown on receipt. fees = service/delivery/convenience fees. fines = penalties/late fees. isBusinessExp = true if it looks like a business purchase.`,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${input.mimeType};base64,${input.fileBase64}`,
                  },
                },
              ],
            },
          ],
        });

        const rawText = response.choices[0]?.message.content;
        if (!rawText) throw new Error("AI returned empty response");

        const parsed = ReceiptExtractionSchema.parse(JSON.parse(rawText));

        // 4. Calculate GST Input Tax Credit
        //    ITC is claimable only on business expenses; credit = full tax paid
        const gstCredit = parsed.isBusinessExp ? parsed.tax : 0;

        // 5. Anomaly detection — flag if total > 3× category average for this user
        const avgResult = await ctx.db
          .select({
            avg: sql<string>`AVG(CAST(total AS DECIMAL(12,2)))`,
          })
          .from(receipts)
          .where(
            and(
              eq(receipts.userId, ctx.session.user.id),
              eq(receipts.category, parsed.category),
              eq(receipts.status, "done"),
            ),
          );

        const categoryAvg = parseFloat(avgResult[0]?.avg ?? "0");
        const isAnomalous =
          categoryAvg > 0 && parsed.total > categoryAvg * 3;
        const flagReason = isAnomalous
          ? `₹${parsed.total.toFixed(0)} exceeds 3× the ${parsed.category} average (₹${categoryAvg.toFixed(0)})`
          : null;

        // 6. Persist everything in a transaction
        await ctx.db.transaction(async (tx) => {
          await tx
            .update(receipts)
            .set({
              merchant: parsed.merchant,
              date: parsed.date ? new Date(parsed.date) : null,
              category: parsed.category,
              subtotal: parsed.subtotal.toString(),
              tax: parsed.tax.toString(),
              fees: parsed.fees.toString(),
              fines: parsed.fines.toString(),
              total: parsed.total.toString(),
              currency: parsed.currency,
              isBusinessExp: parsed.isBusinessExp,
              gstRate: parsed.gstRate?.toString() ?? null,
              gstCredit: gstCredit.toString(),
              flagged: isAnomalous,
              flagReason,
              status: "done",
            })
            .where(eq(receipts.id, receiptRecord.id));

          if (parsed.items.length > 0) {
            await tx.insert(lineItems).values(
              parsed.items.map((item) => ({
                receiptId: receiptRecord.id,
                name: item.name,
                quantity: item.quantity,
                price: item.price.toString(),
              })),
            );
          }
        });

        // 7. Return full record with items
        return ctx.db.query.receipts.findFirst({
          where: eq(receipts.id, receiptRecord.id),
          with: { items: true },
        });
      } catch (error) {
        console.error("AI extraction failed:", error);
        await ctx.db
          .update(receipts)
          .set({ status: "failed" })
          .where(eq(receipts.id, receiptRecord.id));
        throw new Error("AI extraction failed. Receipt saved, try re-scanning.");
      }
    }),

  // ── getAll ────────────────────────────────────────────────────────────────
  getAll: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const { desc } = await import("drizzle-orm");
      return ctx.db.query.receipts.findMany({
        where: eq(receipts.userId, ctx.session.user.id),
        orderBy: desc(receipts.createdAt),
        limit: input?.limit ?? 50,
        with: { items: true },
      });
    }),

  // ── getById ───────────────────────────────────────────────────────────────
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

  // ── delete ────────────────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db
        .delete(receipts)
        .where(
          and(
            eq(receipts.id, input.id),
            eq(receipts.userId, ctx.session.user.id),
          ),
        );
    }),

  // ── updateBusinessFlag (manual override) ─────────────────────────────────
  setBusinessExp: protectedProcedure
    .input(z.object({ id: z.string(), isBusinessExp: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Recalculate ITC based on new flag
      const receipt = await ctx.db.query.receipts.findFirst({
        where: and(
          eq(receipts.id, input.id),
          eq(receipts.userId, ctx.session.user.id),
        ),
      });
      if (!receipt) throw new Error("Receipt not found");

      const tax = parseFloat(receipt.tax ?? "0");
      const gstCredit = input.isBusinessExp ? tax : 0;

      const [updated] = await ctx.db
        .update(receipts)
        .set({ isBusinessExp: input.isBusinessExp, gstCredit: gstCredit.toString() })
        .where(eq(receipts.id, input.id))
        .returning();
      return updated;
    }),
});