import type {
  FetchCurrentHouseVacancies,
  ProviderFailure,
  SourceRef,
} from "./federal-officials";
import {
  assessClerkJurisdiction,
  clerkNationalVacancyUrl,
  clerkVacancyPublicUrl,
  CONGRESS_CALENDAR_POLICY,
  createCongressSnapshot,
  FEDERAL_OFFICIAL_FIELD_POLICY,
  FEDERAL_PROVIDER_RESPONSE_POLICY,
  FEDERAL_PROVIDER_URL_POLICY,
  type CongressSnapshot,
} from "./federal-policy";

const rawTextNames = new Set([
  "script",
  "style",
  "textarea",
  "template",
  "xmp",
  "iframe",
  "noembed",
  "noframes",
  "plaintext",
  "title",
  "noscript",
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
  snapshot,
  { fetch, signal },
) => {
  const retrievedAtDate = new Date(snapshot.checkedAt);
  const expectedSnapshot = createCongressSnapshot(retrievedAtDate);
  if (
    expectedSnapshot === null ||
    expectedSnapshot.checkedAt !== snapshot.checkedAt ||
    expectedSnapshot.currentCongress !== snapshot.currentCongress ||
    expectedSnapshot.startYear !== snapshot.startYear ||
    expectedSnapshot.endYear !== snapshot.endYear
  ) {
    return unavailable("malformed");
  }

  try {
    const vacancyListUrl = clerkNationalVacancyUrl().toString();
    const response = await fetch(vacancyListUrl, {
      method: "GET",
      headers: { Accept: FEDERAL_PROVIDER_RESPONSE_POLICY.contentTypes.clerk[0] },
      redirect: FEDERAL_PROVIDER_RESPONSE_POLICY.redirect,
      cache: "no-store",
      signal,
    });
    if (response.redirected || !response.ok) {
      return unavailable(
        response.redirected ? "provider_error" : failureFromStatus(response.status),
      );
    }
    const contentType = response.headers.get("content-type")?.toLowerCase();
    const allowedContentType =
      FEDERAL_PROVIDER_RESPONSE_POLICY.contentTypes.clerk[0];
    if (
      !contentType ||
      !new RegExp(`^${allowedContentType.replace("/", "\\/")}(?:\\s*;|$)`).test(
        contentType,
      )
    ) {
      return unavailable("malformed");
    }

    const body = await readBody(response, signal);
    if (body.status === "failure") {
      return unavailable(body.reason);
    }
    const parsed = parseVacancies(body.html, snapshot);
    if (parsed === null) {
      return unavailable("malformed");
    }

    const retrievedAt = retrievedAtDate.toISOString();
    const source = vacancySource(vacancyListUrl, retrievedAt);
    return {
      status: "available",
      currentCongress: snapshot.currentCongress,
      source,
      vacancies: parsed.map(({ stateCode, district, url }) => ({
        stateCode,
        district,
        source: vacancySource(url, retrievedAt),
      })),
    };
  } catch (error) {
    return unavailable(
      signal.aborted || isAbortError(error)
        ? "timeout"
        : "provider_error",
    );
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
      if (byteCount > FEDERAL_PROVIDER_RESPONSE_POLICY.maxBodyBytes) {
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

function parseVacancies(html: string, snapshot: CongressSnapshot) {
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
      Number(match[1]) < CONGRESS_CALENDAR_POLICY.epoch.firstCongressNumber ||
      match[2] !== ordinalSuffix(Number(match[1]))
    ) {
      return null;
    }
    headings.push({ ...element, congress: Number(match[1]) });
  }

  const currentHeadings = headings.filter(
    ({ congress }) => congress === snapshot.currentCongress,
  );
  if (currentHeadings.length !== 1) {
    return null;
  }
  const currentHeading = currentHeadings[0];
  const nextHeading = headings.find(
    ({ start }) => start > currentHeading.start,
  );
  const rows = elements.filter(
    (element) =>
      element.name === "li" &&
      element.start >= currentHeading.end &&
      element.start < (nextHeading?.start ?? owner.closeStart) &&
      containedBy(element, owner),
  );
  if (
    rows.length >
    FEDERAL_PROVIDER_RESPONSE_POLICY.clerk.maxNationalVacancyRows
  ) {
    return null;
  }
  const links = elements.filter(
    (element) =>
      element.name === "a" &&
      element.start >= currentHeading.end &&
      element.start < (nextHeading?.start ?? owner.closeStart) &&
      containedBy(element, owner),
  );

  const vacancies: Array<{ stateCode: string; district: number; url: string }> = [];
  const seenSeats = new Set<string>();
  for (const link of links) {
    if (!anchorLooksVacant(link)) {
      continue;
    }
    const href = link.attributes.get("href");
    if (href === undefined || href === null) {
      return null;
    }
    const parsed = vacancyLink(href, snapshot);
    if (
      parsed.status !== "valid" ||
      seenSeats.has(`${parsed.stateCode}:${parsed.district}`)
    ) {
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
  let cursor: number = 0;
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
      nameStart++;
    }
    if (!/[A-Za-z]/.test(html[nameStart] ?? "")) {
      if (html[nameStart] === "!" || html[nameStart] === "?") {
        const declarationEnd = findTagEnd(html, start + 1);
        if (declarationEnd === null) {
          return null;
        }
        cursor = declarationEnd + 1;
      } else {
        cursor = start + 1;
      }
      continue;
    }

    const end = findTagEnd(html, nameStart);
    if (end === null) {
      return null;
    }
    let nameEnd = nameStart;
    while (
      nameEnd < end &&
      !isHtmlWhitespace(html[nameEnd]) &&
      html[nameEnd] !== "/"
    ) {
      nameEnd++;
    }
    const rawName = html.slice(nameStart, nameEnd).toLowerCase();
    if (rawName === "title" && !closing) {
      const closingTitle = /<\/title[\t\n\f\r ]*>/gi;
      closingTitle.lastIndex = end + 1;
      const match = closingTitle.exec(html);
      if (match === null) {
        return null;
      }
      cursor = match.index + match[0].length;
      continue;
    }
    if (rawTextNames.has(rawName)) {
      return null;
    }
    const relevantName = relevantNameFrom(rawName);
    if (relevantName !== null) {
      const remainder = html.slice(nameEnd, end);
      if (closing) {
        if (![...remainder].every(isHtmlWhitespace)) {
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
        if (/\/[\t\n\f\r ]*$/.test(remainder)) {
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
  for (let index = start; index < html.length; index++) {
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
    while (isHtmlWhitespace(source[cursor])) {
      cursor++;
    }
    if (cursor === source.length) {
      break;
    }

    const nameStart = cursor;
    while (
      cursor < source.length &&
      !isHtmlWhitespace(source[cursor]) &&
      !/["'<>\/=]/.test(source[cursor])
    ) {
      cursor++;
    }
    if (cursor === nameStart) {
      return null;
    }
    const name = source.slice(nameStart, cursor).toLowerCase();
    if (attributes.has(name)) {
      return null;
    }
    while (isHtmlWhitespace(source[cursor])) {
      cursor++;
    }

    let value: string | null = null;
    if (source[cursor] === "=") {
      cursor++;
      while (isHtmlWhitespace(source[cursor])) {
        cursor++;
      }
      if (cursor === source.length) {
        return null;
      }
      const quote = source[cursor];
      if (quote === "\"" || quote === "'") {
        cursor++;
        const valueStart = cursor;
        const valueEnd = source.indexOf(quote, cursor);
        if (valueEnd === -1) {
          return null;
        }
        value = source.slice(valueStart, valueEnd);
        cursor = valueEnd + 1;
        if (cursor < source.length && !isHtmlWhitespace(source[cursor])) {
          return null;
        }
      } else {
        const valueStart = cursor;
        while (
          cursor < source.length &&
          !isHtmlWhitespace(source[cursor])
        ) {
          if (/["'<=`>]/.test(source[cursor])) {
            return null;
          }
          cursor++;
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
  const classes = new Set(value.split(/[\t\n\f\r ]+/).filter(Boolean));
  return required.every((name) => classes.has(name));
}

function anchorLooksVacant(element: RelevantElement) {
  return [plainText(element.content), ...element.attributes.values()].some(
    (value) => value !== null && hasVacancySemantics(value),
  );
}

function hasVacancySemantics(value: string) {
  const decodedReferences = decodeNumericCharacterReferences(value);
  if (/vacanc(?:y|ies)/i.test(decodedReferences)) {
    return true;
  }

  try {
    return /vacanc(?:y|ies)/i.test(
      decodeNumericCharacterReferences(decodeURIComponent(decodedReferences)),
    );
  } catch {
    return false;
  }
}

function decodeNumericCharacterReferences(value: string) {
  return value.replace(
    /&#(?:([0-9]+)|x([0-9a-f]+));?/gi,
    (_reference, decimal: string | undefined, hexadecimal: string | undefined) => {
      const codePoint = Number.parseInt(
        decimal ?? hexadecimal ?? "",
        decimal === undefined ? 16 : 10,
      );
      return codePoint === 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
        ? "\ufffd"
        : String.fromCodePoint(codePoint);
    },
  );
}

function vacancyLink(
  href: string,
  snapshot: CongressSnapshot,
):
  | { status: "unrelated" }
  | { status: "invalid" }
  | { status: "valid"; stateCode: string; district: number; url: string } {
  let url: URL;
  try {
    url = new URL(href, FEDERAL_PROVIDER_URL_POLICY.clerk.origin);
  } catch {
    return /vacancy/i.test(href)
      ? { status: "invalid" }
      : { status: "unrelated" };
  }
  if (!/\/vacancy\/?$/i.test(url.pathname)) {
    return { status: "unrelated" };
  }
  const match = /^\/members\/([A-Z]{2})(00|0[1-9]|[1-9][0-9])\/vacancy$/.exec(
    url.pathname,
  );
  const canonicalHref = href.startsWith("/") ? url.pathname : url.toString();
  if (
    !match ||
    url.origin !== FEDERAL_PROVIDER_URL_POLICY.clerk.origin ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    href !== canonicalHref
  ) {
    return { status: "invalid" };
  }
  const stateCode = match[1];
  const district =
    match[2] === "00"
      ? FEDERAL_OFFICIAL_FIELD_POLICY.district.atLarge
      : Number(match[2]);
  const jurisdiction = assessClerkJurisdiction(stateCode);
  const publicUrl =
    jurisdiction.status === "voting_state"
      ? clerkVacancyPublicUrl(stateCode, district, snapshot)
      : jurisdiction.status === "known_nonlaunch" &&
          jurisdiction.allowedDistricts.includes(district as 0)
        ? url.toString()
        : null;
  if (publicUrl !== url.toString()) {
    return { status: "invalid" };
  }
  return {
    status: "valid",
    stateCode,
    district,
    url: publicUrl,
  };
}

function isHtmlWhitespace(value: string | undefined) {
  return value === "\t" || value === "\n" || value === "\f" || value === "\r" || value === " ";
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
  return String(value % 10) === String(1)
    ? "st"
    : String(value % 10) === String(2)
      ? "nd"
      : String(value % 10) === String(3)
        ? "rd"
        : "th";
}

function vacancySource(url: string, retrievedAt: string): SourceRef {
  return {
    publisher: "Office of the Clerk, U.S. House of Representatives",
    sourceType: "vacancy",
    publicUrl: url,
    ingestionUrl: url,
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
  return value instanceof DOMException && value.name === "AbortError";
}
