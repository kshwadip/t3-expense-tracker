import { z } from "zod";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { receipts, lineItems } from "~/server/db/schema";
import { uploadReceiptImage, deleteReceiptImage } from "~/lib/supabase";
import { aiUploadLimiter, MAX_AI_UPLOADS_PER_HOUR } from "~/server/lib/rate-limit";
import OpenAI from "openai";

// Initialize Groq using the OpenAI SDK architecture
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const ReceiptExtractionSchema = z.object({
  merchant: z.string(),
  date: z.string().nullable(),
  category: z.enum([
    "Food & Dining", "Groceries", "Transport", "Healthcare",
    "Shopping", "Entertainment", "Utilities", "Taxes & Fees", "Other",
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

// CSV helpers
const CSV_HEADERS = [
  "Date",
  "Merchant",
  "Category",
  "Subtotal (INR)",
  "GST Rate (%)",
  "GST Amount (INR)",
  "Fees (INR)",
  "Fines (INR)",
  "Total (INR)",
  "Currency",
  "Business Expense",
  "ITC Claimable (INR)",
  "Flagged",
  "Flag Reason",
];

function escapeCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

export const receiptsRouter = createTRPCRouter({
  upload: protectedProcedure
    .input(
      z.object({
        fileName: z.string(),
        mimeType: z.string(),
        fileBase64: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // ── Rate limit check ────────────────────────────────────────────────
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
        buffer,
        input.fileName,
        input.mimeType,
        ctx.session.user.id,
      );

      // ── Create receipt row in DB ────────────────────────────────────────
      const [receiptRecord] = await ctx.db
        .insert(receipts)
        .values({ userId: ctx.session.user.id, imageUrl, status: "processing" })
        .returning();

      if (!receiptRecord) throw new Error("Failed to initialize receipt log");

      try {
        // ── Groq Vision extraction ────────────────────────────────────────
        const response = await groq.chat.completions.create({
          model: "meta-llama/llama-4-scout-17b-16e-instruct",
          response_format: { type: "json_object" },
          messages: [
            {
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
                    "subtotal": number,
                    "tax": number,
                    "fees": number,
                    "fines": number,
                    "total": number,
                    "currency": string,
                    "isBusinessExp": boolean,
                    "gstRate": number
                  }`,
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

        const rawJsonText = response.choices[0]?.message.content;
        if (!rawJsonText) throw new Error("AI returned empty response");

        const validatedData = ReceiptExtractionSchema.parse(
          JSON.parse(rawJsonText),
        );
        const gstCredit = validatedData.isBusinessExp ? validatedData.tax : 0;

        await ctx.db.transaction(async (tx) => {
          await tx
            .update(receipts)
            .set({
              merchant: validatedData.merchant,
              date: validatedData.date ? new Date(validatedData.date) : null,
              category: validatedData.category,
              subtotal: validatedData.subtotal.toString(),
              tax: validatedData.tax.toString(),
              fees: validatedData.fees.toString(),
              fines: validatedData.fines.toString(),
              total: validatedData.total.toString(),
              currency: validatedData.currency,
              isBusinessExp: validatedData.isBusinessExp,
              gstRate: validatedData.gstRate
                ? validatedData.gstRate.toString()
                : null,
              gstCredit: gstCredit.toString(),
              status: "done",
            })
            .where(eq(receipts.id, receiptRecord.id));

          if (validatedData.items.length > 0) {
            await tx.insert(lineItems).values(
              validatedData.items.map((item) => ({
                receiptId: receiptRecord.id,
                name: item.name,
                quantity: item.quantity,
                price: item.price.toString(),
              })),
            );
          }
        });

        return await ctx.db.query.receipts.findFirst({
          where: eq(receipts.id, receiptRecord.id),
          with: { items: true },
        });
      } catch (error) {
        console.error("AI Extraction Failed:", error);
        await ctx.db
          .update(receipts)
          .set({ status: "failed" })
          .where(eq(receipts.id, receiptRecord.id));
        throw new Error("AI extraction failed.");
      }
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
      // Fetch first to get the imageUrl before deleting the row
      const receipt = await ctx.db.query.receipts.findFirst({
        where: and(
          eq(receipts.id, input.id),
          eq(receipts.userId, ctx.session.user.id),
        ),
      });

      if (!receipt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Receipt not found." });
      }

      // Delete DB row (cascades to lineItems via FK)
      await ctx.db
        .delete(receipts)
        .where(
          and(
            eq(receipts.id, input.id),
            eq(receipts.userId, ctx.session.user.id),
          ),
        );

      // Delete image from Supabase Storage — fire after DB so a failed
      // storage delete never orphans the DB row
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

      const gstCredit = input.isBusinessExp
        ? parseFloat(receipt.tax ?? "0")
        : 0;

      const [updated] = await ctx.db
        .update(receipts)
        .set({
          isBusinessExp: input.isBusinessExp,
          gstCredit: gstCredit.toString(),
        })
        .where(eq(receipts.id, input.id))
        .returning();

      return updated;
    }),

  exportCsv: protectedProcedure
    .input(
      z.object({
        startDate: z.string().optional(), // "YYYY-MM-DD"
        endDate: z.string().optional(),   // "YYYY-MM-DD"
        businessOnly: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(receipts.userId, ctx.session.user.id),
        eq(receipts.status, "done"),
      ];

      if (input.startDate) {
        conditions.push(gte(receipts.date, new Date(input.startDate)));
      }
      if (input.endDate) {
        const end = new Date(input.endDate);
        end.setHours(23, 59, 59, 999);
        conditions.push(lte(receipts.date, end));
      }
      if (input.businessOnly) {
        conditions.push(eq(receipts.isBusinessExp, true));
      }

      const rows = await ctx.db.query.receipts.findMany({
        where: and(...conditions),
        orderBy: asc(receipts.date),
      });

      const dataRows = rows.map((r) =>
        [
          r.date ? r.date.toISOString().split("T")[0] : "",
          r.merchant ?? "",
          r.category ?? "",
          r.subtotal ?? "0",
          r.gstRate ?? "0",
          r.tax ?? "0",
          r.fees ?? "0",
          r.fines ?? "0",
          r.total ?? "0",
          r.currency,
          r.isBusinessExp ? "Yes" : "No",
          r.gstCredit ?? "0",
          r.flagged ? "Yes" : "No",
          r.flagReason ?? "",
        ]
          .map(String)
          .map(escapeCell)
          .join(","),
      );

      const csv = [
        CSV_HEADERS.map(escapeCell).join(","),
        ...dataRows,
      ].join("\n");

      return { csv, count: rows.length };
    }),
});