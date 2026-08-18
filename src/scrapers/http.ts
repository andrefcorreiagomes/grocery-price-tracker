const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 (personal price-tracker; contact: groceriestracker50@gmail.com)";

/**
 * Minimum gap between two requests to the same host. At 275 listings a night
 * the old unthrottled code was harmless; a catalogue crawl is thousands of
 * pages, and hammering three retailers flat out is how a project like this
 * gets IP-banned - which would end it.
 */
const MIN_DELAY_MS = 1_000;

/** Attempts per URL, including the first. */
const MAX_ATTEMPTS = 3;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const lastRequestAt = new Map<string, number>();
/** Per-host promise chain, so concurrent callers queue instead of all firing at once. */
const hostChains = new Map<string, Promise<void>>();

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Resolves when it is this caller's turn to hit `host`, having waited out the
 * remainder of MIN_DELAY_MS since the previous request to it. Chained rather
 * than a bare sleep so that ten parallel callers take ten slots in sequence
 * instead of all sleeping the same second and then firing together.
 */
function takeTurn(host: string): Promise<void> {
  const previous = hostChains.get(host) ?? Promise.resolve();
  const turn = previous.then(async () => {
    const waited = Date.now() - (lastRequestAt.get(host) ?? 0);
    if (waited < MIN_DELAY_MS) await sleep(MIN_DELAY_MS - waited);
    lastRequestAt.set(host, Date.now());
  });
  // Keep the chain alive even if a link rejects, or one failure stalls the host forever.
  hostChains.set(host, turn.catch(() => {}));
  return turn;
}

/** Transient by nature: rate limiting, or the origin briefly unavailable. */
function isRetryable(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

function retryAfterMs(res: Response, attempt: number): number {
  const header = res.headers.get("retry-after");
  if (header) {
    const seconds = Number.parseInt(header, 10);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  }
  return MIN_DELAY_MS * 2 ** attempt; // 2s, 4s
}

export async function fetchHtml(url: string): Promise<string> {
  const host = hostOf(url);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await takeTurn(host);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "pt-PT,pt;q=0.9",
        },
      });
    } catch (error) {
      // Network-level failure (DNS, socket) - worth one more try.
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_ATTEMPTS - 1) await sleep(MIN_DELAY_MS * 2 ** attempt);
      continue;
    }

    if (res.ok) return res.text();

    // A 404 means the listing is gone; retrying cannot help and the caller
    // needs to hear about it straight away.
    if (!isRetryable(res.status)) {
      throw new Error(`Fetch failed (${res.status}) for ${url}`);
    }

    lastError = new Error(`Fetch failed (${res.status}) for ${url}`);
    if (attempt < MAX_ATTEMPTS - 1) await sleep(retryAfterMs(res, attempt));
  }

  throw lastError ?? new Error(`Fetch failed for ${url}`);
}

/** Extracts every <script type="application/ld+json"> block's parsed JSON from raw HTML. */
export function extractLdJsonBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    try {
      blocks.push(JSON.parse(match[1].trim()));
    } catch {
      // skip malformed blocks (e.g. review fragments with stray characters)
    }
  }
  return blocks;
}
