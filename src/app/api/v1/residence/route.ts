import { getRuntimeAuth } from "@/lib/auth";
import { readBoundedJson } from "@/lib/bounded-json";
import { verifyResolutionToken } from "@/lib/residence";
import { SAVED_RESIDENCE_BODY_CAP_BYTES } from "@/lib/residence-policy";
import {
  deleteSavedResidence,
  getSavedResidence,
  parseSaveResidenceRequest,
  SAVED_RESIDENCE_ERROR_MESSAGES,
  saveSavedResidence,
} from "@/lib/saved-residence";

const invalidRequest = {
  status: "invalid_request",
  message: SAVED_RESIDENCE_ERROR_MESSAGES.invalid_request,
} as const;
const unauthenticated = {
  status: "unauthenticated",
  message: SAVED_RESIDENCE_ERROR_MESSAGES.unauthenticated,
} as const;
const forbidden = {
  status: "forbidden",
  message: SAVED_RESIDENCE_ERROR_MESSAGES.forbidden,
} as const;
const invalidToken = {
  status: "invalid_token",
  message: SAVED_RESIDENCE_ERROR_MESSAGES.invalid_token,
} as const;
const unavailable = {
  status: "unavailable",
  message: SAVED_RESIDENCE_ERROR_MESSAGES.unavailable,
} as const;

export async function GET(request: Request): Promise<Response> {
  const userId = await currentUserId(request).catch(() => undefined);
  if (userId === undefined) {
    return privateJson(unavailable, 503);
  }
  if (userId === null) {
    return privateJson(unauthenticated, 401);
  }

  try {
    const residence = await getSavedResidence(userId);
    return privateJson(
      residence === null
        ? { status: "empty" }
        : { status: "saved", residence },
      200,
    );
  } catch {
    return privateJson(unavailable, 503);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!hasSameOrigin(request)) {
    return privateJson(forbidden, 403);
  }
  if (!hasJsonContentType(request)) {
    return privateJson(invalidRequest, 400);
  }

  const userId = await currentUserId(request).catch(() => undefined);
  if (userId === undefined) {
    return privateJson(unavailable, 503);
  }
  if (userId === null) {
    return privateJson(unauthenticated, 401);
  }

  const body = parseSaveResidenceRequest(
    await readBoundedJson(request, SAVED_RESIDENCE_BODY_CAP_BYTES),
  );
  if (body === null) {
    return privateJson(invalidRequest, 400);
  }

  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    return privateJson(unavailable, 503);
  }
  const verifiedResolution = verifyResolutionToken(
    body.resolutionToken,
    userId,
    { kind: "address", address: body.address },
    secret,
    new Date(),
  );
  if (verifiedResolution === null) {
    return privateJson(invalidToken, 422);
  }

  try {
    const saved = await saveSavedResidence(
      userId,
      body,
      verifiedResolution,
      new Date(),
    );
    return privateJson({ status: "saved", ...saved }, 200);
  } catch {
    return privateJson(unavailable, 503);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  if (!hasSameOrigin(request)) {
    return privateJson(forbidden, 403);
  }
  if (!hasJsonContentType(request)) {
    return privateJson(invalidRequest, 400);
  }

  const userId = await currentUserId(request).catch(() => undefined);
  if (userId === undefined) {
    return privateJson(unavailable, 503);
  }
  if (userId === null) {
    return privateJson(unauthenticated, 401);
  }

  const body = await request.json().catch(() => null);
  if (!isDeleteRequest(body)) {
    return privateJson(invalidRequest, 400);
  }

  try {
    const deleted = await deleteSavedResidence(userId);
    return privateJson({ status: deleted ? "deleted" : "empty" }, 200);
  } catch {
    return privateJson(unavailable, 503);
  }
}

async function currentUserId(request: Request) {
  const auth = await getRuntimeAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user.id;
  return typeof userId === "string" && userId.trim() ? userId : null;
}

function hasSameOrigin(request: Request) {
  const configuredUrl = process.env.BETTER_AUTH_URL;
  const requestOrigin = request.headers.get("origin");
  if (!configuredUrl || !requestOrigin) {
    return false;
  }

  try {
    return requestOrigin === new URL(configuredUrl).origin;
  } catch {
    return false;
  }
}

function hasJsonContentType(request: Request) {
  return (
    request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ===
    "application/json"
  );
}

function isDeleteRequest(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const body = value as Record<string, unknown>;
  return (
    Object.keys(body).length === 1 &&
    body.confirmation === "DELETE_SAVED_RESIDENCE"
  );
}

function privateJson(body: unknown, status: number) {
  return Response.json(body, {
    headers: { "Cache-Control": "private, no-store" },
    status,
  });
}
