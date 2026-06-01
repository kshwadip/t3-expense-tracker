import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { receipts, lineItems } from "~/server/db/schema";
import { uploadReceiptImage } from "~/lib/supabase";
import { GoogleGenAI, Type } from "@google/genai";

// Initialize the Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Zod schema for compile-time and runtime confirmation
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
      // 1. Upload to Supabase Storage
      const buffer = Buffer.from(input.fileBase64, "base64");
      const imageUrl = await uploadReceiptImage(
        buffer, input.fileName, input.mimeType, ctx.session.user.id,
      );

      // 2. Insert initial processing record into DB
      const [receiptRecord] = await ctx.db
        .insert(receipts)
        .values({ 
          userId: ctx.session.user.id, 
          imageUrl, 
          status: "processing" 
        })
        .returning();

      if (!receiptRecord) throw new Error("Failed to initialize receipt log");

      try {
        // 3. Request structured extraction from Gemini
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash", // Using the latest high-speed, cost-effective vision model
          contents: [
            {
              inlineData: {
                mimeType: input.mimeType,
                data: input.fileBase64
              }
            },
            "Analyze this receipt image. Extract all data fields required by the schema accurately."
          ],
          config: {
            responseMimeType: "application/json",
            // Passing down a strict Type definition for Gemini's structured output
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                merchant: { type: Type.STRING },
                date: { type: Type.STRING, description: "YYYY-MM-DD or null" },
                category: { 
                  type: Type.STRING, 
                  enum: ["Food & Dining", "Groceries", "Transport", "Healthcare", "Shopping", "Entertainment", "Utilities", "Taxes & Fees", "Other"] 
                },
                items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      quantity: { type: Type.INTEGER },
                      price: { type: Type.NUMBER }
                    },
                    required: ["name", "quantity", "price"]
                  }
                },
                subtotal: { type: Type.NUMBER },
                tax: { type: Type.NUMBER },
                fees: { type: Type.NUMBER },
                fines: { type: Type.NUMBER },
                total: { type: Type.NUMBER },
                currency: { type: Type.STRING },
                isBusinessExp: { type: Type.BOOLEAN },
                gstRate: { type: Type.INTEGER, description: "Percentage value like 5, 12, 18, 28 or null" }
              },
              required: [
                "merchant", "date", "category", "items", "subtotal", 
                "tax", "fees", "fines", "total", "currency", "isBusinessExp", "gstRate"
              ]
            }
          }
        });

        const rawJsonText = response.text;
        if (!rawJsonText) throw new Error("Gemini returned an empty response");

        // 4. Validate output with Zod
        const validatedData = ReceiptExtractionSchema.parse(JSON.parse(rawJsonText));

        // 5. Update receipt record and write line items inside a database transaction
        await ctx.db.transaction(async (tx) => {
          await tx
            .update(receipts)
            .set({
              merchant: validatedData.merchant,
              date: validatedData.date ? new Date(validatedData.date) : null, // Convert string to Date if your schema requires it
              category: validatedData.category,
              subtotal: validatedData.subtotal.toString(), // casting depending on whether your DB uses numeric string decimals
              tax: validatedData.tax.toString(),
              fees: validatedData.fees.toString(),
              fines: validatedData.fines.toString(),
              total: validatedData.total.toString(),
              currency: validatedData.currency,
              isBusinessExp: validatedData.isBusinessExp,
              gstRate: validatedData.gstRate,
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

        // Fetch complete updated receipt structure to return to client
        const finalReceipt = await ctx.db.query.receipts.findFirst({
          where: eq(receipts.id, receiptRecord.id),
          with: { items: true }
        });

        return finalReceipt;

      } catch (error) {
        console.error("AI Extraction Failed:", error);
        
        // Update status to failed so UI can handle gracefully
        await ctx.db
          .update(receipts)
          .set({ status: "failed" })
          .where(eq(receipts.id, receiptRecord.id));

        throw new Error("AI extraction failed. Saved as processing failure.");
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
        where: and(eq(receipts.id, input.id), eq(receipts.userId, ctx.session.user.id)),
        with: { items: true },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.delete(receipts)
        .where(and(eq(receipts.id, input.id), eq(receipts.userId, ctx.session.user.id)));
    }),
});