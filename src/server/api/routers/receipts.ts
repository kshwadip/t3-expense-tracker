import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { receipts, lineItems } from "~/server/db/schema";
import { uploadReceiptImage } from "~/lib/supabase";

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
        buffer,
        input.fileName,
        input.mimeType,
        ctx.session.user.id,
      );
      const [receipt] = await ctx.db
        .insert(receipts)
        .values({
          userId: ctx.session.user.id,
          imageUrl,
          status: "processing",
        })
        .returning();
      return receipt;
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
      return ctx.db
        .delete(receipts)
        .where(and(
          eq(receipts.id, input.id),
          eq(receipts.userId, ctx.session.user.id),
        ));
    }),
});
