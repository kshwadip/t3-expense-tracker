import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { userProfiles } from "~/server/db/schema";

const CATEGORIES = [
  "Food & Dining",
  "Groceries",
  "Transport",
  "Healthcare",
  "Shopping",
  "Entertainment",
  "Utilities",
  "Taxes & Fees",
  "Other",
] as const;

export const profileRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const profile = await ctx.db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, ctx.session.user.id),
    });
    if (!profile) {
      return {
        id: "",
        userId: ctx.session.user.id,
        profession: "",
        taxRegime: "new" as const,
        monthlyBudgets: {} as Record<string, number>,
      };
    }

    return profile;
  }),

  upsert: protectedProcedure
    .input(
      z.object({
        profession: z.string().optional(),
        taxRegime: z.enum(["old", "new"]).default("new"),
        monthlyBudgets: z
          .record(z.enum(CATEGORIES), z.number().min(0))
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.userProfiles.findFirst({
        where: eq(userProfiles.userId, ctx.session.user.id),
      });

      const payload = {
        profession: input.profession ?? null,
        taxRegime: input.taxRegime,
        monthlyBudgets: (input.monthlyBudgets as Record<string, number>) ?? null,
      };

      if (existing) {
        const [updated] = await ctx.db
          .update(userProfiles)
          .set(payload)
          .where(eq(userProfiles.userId, ctx.session.user.id))
          .returning();
        return updated;
      }

      const [created] = await ctx.db
        .insert(userProfiles)
        .values({ userId: ctx.session.user.id, ...payload })
        .returning();
      return created;
    }),
});