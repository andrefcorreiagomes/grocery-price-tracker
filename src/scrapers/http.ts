import { config } from "dotenv";
import { rawGet, type RawResponse } from "./fetch-raw";

// The crawl scripts run outside Next.js, which is what normally reads .env.
config({ quiet: true });

/**
 * The crawler's own name, not a browser's. Imitating Chrome would hide what is
 * asking, and robots.txt addresses programs by name; a crawler that claims to
 * be a browser can never be addressed. Changed on 4 October 2026, after one
 * product page and robots.txt from each store were fetched under this name.
 */
const CRAWLER_NAME = "grocery-price-tracker/1.0";

/**
 * Whoever runs the crawler names themselves in every request, so a store that
 * notices the traffic can reach that person. The address comes from
 * CRAWLER_CONTACT in their own .env and is never written in the code: a
 * default here would make every copy of this repository send the author's
 * address, or none at all.
 */
const CONTACT_HELP = [
  "CRAWLER_CONTACT is not set, so no request was sent to any store.",
  "",
  "Every request names who is running the crawler, so a store can reach that",
  "person. Add your own email address or web page to the .env file, e.g.",
  "",
  "  CRAWLER_CONTACT=you@your-domain.pt",
  "",
  "(.env.example shows the setting.)",
].join("\n");

function looksLikeContact(value: string): boolean {
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const page = /^https?:\/\/[^\s/]+\.[^\s]+$/.test(value);
  // The placeholder in .env.example, copied without being changed.
  const placeholder = /(^|[@.\/])example\.(com|org|net)\b/i.test(value);
  return (email || page) && !placeholder;
}

let userAgent: string | undefined;

/**
 * Stop the process unless CRAWLER_CONTACT holds an email address or a web page.
 *
 * Every crawl script calls this before doing anything else, so a missing
 * setting stops it before it touches the database. It exits rather than
 * throws: the crawlers catch errors page by page, and a thrown error would be
 * counted as thousands of failed pages instead of one missing setting.
 */
export function requireCrawlerContact(): string {
  if (userAgent) return userAgent;
  const contact = process.env.CRAWLER_CONTACT?.trim() ?? "";
  if (!looksLikeContact(contact)) {
    console.error(CONTACT_HELP);
    process.exit(1);
  }
  userAgent = `${CRAWLER_NAME} (contact: ${contact})`;
  return userAgent;
}

/** The test servers in src/scripts, which are not stores and need no contact. */
function isLocal(host: string): boolean {
  return /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
}

/**
 * Minimum gap between two requests to the same host. A catalogue crawl is
 * thousands of pages, and one request per second per store keeps the load on
 * each store's servers small however long the crawl runs.
 */
const MIN_DELAY_MS = 1_000;

/** Attempts per URL, including the first. */
const MAX_ATTEMPTS = 3;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface HostStats {
  host: string;
  /** requests that returned a body, i.e. not counting retried attempts */
  requests: number;
  /** attempts that failed and were retried (429, 5xx, socket errors) */
  retries: number;
  /**
   * HTML we parsed, i.e. the page AFTER decompression - what the parser had to
   * chew through, not what crossed the network. All three stores serve gzip, so
   * this runs several times larger than `wireBytes`; reporting it as bandwidth
   * overstates the load we put on them.
   */
  bytes: number;
  /** compressed bytes actually received, counted chunk by chunk */
  wireBytes: number;
  /** milliseconds spent inside fetch, waiting on the server */
  fetchMs: number;
  /** milliseconds spent holding back to honour the per-host delay */
  waitMs: number;
}

/**
 * Per-host request accounting. Working out why the first full crawl took 57
 * minutes needed a dozen ad-hoc probes afterwards, because nothing was
 * recorded; a crawl should be able to say where its own time went. Reading
 * these is what turns "Auchan felt slow" into "Auchan serves 13 products/sec".
 */
const stats = new Map<string, HostStats>();

function statsFor(host: string): HostStats {
  let entry = stats.get(host);
  if (!entry) {
    entry = {
      host,
      requests: 0,
      retries: 0,
      bytes: 0,
      wireBytes: 0,
      fetchMs: 0,
      waitMs: 0,
    };
    stats.set(host, entry);
  }
  return entry;
}

/** Snapshot of per-host totals, busiest first. */
export function httpStats(): HostStats[] {
  return [...stats.values()].sort((a, b) => b.fetchMs - a.fetchMs);
}

export function resetHttpStats(): void {
  stats.clear();
}

/** Compressed bytes transferred, or null when nothing was requested. */
export function wireBytesOf(s: HostStats): number | null {
  return s.requests > 0 ? s.wireBytes : null;
}

