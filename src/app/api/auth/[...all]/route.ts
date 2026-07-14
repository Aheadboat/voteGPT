import { toNextJsHandler } from "better-auth/next-js";
import { getRuntimeAuth } from "@/lib/auth";

const handlers = toNextJsHandler(async (request) =>
  (await getRuntimeAuth()).handler(request),
);

export const { GET, POST } = handlers;
