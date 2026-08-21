import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { Agent as HttpAgent } from "node:http";
import { Agent as HttpsAgent } from "node:https";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";

/**
 * An HTTP GET that reports how many bytes actually crossed the network.
 *
 * `fetch` cannot do this. Node decompresses gzip transparently and exposes only
 * the decompressed body, so a 159 KB Continente page reads as 1 MB - and
 * Continente sends no `content-length` to fall back on, so the compressed size
 * is simply unavailable through it. Measured both ways before writing this:
 * fetch returns the decompressed length even when `Accept-Encoding` is set by
 * hand.
 *
 * Reading the response ourselves means counting each chunk as it arrives, which
 * is the real figure, and decompressing afterwards. It matters because "how much
 * are we pulling from their servers every night" is a question this project
 * should be able to answer precisely rather than estimate - a nightly run is
 * 17,000 requests against someone else's infrastructure.
 *
 * Deliberately narrow: GET only, no cookies, no streaming to the caller. The
 * throttle, retries and stats stay in http.ts.
 */

/** Matches what Node's fetch sent for us before, so nothing about the request changes. */
const ACCEPT_ENCODING = "gzip, deflate";

/** Redirects followed before giving up. */
const MAX_REDIRECTS = 5;

/** Connection reuse, as undici did by default. */
const httpAgent = new HttpAgent({ keepAlive: true });
const httpsAgent = new HttpsAgent({ keepAlive: true });

export interface RawResponse {
  status: number;
  ok: boolean;
  headers: NodeJS.Dict<string | string[]>;
  /** decoded text */
  body: string;
  /** bytes received on the wire, compressed, including any redirect hops */
  wireBytes: number;
}

function decompress(buffer: Buffer, encoding: string | undefined): Buffer {
  switch ((encoding ?? "").trim().toLowerCase()) {
    case "gzip":
      return gunzipSync(buffer);
    case "deflate":
      return inflateSync(buffer);
    case "br":
      return brotliDecompressSync(buffer);
    default:
      return buffer;
  }
}

/**
 * Node's Buffer knows utf8 and latin1 and little else, which covers every page
 * these three stores serve. An unrecognised charset falls back to utf8 rather
 * than throwing - a mangled accent is a better outcome than a dead crawl.
 */
function decode(buffer: Buffer, contentType: string | undefined): string {
  const charset = contentType?.match(/charset=([^;]+)/i)?.[1]?.trim().toLowerCase();
  if (charset === "iso-8859-1" || charset === "latin1" || charset === "windows-1252") {
    return buffer.toString("latin1");
  }
  return buffer.toString("utf8");
}

function once(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<{ res: IncomingMessage; body: Buffer; wireBytes: number }> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const secure = target.protocol === "https:";
    const send = secure ? httpsRequest : httpRequest;

    const req = send(
      target,
      {
        method: "GET",
        headers: { ...headers, "Accept-Encoding": ACCEPT_ENCODING },
        agent: secure ? httpsAgent : httpAgent,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let wireBytes = 0;
        res.on("data", (chunk: Buffer) => {
          // The point of the whole exercise: measured before anything unpacks it.
          wireBytes += chunk.length;
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ res, body: Buffer.concat(chunks), wireBytes }));
        res.on("error", reject);
      }
    );

    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timed out after ${timeoutMs} ms: ${url}`)));
    req.on("error", reject);
    req.end();
  });
}

export async function rawGet(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 30_000
): Promise<RawResponse> {
  let current = url;
  let wireBytes = 0;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const { res, body, wireBytes: hopBytes } = await once(current, headers, timeoutMs);
    wireBytes += hopBytes;

    const status = res.statusCode ?? 0;
    const location = res.headers.location;
    if (status >= 300 && status < 400 && location && hop < MAX_REDIRECTS) {
      current = new URL(location, current).toString();
      continue;
    }

    const encoding = res.headers["content-encoding"];
    const decoded = decompress(body, Array.isArray(encoding) ? encoding[0] : encoding);
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: res.headers,
      body: decode(decoded, res.headers["content-type"]),
      wireBytes,
    };
  }

  throw new Error(`Too many redirects (${MAX_REDIRECTS}) starting at ${url}`);
}
