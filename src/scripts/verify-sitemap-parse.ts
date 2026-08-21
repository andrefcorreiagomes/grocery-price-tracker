import { createServer } from "node:http";
import { discoverProductUrls } from "../scrapers/crawl/continente-products";
import { comparePerFile, FILE_SHRINK_LIMIT } from "../scrapers/crawl/sitemap-trust";

/**
 * The two checks that catch SILENT partial damage: entries per sitemap file,
 * and `<loc>` entries whose product id we could not extract.
 *
 * Both exist because the failure they cover produces no error at all. The id
 * pattern once matched digits only and discarded 170 published URLs for months;
 * a file truncated at 90% moves the total by ~1.5%, under any sensible
 * threshold. Served from a local server, so no store is touched.
 */
export async function verifySitemapParse(): Promise<number> {
  let failures = 0;
  const check = (label: string, ok: boolean, detail = "") => {
    if (!ok) failures++;
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? "   " + detail : ""}`);
  };

  // What each file serves, so a test can shrink or break one.
  // Sized like the real thing: two large files and one small one, because the
  // whole point is that losing the SMALL one barely moves the total. Ids are
  // offset per file so they cannot collide - they are deduplicated by id, and a
  // fixture that repeats them measures nothing.
  const files: Record<string, { count: number; offset: number; weird: number; truncate: boolean }> = {
    a: { count: 5_000, offset: 100_000, weird: 0, truncate: false },
    b: { count: 5_000, offset: 200_000, weird: 0, truncate: false },
    c: { count: 200, offset: 300_000, weird: 0, truncate: false },
  };

  const server = createServer((req, res) => {
    const url = req.url ?? "";
    res.writeHead(200, { "content-type": "application/xml" });

    if (url.includes("sitemap_index")) {
      const locs = Object.keys(files)
        .map((k) => `<loc>http://127.0.0.1:38780/sitemap_product_${k}.xml</loc>`)
        .join("");
      return res.end(`<x>${locs}<loc>http://127.0.0.1:38780/sitemap_category.xml</loc></x>`);
    }

    const key = url.match(/_product_(\w)\.xml/)?.[1] ?? "a";
    const spec = files[key];
    const parts: string[] = [];
    for (let i = 0; i < spec.count; i++) {
      parts.push(`<loc>https://www.continente.pt/produto/thing-${key}-${spec.offset + i}.html</loc>`);
    }
    // URLs whose trailing segment cannot be read as an id at all.
    for (let i = 0; i < spec.weird; i++) {
      parts.push(`<loc>https://www.continente.pt/produto/reshaped/${key}/${i}/index.html</loc>`);
    }
    const body = `<x>${parts.join("")}</x>`;
    res.end(spec.truncate ? body.slice(0, Math.floor(body.length * 0.5)) : body);
  });

  await new Promise<void>((r) => server.listen(38780, "127.0.0.1", r));
  process.env.CONTINENTE_SITEMAP_URL = "http://127.0.0.1:38780/sitemap_index.xml";

  try {
    console.log("per-file entry counts");
    const base = await discoverProductUrls();
    check("all three product files are counted", base.files === 3, `${base.files}`);
    check("the category file is ignored", base.perFile.length === 3);
    check(
      "each file reports its own entry count",
      base.perFile.map((f) => f.entries).join(",") === "5000,5000,200",
      base.perFile.map((f) => f.entries).join(",")
    );
    check("the totals still add up", base.urls.size === 10_200, `${base.urls.size}`);

    // A file truncated mid-document: the total barely moves, the file halves.
    files.c.truncate = true;
    const cut = await discoverProductUrls();
    const totalDrop = 1 - cut.urls.size / base.urls.size;
    console.log(`    total fell ${(totalDrop * 100).toFixed(1)}%, file c fell to ${cut.perFile[2].entries}`);
    check(
      "a 5% guard on the TOTAL would not notice",
      cut.urls.size >= base.urls.size * 0.95,
      `${(totalDrop * 100).toFixed(1)}% drop`
    );
    const warnings = comparePerFile(cut.perFile, base.perFile);
    check("the per-file check does notice", warnings.length === 1, warnings[0] ?? "(none)");
    check(
      "and it names the file and the size",
      (warnings[0] ?? "").includes("sitemap_product_c.xml") && (warnings[0] ?? "").includes("200"),
      warnings[0] ?? ""
    );
    files.c.truncate = false;

    console.log("");
    console.log("comparePerFile, in isolation");
    const now = [{ url: "f1", entries: 100 }, { url: "f2", entries: 100 }];
    check("no previous run means no warnings", comparePerFile(now, []).length === 0);
    check("steady files are quiet", comparePerFile(now, now).length === 0);
    check(
      "growth is never a warning",
      comparePerFile([{ url: "f1", entries: 400 }], [{ url: "f1", entries: 100 }]).length === 0
    );
    check(
      `a drop just inside ${FILE_SHRINK_LIMIT} is quiet`,
      comparePerFile([{ url: "f1", entries: 81 }], [{ url: "f1", entries: 100 }]).length === 0
    );
    check(
      `a drop past ${FILE_SHRINK_LIMIT} warns`,
      comparePerFile([{ url: "f1", entries: 79 }], [{ url: "f1", entries: 100 }]).length === 1
    );
    check(
      "a file that disappeared is reported",
      comparePerFile([{ url: "f1", entries: 100 }], now).some((w) => w.includes("absent now"))
    );
    check(
      "a brand new file is not reported as a problem",
      comparePerFile([...now, { url: "f3", entries: 50 }], now).length === 0
    );

    console.log("");
    console.log("addresses whose id cannot be read");
    check("a healthy sitemap drops nothing", base.unparseable === 0, `${base.unparseable}`);
    files.a.weird = 40;
    const reshaped = await discoverProductUrls();
    check("reshaped URLs are counted, not silently skipped", reshaped.unparseable === 40, `${reshaped.unparseable}`);
    check("samples are carried for the report", reshaped.unparseableSamples.length === 5);
    check(
      "and the parseable ones still come through",
      reshaped.urls.size === 10_200,
      `${reshaped.urls.size}`
    );
    files.a.weird = 0;
  } finally {
    server.close();
    delete process.env.CONTINENTE_SITEMAP_URL;
  }

  return failures;
}
