const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

export async function readBoundedJson(
  request: Request,
  maximumBytes: number,
): Promise<unknown | null> {
  if (!isValidMaximumBytes(maximumBytes)) {
    cancelStreamBestEffort(request.body);
    return null;
  }

  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    (!isContentLength(contentLength) || Number(contentLength) > maximumBytes)
  ) {
    cancelStreamBestEffort(request.body);
    return null;
  }

  const body = request.body;
  if (body === null) {
    return null;
  }

  const chunks: Uint8Array[] = [];
  let byteCount = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  try {
    reader = body.getReader();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }

      byteCount += chunk.value.byteLength;
      if (byteCount > maximumBytes) {
        cancelReaderBestEffort(reader);
        return null;
      }
      chunks.push(chunk.value);
    }

    const bytes = new Uint8Array(byteCount);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return JSON.parse(utf8Decoder.decode(bytes));
  } catch {
    if (reader === null) {
      cancelStreamBestEffort(body);
    } else {
      cancelReaderBestEffort(reader);
    }
    return null;
  } finally {
    if (reader !== null) {
      try {
        reader.releaseLock();
      } catch {
        // Cleanup must not affect a private failure result.
      }
    }
  }
}

function isValidMaximumBytes(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}

function isContentLength(value: string) {
  return /^(?:0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value));
}

function cancelStreamBestEffort(stream: ReadableStream<Uint8Array> | null) {
  if (stream === null) {
    return;
  }
  try {
    void stream.cancel().catch(() => undefined);
  } catch {
    // Cleanup must not affect a private failure result.
  }
}

function cancelReaderBestEffort(reader: ReadableStreamDefaultReader<Uint8Array>) {
  try {
    void reader.cancel().catch(() => undefined);
  } catch {
    // Cleanup must not affect a private failure result.
  }
}