export interface TotalStats {
  requests: number;
  /** HTML processed, after decompression */
  bytes: number;
  /** compressed bytes transferred, null when nothing was requested */
  wireBytes: number | null;
  fetchMs: number;
  retries: number;
}

/** Sum per-host stats into one set of run totals. */
export function totalStats(list: HostStats[]): TotalStats {
  const sum = list.reduce(
    (a, h) => ({
      requests: a.requests + h.requests,
      bytes: a.bytes + h.bytes,
      wireBytes: a.wireBytes + h.wireBytes,
      fetchMs: a.fetchMs + h.fetchMs,
      retries: a.retries + h.retries,
    }),
    { requests: 0, bytes: 0, wireBytes: 0, fetchMs: 0, retries: 0 }
  );
  return { ...sum, wireBytes: sum.wireBytes > 0 ? sum.wireBytes : null };
}

/** Megabytes, to one decimal, or null. */
export function megabytes(bytes: number | null): number | null {
  return bytes === null ? null : Number((bytes / 1024 / 1024).toFixed(1));
}

/** Format the totals as printable lines, for a runner to log at the end. */
export function formatHttpStats(): string[] {
  return httpStats().map((s) => {
    const mb = s.bytes / 1024 / 1024;
    const wire = wireBytesOf(s);
    const seconds = s.fetchMs / 1000;
    const transferred =
      wire === null ? "-" : `${(wire / 1024 / 1024).toFixed(1)} MB transferred`;
    return (
      `  ${s.host.padEnd(22)} ${String(s.requests).padStart(5)} requests  ` +
      `${transferred.padStart(20)}  ` +
      `${mb.toFixed(0).padStart(5)} MB html  ` +
      `${(seconds / 60).toFixed(1).padStart(5)} min fetching  ` +
      `${(s.waitMs / 60000).toFixed(1).padStart(5)} min throttled  ` +
      `${s.retries} retries`
    );
  });
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
    if (waited < MIN_DELAY_MS) {
      const holdBack = MIN_DELAY_MS - waited;
      statsFor(host).waitMs += holdBack;
      await sleep(holdBack);
    }
    lastRequestAt.set(host, Date.now());
  });
  // Keep the chain alive even if a link rejects, or one failure stalls the host forever.
  hostChains.set(host, turn.catch(() => {}));
  return turn;
}

/**
 * A response the server refused, carrying its status.
 *
 * The status matters to callers, not just the failure: a 404 means the product
 * is gone and can be counted towards delisting, while a 503 or a socket error
 * means we could not tell. Marking products delisted because the network had a
 * bad night is exactly the mistake this exists to prevent.
 */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, url: string) {
    super(`Fetch failed (${status}) for ${url}`);
    this.name = "HttpError";
    this.status = status;
  }
}

/** Transient by nature: rate limiting, or the origin briefly unavailable. */
function isRetryable(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

function retryAfterMs(res: RawResponse, attempt: number): number {
  const raw = res.headers["retry-after"];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (header) {
    const seconds = Number.parseInt(header, 10);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  }
  return MIN_DELAY_MS * 2 ** attempt; // 2s, 4s
}

export async function fetchHtml(url: string): Promise<string> {
  const host = hostOf(url);
  // Also checked here, for any script that reaches a store without calling it first.
  const agent = isLocal(host) ? CRAWLER_NAME : requireCrawlerContact();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await takeTurn(host);
    const startedAt = Date.now();
    let res: RawResponse;
    try {
      res = await rawGet(url, {
        "User-Agent": agent,
        "Accept-Language": "pt-PT,pt;q=0.9",
      });
    } catch (error) {
      // Network-level failure (DNS, socket) - worth one more try.
      statsFor(host).fetchMs += Date.now() - startedAt;
      statsFor(host).retries++;
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_ATTEMPTS - 1) await sleep(MIN_DELAY_MS * 2 ** attempt);
      continue;
    }

    if (res.ok) {
      const entry = statsFor(host);
      entry.requests++;
      entry.bytes += res.body.length;
      entry.wireBytes += res.wireBytes;
      entry.fetchMs += Date.now() - startedAt;
      return res.body;
    }

    // A failed response still moved bytes, and a night of 404s is not free.
    statsFor(host).wireBytes += res.wireBytes;
    statsFor(host).fetchMs += Date.now() - startedAt;

    // A 404 means the listing is gone; retrying cannot help and the caller
    // needs to hear about it straight away. It is not counted as a retry.
    if (!isRetryable(res.status)) {
      throw new HttpError(res.status, url);
    }

    statsFor(host).retries++;

    lastError = new HttpError(res.status, url);
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
