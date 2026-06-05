import { receiptsRouter } from "~/server/api/routers/receipts";
import { profileRouter } from "~/server/api/routers/profile";
import { analyticsRouter } from "~/server/api/routers/analytics";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
  receipts: receiptsRouter,
  profile: profileRouter,
  analytics: analyticsRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);