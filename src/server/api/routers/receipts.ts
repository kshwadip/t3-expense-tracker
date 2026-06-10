import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { receipts, lineItems } from "~/server/db/schema";
import { uploadReceiptImage } from "~/lib/supabase";
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
    "Shopping", "Entertainment", "Utilities", "Taxes & Fees", "Other"
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

export const receiptsRouter = createTRPCRouter({
  upload: protectedProcedure
    .input(z.object({
      fileName: z.string(),
      mimeType: z.string(),
      fileBase64: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const imageUrl = await uploadReceiptImage(
        buffer, input.fileName, input.mimeType, ctx.session.user.id,
      );

      const [receiptRecord] = await ctx.db
        .insert(receipts)
        .values({ userId: ctx.session.user.id, imageUrl, status: "processing" })
        .returning();

      if (!receiptRecord) throw new Error("Failed to initialize receipt log");

      try {
        // Use Groq's super-fast Llama 3 vision model
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
                  }` 
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

        const validatedData = ReceiptExtractionSchema.parse(JSON.parse(rawJsonText));

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
              gstRate: validatedData.gstRate ? validatedData.gstRate.toString() : null,
              gstCredit: gstCredit.toString(),
              status: "done",
            })
            .where(eq(receipts.id, receiptRecord.id));

          if (validatedData.items.length > 0) {
            const lineItemsToInsert = validatedData.items.map((item) => ({
              receiptId: receiptRecord.id,
              name: item.name,
              quantity: item.quantity,
              price: item.price.toString(),
            }));
            await tx.insert(lineItems).values(lineItemsToInsert);
          }
        });

        return await ctx.db.query.receipts.findFirst({
          where: eq(receipts.id, receiptRecord.id),
          with: { items: true }
        });

      } catch (error) {
        console.error("AI Extraction Failed:", error);
        await ctx.db.update(receipts).set({ status: "failed" }).where(eq(receipts.id, receiptRecord.id));
        throw new Error("AI extraction failed.");
      }
    }),

  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.receipts.findMany({
      where: eq(receipts.userId, ctx.session.user.id),
      orderBy: desc(receipts.createdAt),
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
      await ctx.db
        .delete(receipts)
        .where(
          and(
            eq(receipts.id, input.id),
            eq(receipts.userId, ctx.session.user.id),
          ),
        );
    }),
});