import { describe, expect, it } from "vitest";
import {
  MAX_CANONICAL_RESIDENCE_PREVIEW_PAYLOAD_BYTES,
  MAX_CANONICAL_SAVED_RESIDENCE_PAYLOAD_BYTES,
  RESIDENCE_PREVIEW_BODY_CAP_BYTES,
  SAVED_RESIDENCE_BODY_CAP_BYTES,
} from "./residence-policy";
import { readBoundedJson } from "./bounded-json";

const encoder = new TextEncoder();

function utf8Bytes(value: string) {
  return encoder.encode(value).byteLength;
}

function jsonRequest(body: string) {
  return new Request("https://example.test/api/v1/residence", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
}

function streamRequest(
  body: ReadableStream<Uint8Array>,
  headers: HeadersInit = {},
) {
  return new Request("https://example.test/api/v1/residence", {
    method: "POST",
    body,
    headers,
    duplex: "half",
  } as RequestInit);
}

function paddedJson(value: unknown, maximumBytes: number) {
  const json = JSON.stringify(value);
  return `${json}${" ".repeat(maximumBytes - utf8Bytes(json))}`;
}

function streamFromChunks(chunks: Uint8Array[]) {
  let next = 0;
  return new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (next === chunks.length) {
          controller.close();
          return;
        }
        controller.enqueue(chunks[next]);
        next += 1;
      },
    },
    { highWaterMark: 0 },
  );
}

describe("readBoundedJson", () => {
  it.each([
    ["preview", RESIDENCE_PREVIEW_BODY_CAP_BYTES],
    ["saved residence", SAVED_RESIDENCE_BODY_CAP_BYTES],
  ] as const)("accepts exact %s body cap and rejects one extra byte", async (_name, cap) => {
    const exactBody = paddedJson({ ok: true }, cap);

    expect(utf8Bytes(exactBody)).toBe(cap);
    await expect(readBoundedJson(jsonRequest(exactBody), cap)).resolves.toEqual({
      ok: true,
    });
    await expect(readBoundedJson(jsonRequest(`${exactBody} `), cap)).resolves.toBeNull();
  });

  it("keeps raw service caps explicit and at least their derived canonical maxima", () => {
    expect(RESIDENCE_PREVIEW_BODY_CAP_BYTES).toBe(16_384);
    expect(SAVED_RESIDENCE_BODY_CAP_BYTES).toBe(16_384);
    expect(RESIDENCE_PREVIEW_BODY_CAP_BYTES).toBeGreaterThanOrEqual(
      MAX_CANONICAL_RESIDENCE_PREVIEW_PAYLOAD_BYTES,
    );
    expect(SAVED_RESIDENCE_BODY_CAP_BYTES).toBeGreaterThanOrEqual(
      MAX_CANONICAL_SAVED_RESIDENCE_PAYLOAD_BYTES,
    );
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid byte ceiling %s",
    async (cap) => {
      await expect(readBoundedJson(jsonRequest("{}"), cap)).resolves.toBeNull();
    },
  );

  it("rejects an excessive Content-Length before reading its stream", async () => {
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulls += 1;
          controller.enqueue(encoder.encode("{}"));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );

    await expect(
      readBoundedJson(
        streamRequest(stream, {
          "content-length": String(RESIDENCE_PREVIEW_BODY_CAP_BYTES + 1),
        }),
        RESIDENCE_PREVIEW_BODY_CAP_BYTES,
      ),
    ).resolves.toBeNull();
    expect(pulls).toBe(0);
  });

  it("rejects an oversized stream, cancels it, and does not pull trailing bytes", async () => {
    const prefix = encoder.encode('{"ok":true}');
    const oversizedChunk = new Uint8Array(
      RESIDENCE_PREVIEW_BODY_CAP_BYTES - prefix.byteLength + 1,
    );
    oversizedChunk.fill(0x20);
    const chunks = [prefix, oversizedChunk, encoder.encode("trailing")];
    let next = 0;
    let cancelled = false;
    let trailingChunkPulled = false;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (next === chunks.length) {
            controller.close();
            return;
          }
          trailingChunkPulled ||= next === chunks.length - 1;
          controller.enqueue(chunks[next]);
          next += 1;
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );

    await expect(
      readBoundedJson(
        streamRequest(stream),
        RESIDENCE_PREVIEW_BODY_CAP_BYTES,
      ),
    ).resolves.toBeNull();
    expect(cancelled).toBe(true);
    expect(trailingChunkPulled).toBe(false);
  });

  it("fails closed for invalid UTF-8, invalid JSON, and trailing JSON bytes", async () => {
    const cap = RESIDENCE_PREVIEW_BODY_CAP_BYTES;

    await expect(
      readBoundedJson(
        streamRequest(streamFromChunks([new Uint8Array([0xc3, 0x28])])),
        cap,
      ),
    ).resolves.toBeNull();
    await expect(readBoundedJson(jsonRequest('{"ok":'), cap)).resolves.toBeNull();
    await expect(
      readBoundedJson(jsonRequest('{"ok":true}{"next":true}'), cap),
    ).resolves.toBeNull();
  });
});
