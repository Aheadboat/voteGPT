import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import {
  afterEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";
import { fetchCurrentHouseVacancies } from "./house-clerk-vacancy";
import type {
  FetchCurrentHouseVacancies,
  HouseVacancyOutcome,
} from "./federal-officials";

// RED: Clerk adapter is absent. UX-01/02/03/04/06/07/09 require deterministic
// current-seat evidence, equal treatment, no location input, and fail-closed states.

const fixture = readFileSync(
  "tests/fixtures/clerk-current-vacancies.html",
  "utf8",
);
const now = new Date("2026-07-16T12:00:00.000Z");
const listUrl = "https://clerk.house.gov/Members/ViewVacancies";
const minimalFixture = `<!doctype html>
<div class="container members-profile">
  <h1>Vacancies of the 119th Congress</h1>
  <h2>First Session</h2>
  <li class="vacancy_release">
    <a href="/members/GA13/vacancy">Current vacancy</a>
  </li>
</div>`;
const inertMarkupTags = [
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
] as const;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("House Clerk current-vacancy adapter", () => {
  it("fetches only the fixed current-list endpoint and returns canonical evidence", async () => {
    expectTypeOf(fetchCurrentHouseVacancies).toMatchTypeOf<FetchCurrentHouseVacancies>();
    const providerFetch = vi.fn<typeof globalThis.fetch>(async () =>
      htmlResponse(fixture),
    );

    const available = expectAvailable(await lookup(providerFetch));

    expect(providerFetch).toHaveBeenCalledOnce();
    const [input, init] = providerFetch.mock.calls[0];
    const requestUrl = new URL(toUrl(input));
    expect(requestUrl.origin).toBe("https://clerk.house.gov");
    expect(requestUrl.pathname).toBe("/Members/ViewVacancies");
    expect(requestUrl.search).toBe("");
    expect(requestUrl.hash).toBe("");
    expect(requestUrl.username).toBe("");
    expect(requestUrl.password).toBe("");
    expect(init).toMatchObject({
      method: "GET",
      redirect: "error",
      cache: "no-store",
    });
    expect(new Headers(init?.headers).get("Accept")).toBe("text/html");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.body).toBeUndefined();

    expect(available).toEqual({
      status: "available",
      currentCongress: 119,
      source: vacancySource(listUrl),
      vacancies: [
        {
          stateCode: "GA",
          district: 13,
          source: vacancySource(
            "https://clerk.house.gov/members/GA13/vacancy",
          ),
        },
      ],
    });
    expect(JSON.stringify(providerFetch.mock.calls)).not.toMatch(
      /address|latitude|longitude/i,
    );
  });

  it("treats filled entries as non-vacant and keeps list evidence when active list is empty", async () => {
    const noActiveLink = fixture.replace(
      '<a href="/members/GA13/vacancy">Current vacancy</a>',
      "No active vacancy link",
    );

    const available = expectAvailable(
      await lookup(vi.fn(async () => htmlResponse(noActiveLink))),
    );

    expect(available.vacancies).toEqual([]);
    expect(available.source).toEqual(vacancySource(listUrl));
  });

  it("maps canonical district 00 to at-large district zero", async () => {
    const atLarge = fixture.replaceAll("GA13", "AK00");

    const available = expectAvailable(
      await lookup(vi.fn(async () => htmlResponse(atLarge))),
    );

    expect(available.vacancies).toEqual([
      {
        stateCode: "AK",
        district: 0,
        source: vacancySource(
          "https://clerk.house.gov/members/AK00/vacancy",
        ),
      },
    ]);
  });

  it.each([
    ["missing matching heading", fixture, 120],
    [
      "duplicate matching heading",
      fixture.replace(
        "<h2>First Session</h2>",
        "<h3>Vacancies of the 119th Congress</h3><h2>First Session</h2>",
      ),
      119,
    ],
    [
      "malformed ordinal heading",
      fixture.replace("119th Congress", "119st Congress"),
      119,
    ],
    [
      "malformed heading markup",
      fixture.replace(
        "<h1>Vacancies of the 119th Congress</h1>",
        "<h1>Vacancies of the 119th Congress",
      ),
      119,
    ],
  ] as const)("fails closed on %s", async (_label, html, currentCongress) => {
    await expect(
      fetchCurrentHouseVacancies(currentCongress, {
        fetch: vi.fn(async () => htmlResponse(html)),
        now: () => now,
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "malformed" });
  });

  it.each([
    [
      "duplicate seat link",
      fixture.replace(
        '<a href="/members/GA13/vacancy">Current vacancy</a>',
        '<a href="/members/GA13/vacancy">Current vacancy</a><a href="/members/GA13/vacancy">Duplicate</a>',
      ),
    ],
    ["unknown jurisdiction", fixture.replaceAll("GA13", "ZZ13")],
    [
      "cross-origin link",
      fixture.replace(
        'href="/members/GA13/vacancy"',
        'href="https://example.test/members/GA13/vacancy"',
      ),
    ],
    [
      "noncanonical link query",
      fixture.replace("/members/GA13/vacancy", "/members/GA13/vacancy?old=1"),
    ],
    [
      "noncanonical link case",
      fixture.replace("/members/GA13/vacancy", "/Members/GA13/Vacancy"),
    ],
    [
      "percent-encoded vacancy path",
      fixture.replace("/members/GA13/vacancy", "/members/GA13/%76acancy"),
    ],
    [
      "malformed anchor markup",
      fixture.replace("Current vacancy</a>", "Current vacancy"),
    ],
  ] as const)("fails the entire outcome on %s", async (_label, html) => {
    await expect(
      lookup(vi.fn(async () => htmlResponse(html))),
    ).resolves.toEqual({ status: "unavailable", reason: "malformed" });
  });

  it.each([
    [
      "data-href instead of href",
      fixture.replace(
        'href="/members/GA13/vacancy"',
        'data-href="/members/GA13/vacancy"',
      ),
    ],
    [
      "fake href inside another quoted attribute",
      fixture.replace(
        'href="/members/GA13/vacancy"',
        'title=\'href="/members/GA13/vacancy"\'',
      ),
    ],
    [
      "duplicate actual href attributes",
      fixture.replace(
        'href="/members/GA13/vacancy"',
        'href="/members/GA13/vacancy" href="/members/CA01/vacancy"',
      ),
    ],
    [
      "unterminated quoted attribute",
      fixture.replace(
        'href="/members/GA13/vacancy"',
        'href="/members/GA13/vacancy" title="unterminated',
      ),
    ],
  ] as const)("does not promote %s to verified evidence", async (_label, html) => {
    await expect(
      lookup(vi.fn(async () => htmlResponse(html))),
    ).resolves.toEqual({ status: "unavailable", reason: "malformed" });
  });

  it.each([
    [
      "visible vacancy text",
      '<a href="/profile">Current vacancy</a>',
    ],
    [
      "vacancy semantics in another attribute",
      '<a href="/profile" data-seat="current vacancy">Former member profile</a>',
    ],
    [
      "percent-encoded vacancy semantics in another attribute",
      '<a href="/profile" data-seat="/members/GA13/%76acancy">Former member profile</a>',
    ],
  ] as const)("fails closed on noncanonical %s", async (_label, anchor) => {
    const adversarial = fixture.replace(
      '<a href="/members/GA13/vacancy">Current vacancy</a>',
      anchor,
    );

    await expect(
      lookup(vi.fn(async () => htmlResponse(adversarial))),
    ).resolves.toEqual({ status: "unavailable", reason: "malformed" });
  });

  it("uses only the real href when fake href text shares the opening tag", async () => {
    const mixedAttributes = fixture.replace(
      'href="/members/GA13/vacancy"',
      'data-note=\'href="/members/CA01/vacancy"\' href="/members/GA13/vacancy"',
    );

    const available = expectAvailable(
      await lookup(vi.fn(async () => htmlResponse(mixedAttributes))),
    );

    expect(available.vacancies).toEqual([
      {
        stateCode: "GA",
        district: 13,
        source: vacancySource(
          "https://clerk.house.gov/members/GA13/vacancy",
        ),
      },
    ]);
  });

  it("ignores profile and election links around one active seat in a shared list item", async () => {
    const available = expectAvailable(
      await lookup(vi.fn(async () => htmlResponse(fixture))),
    );

    expect(available.vacancies.map(({ stateCode, district }) => ({
      stateCode,
      district,
    }))).toEqual([{ stateCode: "GA", district: 13 }]);
  });

  it("does not qualify a canonical-looking link in a later sibling section", async () => {
    const laterSibling = fixture.replace(
      "</body>",
      '<section><a href="/members/CA01/vacancy">Unowned vacancy</a></section></body>',
    );

    const available = expectAvailable(
      await lookup(vi.fn(async () => htmlResponse(laterSibling))),
    );

    expect(available.vacancies.map(({ stateCode, district }) => ({
      stateCode,
      district,
    }))).toEqual([{ stateCode: "GA", district: 13 }]);
  });

  it.each([
    [
      "missing owner",
      fixture.replace('class="container members-profile"', 'class="container"'),
    ],
    [
      "duplicate owner",
      fixture.replace(
        "</body>",
        '<div class="container members-profile"></div></body>',
      ),
    ],
    [
      "missing owner close",
      fixture.replace("</div><!-- current-owner-end -->", ""),
    ],
    [
      "duplicate owner class attribute",
      fixture.replace(
        'class="container members-profile"',
        'class="container members-profile" class="duplicate"',
      ),
    ],
  ] as const)("fails closed on %s boundary", async (_label, html) => {
    await expect(
      lookup(vi.fn(async () => htmlResponse(html))),
    ).resolves.toEqual({ status: "unavailable", reason: "malformed" });
  });

  it("does not treat a prefixed div tag as the validated owner", async () => {
    const prefixedOwner = minimalFixture
      .replace("<div ", "<div-x ")
      .replace("</div>", "</div-x>");

    await expect(
      lookup(vi.fn(async () => htmlResponse(prefixedOwner))),
    ).resolves.toEqual({ status: "unavailable", reason: "malformed" });
  });

  it("does not treat a prefixed anchor tag as vacancy evidence", async () => {
    const prefixedAnchor = minimalFixture
      .replace("<a ", "<a-x ")
      .replace("</a>", "</a-x>");

    const available = expectAvailable(
      await lookup(vi.fn(async () => htmlResponse(prefixedAnchor))),
    );

    expect(available.vacancies).toEqual([]);
  });

  it("does not treat a prefixed self-closing li tag as malformed li markup", async () => {
    const prefixedListItem = minimalFixture.replace(
      '<li class="vacancy_release">',
      '<li-x/><li class="vacancy_release">',
    );

    const available = expectAvailable(
      await lookup(vi.fn(async () => htmlResponse(prefixedListItem))),
    );

    expect(available.vacancies).toHaveLength(1);
  });

  it.each(["\u00a0", "\u000b"])(
    "does not split owner classes on non-HTML whitespace %j",
    async (separator) => {
      const nonHtmlClassSpace = minimalFixture.replace(
        "container members-profile",
        `container${separator}members-profile`,
      );

      await expect(
        lookup(vi.fn(async () => htmlResponse(nonHtmlClassSpace))),
      ).resolves.toEqual({ status: "unavailable", reason: "malformed" });
    },
  );

  it.each(["\u00a0", "\u000b"])(
    "does not split tag attributes on non-HTML whitespace %j",
    async (separator) => {
      const nonHtmlAttributeSpace = minimalFixture.replace(
        "<div class=",
        `<div${separator}class=`,
      );

      await expect(
        lookup(vi.fn(async () => htmlResponse(nonHtmlAttributeSpace))),
      ).resolves.toEqual({ status: "unavailable", reason: "malformed" });
    },
  );

  it.each(inertMarkupTags)(
    "fails closed before %s content can synthesize vacancy tags",
    async (inertTag) => {
      const rawTextFixture = minimalFixture.replace(
        '<a href="/members/GA13/vacancy">Current vacancy</a>',
        `<${inertTag}>"<a href='/members/TX01/vacancy'>fake</a>"</${inertTag}>`,
      );

      const outcome = await lookup(
        vi.fn(async () => htmlResponse(rawTextFixture)),
      );
      if (inertTag === "title") {
        expect(expectAvailable(outcome).vacancies).toEqual([]);
      } else {
        expect(outcome).toEqual({ status: "unavailable", reason: "malformed" });
      }
    },
  );

  it.each(inertMarkupTags)(
    "fails closed before %s content can synthesize a full owner",
    async (inertTag) => {
      const fakeOwner = `<${inertTag}>"${minimalFixture}"</${inertTag}>`;

      await expect(
        lookup(vi.fn(async () => htmlResponse(fakeOwner))),
      ).resolves.toEqual({ status: "unavailable", reason: "malformed" });
    },
  );

  it.each([
    [302, "provider_error"],
    [401, "auth"],
    [404, "not_found"],
    [429, "quota"],
    [500, "provider_error"],
  ] as const)("maps HTTP %s to %s", async (status, reason) => {
    await expect(
      lookup(vi.fn(async () => htmlResponse("redirect or error", status))),
    ).resolves.toEqual({ status: "unavailable", reason });
  });

  it("fails closed on redirect exceptions and wrong content type", async () => {
    await expect(
      lookup(vi.fn(async () => Promise.reject(new TypeError("redirect blocked")))),
    ).resolves.toEqual({ status: "unavailable", reason: "provider_error" });
    await expect(
      lookup(
        vi.fn(async () =>
          new Response(fixture, {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      ),
    ).resolves.toEqual({ status: "unavailable", reason: "malformed" });
  });

  it("fails closed when the HTML body exceeds one MiB", async () => {
    const oversized = `${fixture}${" ".repeat(1024 * 1024)}`;

    await expect(
      lookup(vi.fn(async () => htmlResponse(oversized))),
    ).resolves.toEqual({ status: "unavailable", reason: "malformed" });
  });

  it("returns oversize failure when stream cancellation never settles", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024 + 1));
      },
      cancel() {
        cancelled = true;
        return new Promise<void>(() => undefined);
      },
    });

    const result = await settlesWithin(
      lookup(
        vi.fn(async () =>
          new Response(stream, {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
        ),
      ),
    );

    expect(result).toEqual({ status: "unavailable", reason: "malformed" });
    expect(cancelled).toBe(true);
  });

  it("applies the five-second timeout through the whole response body", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(fixture.slice(0, 40)));
      },
      cancel() {
        cancelled = true;
      },
    });
    const providerFetch = vi.fn<typeof globalThis.fetch>(async () =>
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );

    const pending = lookup(providerFetch);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(providerFetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({
      status: "unavailable",
      reason: "timeout",
    });
    expect(cancelled).toBe(true);
  });

  it("returns timeout when stream cancellation never settles", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(fixture.slice(0, 40)));
      },
      cancel() {
        cancelled = true;
        return new Promise<void>(() => undefined);
      },
    });
    const pending = lookup(
      vi.fn(async () =>
        new Response(stream, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      ),
    );

    await vi.advanceTimersByTimeAsync(5_000);
    vi.useRealTimers();

    await expect(settlesWithin(pending)).resolves.toEqual({
      status: "unavailable",
      reason: "timeout",
    });
    expect(cancelled).toBe(true);
  });

});

function lookup(providerFetch: typeof globalThis.fetch) {
  return fetchCurrentHouseVacancies(119, {
    fetch: providerFetch,
    now: () => now,
  });
}

function htmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function settlesWithin(pending: Promise<HouseVacancyOutcome>) {
  return Promise.race([
    pending,
    delay(50).then(() => ({ status: "did_not_settle" as const })),
  ]);
}

function vacancySource(url: string) {
  return {
    publisher: "Office of the Clerk, U.S. House of Representatives" as const,
    sourceType: "vacancy" as const,
    url,
    retrievedAt: now.toISOString(),
    recordUpdatedAt: null,
    effectiveAt: null,
  };
}

function expectAvailable(
  outcome: HouseVacancyOutcome,
): Extract<HouseVacancyOutcome, { status: "available" }> {
  if (outcome.status !== "available") {
    throw new Error(`Expected available Clerk outcome, got ${outcome.reason}.`);
  }
  return outcome;
}

function toUrl(input: Parameters<typeof globalThis.fetch>[0]) {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}
