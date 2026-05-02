import { postRouter } from "~/server/api/routers/post";
import { receiptsRouter } from "~/server/api/routers/receipts";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
  post: postRouter,
  receipts: receiptsRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
