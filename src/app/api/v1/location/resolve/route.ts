import { getRuntimeAuth } from "@/lib/auth";
import {
  createResolutionToken,
  parseResidenceInput,
  resolveResidence,
  verifyResolutionToken,
  type ResolutionErrorResponse,
  type ResolutionResponse,
} from "@/lib/residence";

const invalidRequest: ResolutionErrorResponse = {
  status: "invalid_request",
  message: "Enter a valid residence and try again.",
};
const unauthenticated: ResolutionErrorResponse = {
  status: "unauthenticated",
  message: "Sign in again before checking a residence.",
};
const forbidden: ResolutionErrorResponse = {
  status: "forbidden",
  message: "This residence request was not accepted.",
};
const unavailable: ResolutionErrorResponse = {
  status: "unavailable",
  message: "Residence matching is temporarily unavailable. Try again later.",
};

export async function POST(request: Request): Promise<Response> {
  if (!hasSameOrigin(request)) {
    return privateJson(forbidden, 403);
  }
  if (!hasJsonContentType(request)) {
    return privateJson(invalidRequest, 400);
  }

  let authenticatedUserId: string;
  try {
    const auth = await getRuntimeAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session || typeof session.user.id !== "string" || !session.user.id) {
      return privateJson(unauthenticated, 401);
    }
    authenticatedUserId = session.user.id;
  } catch {
    return privateJson(unavailable, 503);
  }

  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    return privateJson(unavailable, 503);
  }

  const body = await request.json().catch(() => null);
  const input = parseResidenceInput(body);
  if (!input) {
    return privateJson(invalidRequest, 400);
  }

  try {
    const outcome = await resolveResidence(input);
    if (outcome.status === "matched" || outcome.status === "partial") {
      const issuedAt = new Date();
      const token = createResolutionToken(
        outcome,
        authenticatedUserId,
        secret,
        issuedAt,
      );
      const canonicalOutcome = verifyResolutionToken(
        token.resolutionToken,
        authenticatedUserId,
        secret,
        issuedAt,
      );
      if (!canonicalOutcome) {
        return privateJson(unavailable, 503);
      }
      const response: ResolutionResponse = { ...canonicalOutcome, ...token };
      return privateJson(response, 200);
    }
    if (outcome.status === "no_match") {
      const response: ResolutionResponse = {
        status: "no_match",
        message: "We could not match that residence. Check it and try again.",
      };
      return privateJson(response, 200);
    }
    if (outcome.status === "ambiguous") {
      const response: ResolutionResponse = {
        status: "ambiguous",
        message: "That residence matched more than one place. Add more detail.",
      };
      return privateJson(response, 200);
    }
    return privateJson(unavailable, 503);
  } catch {
    return privateJson(unavailable, 503);
  }
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

function privateJson(
  body: ResolutionResponse | ResolutionErrorResponse,
  status: number,
) {
  return Response.json(body, {
    headers: { "Cache-Control": "private, no-store" },
    status,
  });
}
