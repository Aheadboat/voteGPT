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

type RelevantName = "a" | "div" | "li" | `h${1 | 2 | 3 | 4 | 5 | 6}`;

type TagToken = {
  name: RelevantName;
  start: number;
  end: number;
  closing: boolean;
  attributes: ReadonlyMap<string, string | null>;
};

type RelevantElement = {
  name: RelevantName;
  start: number;
  openEnd: number;
  closeStart: number;
  end: number;
  attributes: ReadonlyMap<string, string | null>;
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
        cancelBestEffort(reader);
        return { status: "failure", reason: "malformed" };
      }
      html += decoder.decode(chunk.value, { stream: true });
    }
  } catch (error) {
    cancelBestEffort(reader);
    return {
      status: "failure",
      reason:
        signal.aborted || isAbortError(error) ? "timeout" : "provider_error",
    };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Cancellation is best-effort cleanup and never controls classification.
    }
  }
}

function cancelBestEffort(reader: ReadableStreamDefaultReader<Uint8Array>) {
  try {
    void reader.cancel().catch(() => undefined);
  } catch {
    // Cancellation is best-effort cleanup and never controls classification.
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
  const elements = relevantElements(html);
  if (elements === null) {
    return null;
  }

  const owners = elements.filter(
    (element) =>
      element.name === "div" &&
      hasClasses(element.attributes.get("class"), "container", "members-profile"),
  );
  if (owners.length !== 1) {
    return null;
  }
  const owner = owners[0];

  const headings: Array<RelevantElement & { congress: number }> = [];
  for (const element of elements.filter(
    (candidate) =>
      candidate.name.startsWith("h") && containedBy(candidate, owner),
  )) {
    const text = plainText(element.content);
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
    headings.push({ ...element, congress: Number(match[1]) });
  }

  const currentHeadings = headings.filter(
    ({ congress }) => congress === currentCongress,
  );
  if (currentHeadings.length !== 1) {
    return null;
  }
  const currentHeading = currentHeadings[0];
  const entries = elements.filter(
    (element) =>
      element.name === "li" &&
      element.start >= currentHeading.end &&
      containedBy(element, owner) &&
      hasClasses(element.attributes.get("class"), "vacancy_release"),
  );

  const vacancies: Array<{ stateCode: string; district: number; url: string }> = [];
  const seenSeats = new Set<string>();
  for (const entry of entries) {
    const links = elements.filter(
      (element) => element.name === "a" && containedBy(element, entry),
    );
    if (links.length === 0) {
      continue;
    }
    if (links.length !== 1) {
      return null;
    }
    const href = links[0].attributes.get("href");
    if (href === undefined || href === null) {
      return null;
    }
    const parsed = canonicalVacancyLink(href);
    if (parsed === null || seenSeats.has(`${parsed.stateCode}:${parsed.district}`)) {
      return null;
    }
    seenSeats.add(`${parsed.stateCode}:${parsed.district}`);
    vacancies.push(parsed);
  }
  return vacancies;
}

function relevantElements(html: string): RelevantElement[] | null {
  const tokens = relevantTokens(html);
  if (tokens === null) {
    return null;
  }

  const completed: RelevantElement[] = [];
  const open: TagToken[] = [];
  for (const token of tokens) {
    if (token.closing) {
      const opening = open.pop();
      if (opening === undefined || opening.name !== token.name) {
        return null;
      }
      completed.push({
        name: opening.name,
        start: opening.start,
        openEnd: opening.end,
        closeStart: token.start,
        end: token.end,
        attributes: opening.attributes,
        content: html.slice(opening.end, token.start),
      });
    } else {
      open.push(token);
    }
  }
  return open.length === 0
    ? completed.sort((left, right) => left.start - right.start)
    : null;
}

function relevantTokens(html: string): TagToken[] | null {
  const tokens: TagToken[] = [];
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf("<", cursor);
    if (start === -1) {
      break;
    }
    if (html.startsWith("<!--", start)) {
      const commentEnd = html.indexOf("-->", start + 4);
      if (commentEnd === -1) {
        return null;
      }
      cursor = commentEnd + 3;
      continue;
    }

    let nameStart = start + 1;
    const closing = html[nameStart] === "/";
    if (closing) {
      nameStart += 1;
    }
    const nameMatch = /^[A-Za-z][A-Za-z0-9]*/.exec(html.slice(nameStart));
    if (!nameMatch) {
      const declarationEnd = findTagEnd(html, start + 1);
      if (html[nameStart] === "!" || html[nameStart] === "?") {
        if (declarationEnd === null) {
          return null;
        }
        cursor = declarationEnd + 1;
      } else {
        cursor = start + 1;
      }
      continue;
    }

    const end = findTagEnd(html, nameStart + nameMatch[0].length);
    if (end === null) {
      return null;
    }
    const rawName = nameMatch[0].toLowerCase();
    const relevantName = relevantNameFrom(rawName);
    if (relevantName !== null) {
      const remainder = html.slice(nameStart + nameMatch[0].length, end);
      if (closing) {
        if (remainder.trim() !== "") {
          return null;
        }
        tokens.push({
          name: relevantName,
          start,
          end: end + 1,
          closing: true,
          attributes: new Map(),
        });
      } else {
        if (/\/\s*$/.test(remainder)) {
          return null;
        }
        const attributes = parseAttributes(remainder);
        if (attributes === null) {
          return null;
        }
        tokens.push({
          name: relevantName,
          start,
          end: end + 1,
          closing: false,
          attributes,
        });
      }
    }
    cursor = end + 1;
  }
  return tokens;
}

