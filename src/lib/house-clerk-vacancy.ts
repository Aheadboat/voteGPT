import type {
  FetchCurrentHouseVacancies,
  ProviderFailure,
  SourceRef,
} from "./federal-officials";

const clerkOrigin = "https://clerk.house.gov";
const vacancyListUrl = `${clerkOrigin}/Members/ViewVacancies`;
const timeoutMilliseconds = 5_000;
const maximumBodyBytes = 1024 * 1024;
const jurisdictionCodes = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC", "AS", "GU", "MP", "PR", "VI",
]);

type RelevantTag = {
  name: "a" | `h${1 | 2 | 3 | 4 | 5 | 6}`;
  start: number;
  end: number;
  opening: string;
  content: string;
};

export const fetchCurrentHouseVacancies: FetchCurrentHouseVacancies = async (
  currentCongress,
  { fetch, now },
) => {
  const retrievedAtDate = now();
  if (
    !Number.isInteger(currentCongress) ||
    currentCongress < 1 ||
    !Number.isFinite(retrievedAtDate.getTime())
  ) {
    return unavailable("malformed");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
  try {
    const response = await fetch(vacancyListUrl, {
      method: "GET",
      headers: { Accept: "text/html" },
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.redirected || !response.ok) {
      return unavailable(
        response.redirected ? "provider_error" : failureFromStatus(response.status),
      );
    }
    const contentType = response.headers.get("content-type")?.toLowerCase();
    if (!contentType || !/^text\/html(?:\s*;|$)/.test(contentType)) {
      return unavailable("malformed");
    }

    const body = await readBody(response, controller.signal);
    if (body.status === "failure") {
      return unavailable(body.reason);
    }
    const parsed = parseVacancies(body.html, currentCongress);
    if (parsed === null) {
      return unavailable("malformed");
    }

    const retrievedAt = retrievedAtDate.toISOString();
    const source = vacancySource(vacancyListUrl, retrievedAt);
    return {
      status: "available",
      currentCongress,
      source,
      vacancies: parsed.map(({ stateCode, district, url }) => ({
        stateCode,
        district,
        source: vacancySource(url, retrievedAt),
      })),
    };
  } catch (error) {
    return unavailable(
      controller.signal.aborted || isAbortError(error)
        ? "timeout"
        : "provider_error",
    );
  } finally {
    clearTimeout(timeout);
  }
};

async function readBody(
  response: Response,
  signal: AbortSignal,
): Promise<
  | { status: "ok"; html: string }
  | { status: "failure"; reason: "malformed" | "provider_error" | "timeout" }
> {
  if (response.body === null) {
    return { status: "failure", reason: "malformed" };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteCount = 0;
  let html = "";
  try {
    while (true) {
      const chunk = await readChunk(reader, signal);
      if (chunk.done) {
        html += decoder.decode();
        return { status: "ok", html };
      }
      byteCount += chunk.value.byteLength;
      if (byteCount > maximumBodyBytes) {
        await reader.cancel();
        return { status: "failure", reason: "malformed" };
      }
      html += decoder.decode(chunk.value, { stream: true });
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    return {
      status: "failure",
      reason:
        signal.aborted || isAbortError(error) ? "timeout" : "provider_error",
    };
  } finally {
    reader.releaseLock();
  }
}

function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
) {
  if (signal.aborted) {
    return Promise.reject(new DOMException("Request timed out.", "AbortError"));
  }
  return new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
    const abort = () => reject(new DOMException("Request timed out.", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    reader.read().then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
}

function parseVacancies(html: string, currentCongress: number) {
  const tags = relevantTags(html);
  if (tags === null) {
    return null;
  }

  const headings: Array<RelevantTag & { congress: number }> = [];
  for (const tag of tags.filter(({ name }) => name !== "a")) {
    const text = plainText(tag.content);
    if (!text.startsWith("Vacancies of the ")) {
      continue;
    }
    const match = /^Vacancies of the (\d+)(st|nd|rd|th) Congress$/.exec(text);
    if (
      !match ||
      Number(match[1]) < 1 ||
      match[2] !== ordinalSuffix(Number(match[1]))
    ) {
      return null;
    }
    headings.push({ ...tag, congress: Number(match[1]) });
  }

  const currentHeadings = headings.filter(
    ({ congress }) => congress === currentCongress,
  );
  if (currentHeadings.length !== 1) {
    return null;
  }
  const currentHeading = currentHeadings[0];
  const nextHeading = headings.find(({ start }) => start > currentHeading.start);
  const contentEnd = nextHeading?.start ?? html.length;
  const activeLinks = tags.filter(
    ({ name, start }) =>
      name === "a" && start >= currentHeading.end && start < contentEnd,
  );

  const vacancies: Array<{ stateCode: string; district: number; url: string }> = [];
  const seenSeats = new Set<string>();
  for (const link of activeLinks) {
    const hrefs = quotedAttributes(link.opening, "href");
    const possibleVacancy =
      link.opening.toLowerCase().includes("vacancy") ||
      plainText(link.content).toLowerCase().includes("vacancy");
    if (!possibleVacancy) {
      continue;
    }
    if (hrefs.length !== 1) {
      return null;
    }
    const parsed = canonicalVacancyLink(hrefs[0]);
    if (parsed === null || seenSeats.has(`${parsed.stateCode}:${parsed.district}`)) {
      return null;
    }
    seenSeats.add(`${parsed.stateCode}:${parsed.district}`);
    vacancies.push(parsed);
  }
  return vacancies;
}

function relevantTags(html: string): RelevantTag[] | null {
  const tokenPattern = /<!--[\s\S]*?-->|<\/?(?:a|h[1-6])\b[^>]*>/gi;
  const rawTagPattern = /<\/?(?:a|h[1-6])(?=[\s>])/gi;
  const tokens = [...html.matchAll(tokenPattern)].filter(
    ([token]) => !token.startsWith("<!--"),
  );
  if ([...html.matchAll(rawTagPattern)].length !== tokens.length) {
    return null;
  }

  const completed: RelevantTag[] = [];
  let open:
    | { name: RelevantTag["name"]; start: number; end: number; opening: string }
    | null = null;
  for (const token of tokens) {
    const raw = token[0];
    const nameMatch = /^<\/?(a|h[1-6])\b/i.exec(raw);
    const start = token.index;
    if (!nameMatch || start === undefined) {
      return null;
    }
    const name = nameMatch[1].toLowerCase() as RelevantTag["name"];
    if (/^<\//.test(raw)) {
      if (open === null || open.name !== name) {
        return null;
      }
      completed.push({
        ...open,
        content: html.slice(open.end, start),
      });
      open = null;
    } else {
      if (open !== null || /\/\s*>$/.test(raw)) {
        return null;
      }
      open = { name, start, end: start + raw.length, opening: raw };
    }
  }
  return open === null ? completed : null;
}

function canonicalVacancyLink(href: string) {
  let url: URL;
  try {
    url = new URL(href, clerkOrigin);
  } catch {
    return null;
  }
  const match = /^\/members\/([A-Z]{2})(00|0[1-9]|[1-9][0-9])\/vacancy$/.exec(
    url.pathname,
  );
  const canonicalHref = href.startsWith("/") ? url.pathname : url.toString();
  if (
    !match ||
    !jurisdictionCodes.has(match[1]) ||
    url.origin !== clerkOrigin ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    href !== canonicalHref
  ) {
    return null;
  }
  return {
    stateCode: match[1],
    district: match[2] === "00" ? 0 : Number(match[2]),
    url: url.toString(),
  };
}

function quotedAttributes(openingTag: string, name: string) {
  const matches = [
    ...openingTag.matchAll(
      new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "gi"),
    ),
  ];
  return matches.map((match) => match[1] ?? match[2]);
}

function plainText(html: string) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function ordinalSuffix(value: number) {
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 13) {
    return "th";
  }
  return value % 10 === 1
    ? "st"
    : value % 10 === 2
      ? "nd"
      : value % 10 === 3
        ? "rd"
        : "th";
}

function vacancySource(url: string, retrievedAt: string): SourceRef {
  return {
    publisher: "Office of the Clerk, U.S. House of Representatives",
    sourceType: "vacancy",
    url,
    retrievedAt,
    recordUpdatedAt: null,
    effectiveAt: null,
  };
}

function failureFromStatus(status: number): ProviderFailure {
  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status === 404) {
    return "not_found";
  }
  if (status === 429) {
    return "quota";
  }
  return "provider_error";
}

function unavailable(reason: ProviderFailure) {
  return { status: "unavailable" as const, reason };
}

function isAbortError(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    value.name === "AbortError"
  );
}
