import { getRuntimeAuth } from "@/lib/auth";
import { readBoundedJson } from "@/lib/bounded-json";
import {
  areAddressSuggestionsConfigured,
  lookupAddressSuggestions,
} from "@/lib/address-suggestions";
import {
  ADDRESS_SUGGESTION_MIN_LENGTH,
  type AddressSuggestionResponse,
} from "@/lib/address-suggestions-contract";

const bodyByteLimit = 2_048;
const rateWindowMilliseconds = 60_000;
const requestsPerWindow = 30;
const maximumTrackedUsers = 1_000;
// Instance-local abuse protection: no address, query, IP, or session token is
// retained. A shared deployment still needs an operator-level aggregate cap.
const usage = new Map<string, { count: number; resetAt: number }>();

const errors = {
  invalid_request: "Enter at least four characters of an address and try again.",
  forbidden: "This address suggestion request was not accepted.",
  unauthenticated: "Sign in again before searching for an address.",
  unavailable: "Address suggestions are temporarily unavailable. You can still enter an address manually.",
  rate_limited: "Too many address searches. Wait a moment and try again, or enter an address manually.",
} as const;

export async function POST(request: Request): Promise<Response> {
  if (!hasSameOrigin(request)) return failure("forbidden", 403);
  if (
    request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !==
    "application/json"
  ) return failure("invalid_request", 400);

  const body = await readBoundedJson(request, bodyByteLimit);
  if (
    typeof body !== "object" || body === null || Array.isArray(body) ||
    Object.keys(body).some((key) => key !== "query" && key !== "consent") ||
    !("query" in body) || typeof body.query !== "string" ||
    body.query.trim().length < ADDRESS_SUGGESTION_MIN_LENGTH ||
    body.query.length > 300 || /[\p{Cc}\p{Cf}]/u.test(body.query)
  ) return failure("invalid_request", 400);
  if (!("consent" in body) || body.consent !== true) return failure("forbidden", 403);

  let userId: string;
  try {
    const auth = await getRuntimeAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    if (
      typeof session?.user?.id !== "string" ||
      !session.user.id || session.user.id.length > 200
    ) return failure("unauthenticated", 401);
    userId = session.user.id;
  } catch {
    return failure("unavailable", 503);
  }

  if (!areAddressSuggestionsConfigured()) return failure("unavailable", 503);
  const retryAfter = consumeQuota(userId);
  if (retryAfter !== null) {
    return privateJson(
      { status: "rate_limited", message: errors.rate_limited },
      429,
      { "Retry-After": String(retryAfter) },
    );
  }

  const result = await lookupAddressSuggestions(body.query, { signal: request.signal });
  return privateJson(result, result.status === "ok" ? 200 : 503);
}

function hasSameOrigin(request: Request): boolean {
  const configured = process.env.BETTER_AUTH_URL;
  const origin = request.headers.get("origin");
  if (!configured || !origin) return false;
  try {
    return origin === new URL(configured).origin;
  } catch {
    return false;
  }
}

function consumeQuota(userId: string): number | null {
  const now = Date.now();
  for (const [id, entry] of usage) {
    if (entry.resetAt <= now) usage.delete(id);
  }
  const existing = usage.get(userId);
  if (existing) {
    if (existing.count >= requestsPerWindow) {
      return Math.max(1, Math.ceil((existing.resetAt - now) / 1_000));
    }
    existing.count += 1;
    return null;
  }
  // Never evict a live quota to admit a new user and thereby bypass limits.
  if (usage.size >= maximumTrackedUsers) return rateWindowMilliseconds / 1_000;
  usage.set(userId, { count: 1, resetAt: now + rateWindowMilliseconds });
  return null;
}

function failure(status: keyof typeof errors, code: number): Response {
  return privateJson({ status, message: errors[status] }, code);
}

function privateJson(
  body: AddressSuggestionResponse,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return Response.json(body, {
    status,
    headers: { ...headers, "Cache-Control": "private, no-store" },
  });
}