function findTagEnd(html: string, start: number): number | null {
  let quote: "\"" | "'" | null = null;
  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
    } else if (character === "\"" || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return null;
}

function parseAttributes(source: string): Map<string, string | null> | null {
  const attributes = new Map<string, string | null>();
  let cursor = 0;
  while (cursor < source.length) {
    while (/\s/.test(source[cursor] ?? "")) {
      cursor += 1;
    }
    if (cursor === source.length) {
      break;
    }

    const nameStart = cursor;
    while (
      cursor < source.length &&
      !/[\s"'<>\/=]/.test(source[cursor])
    ) {
      cursor += 1;
    }
    if (cursor === nameStart) {
      return null;
    }
    const name = source.slice(nameStart, cursor).toLowerCase();
    if (attributes.has(name)) {
      return null;
    }
    while (/\s/.test(source[cursor] ?? "")) {
      cursor += 1;
    }

    let value: string | null = null;
    if (source[cursor] === "=") {
      cursor += 1;
      while (/\s/.test(source[cursor] ?? "")) {
        cursor += 1;
      }
      if (cursor === source.length) {
        return null;
      }
      const quote = source[cursor];
      if (quote === "\"" || quote === "'") {
        cursor += 1;
        const valueStart = cursor;
        const valueEnd = source.indexOf(quote, cursor);
        if (valueEnd === -1) {
          return null;
        }
        value = source.slice(valueStart, valueEnd);
        cursor = valueEnd + 1;
        if (cursor < source.length && !/\s/.test(source[cursor])) {
          return null;
        }
      } else {
        const valueStart = cursor;
        while (
          cursor < source.length &&
          !/\s/.test(source[cursor])
        ) {
          if (/["'<=`>]/.test(source[cursor])) {
            return null;
          }
          cursor += 1;
        }
        if (cursor === valueStart) {
          return null;
        }
        value = source.slice(valueStart, cursor);
      }
    }
    attributes.set(name, value);
  }
  return attributes;
}

function relevantNameFrom(name: string): RelevantName | null {
  return name === "a" || name === "div" || name === "li" || /^h[1-6]$/.test(name)
    ? (name as RelevantName)
    : null;
}

function containedBy(element: RelevantElement, owner: RelevantElement) {
  return element.start >= owner.openEnd && element.end <= owner.closeStart;
}

function hasClasses(value: string | null | undefined, ...required: string[]) {
  if (value === null || value === undefined) {
    return false;
  }
  const classes = new Set(value.split(/\s+/).filter(Boolean));
  return required.every((name) => classes.has(name));
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
