import type { TypeReport } from "./validate-comparisons";

/**
 * The review page for `npm run validate:comparisons`.
 *
 * Its job is a decision, not a summary: which kinds of food are fair enough to
 * put on the site. So it is built to be SCANNED - the remedy groups first,
 * because each is fixed somewhere different, then one dense table with the
 * cheapest product NAMED at every store, since a name is what lets a reader see
 * that the cheapest "cheese" is a children's dessert.
 */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const money = (n: number | null, unit: string) =>
  n === null ? "&mdash;" : `${n.toFixed(2)}<span class="per">/${esc(unit)}</span>`;

const SHORT: Record<string, string> = {
  CONTINENTE: "Continente",
  PINGO_DOCE: "Pingo Doce",
  AUCHAN: "Auchan",
};

function typeRow(r: TypeReport): string {
  const worst = r.problems.some((p) => p.kind === "data")
    ? "data"
    : r.problems.some((p) => p.kind === "unit")
      ? "unit"
      : r.problems.some((p) => p.kind === "breadth")
        ? "breadth"
        : "clear";

  const names = r.cheapestNames
    .map(
      (c) =>
        `<div class="who"><span class="store">${esc(SHORT[c.store] ?? c.store)}</span>` +
        `<span class="num">${c.unitPrice.toFixed(2)}</span>` +
        `<span class="prod">${esc(c.name)}</span></div>`
    )
    .join("");

  const flags = r.problems
    .map((p) => `<span class="chip chip-${p.kind}">${esc(p.text)}</span>`)
    .join(" ");

  return `<tr class="r-${worst}">
    <th scope="row">${esc(r.label)}</th>
    <td class="num">${r.n}</td>
    <td class="num">${r.stores}</td>
    <td class="num">${money(r.cheapest, r.unit)}</td>
    <td class="num">${money(r.median, r.unit)}</td>
    <td class="num">${r.breadth === null ? "&mdash;" : r.breadth.toFixed(1) + "&times;"}</td>
    <td class="cheapest">${names}${flags ? `<div class="flags">${flags}</div>` : ""}</td>
  </tr>`;
}

function remedySection(
  title: string,
  who: string,
  blurb: string,
  reports: TypeReport[],
  kind: string
): string {
  if (reports.length === 0) return "";
  const items = reports
    .map((r) => {
      const texts = r.problems.filter((p) => p.kind === kind).map((p) => esc(p.text)).join("; ");
      return `<li><span class="lbl">${esc(r.label)}</span><span class="det">${texts}</span></li>`;
    })
    .join("");
  return `<section class="remedy">
    <header><h3>${esc(title)}</h3><span class="owner">${esc(who)}</span></header>
    <p>${blurb}</p>
    <ul class="findings">${items}</ul>
  </section>`;
}

export function renderComparisonReport(reports: TypeReport[], when: Date): string {
  const threeStore = reports.filter((r) => r.stores === 3);
  const clean = reports.filter((r) => r.problems.length === 0);
  const cleanThree = reports.filter((r) => r.stores === 3 && r.problems.length === 0);

  const has = (k: string) => reports.filter((r) => r.problems.some((p) => p.kind === k));
  const byBreadth = [...reports].sort((a, b) => (b.breadth ?? 0) - (a.breadth ?? 0));

  return `<title>Which foods can we compare?</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500;6..72,600&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
  :root {
    --ground: #f3f5f2;
    --surface: #ffffff;
    --line: #dfe4de;
    --line-soft: #ebeee9;
    --ink: #1a1f1b;
    --muted: #5e6a62;
    --accent: #2f5d50;
    --warn: #8c5a10;
    --warn-bg: #f7efdf;
    --bad: #a33a2a;
    --bad-bg: #f8e7e3;
    --ok: #2f6b3f;
    --ok-bg: #e6efe7;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --ground: #141714;
      --surface: #1b1f1c;
      --line: #2e352f;
      --line-soft: #23291f;
      --ink: #e8ece7;
      --muted: #9aa79e;
      --accent: #7fbfab;
      --warn: #e0b063;
      --warn-bg: #2f2717;
      --bad: #e58a76;
      --bad-bg: #331e19;
      --ok: #8dc79a;
      --ok-bg: #1c2a1f;
    }
  }
  :root[data-theme="dark"] {
    --ground: #141714;
    --surface: #1b1f1c;
    --line: #2e352f;
    --line-soft: #23291f;
    --ink: #e8ece7;
    --muted: #9aa79e;
    --accent: #7fbfab;
    --warn: #e0b063;
    --warn-bg: #2f2717;
    --bad: #e58a76;
    --bad-bg: #331e19;
    --ok: #8dc79a;
    --ok-bg: #1c2a1f;
  }

  body {
    background: var(--ground);
    color: var(--ink);
    font-family: "IBM Plex Sans", system-ui, sans-serif;
    line-height: 1.55;
    margin: 0;
    padding: clamp(1.5rem, 4vw, 3.5rem) clamp(1rem, 4vw, 3rem) 5rem;
  }
  .wrap { max-width: 74rem; margin: 0 auto; display: flex; flex-direction: column; gap: 2.5rem; }

  h1 {
    font-family: Newsreader, Georgia, serif;
    font-weight: 600; font-size: clamp(1.9rem, 4vw, 2.6rem);
    line-height: 1.15; margin: 0; text-wrap: balance; letter-spacing: -0.01em;
  }
  .lede { color: var(--muted); max-width: 62ch; margin: 0.6rem 0 0; }
  .stamp {
    font-family: "IBM Plex Mono", monospace; font-size: 0.75rem;
    text-transform: uppercase; letter-spacing: 0.09em; color: var(--muted); margin: 0 0 0.7rem;
  }

  .tally { display: flex; flex-wrap: wrap; gap: 2.5rem; padding: 1.4rem 0; border-block: 1px solid var(--line); }
  .tally div { display: flex; flex-direction: column; gap: 0.15rem; }
  .tally .n {
    font-family: "IBM Plex Mono", monospace; font-size: 1.9rem; font-weight: 500;
    font-variant-numeric: tabular-nums; line-height: 1;
  }
  .tally .k { font-size: 0.8rem; color: var(--muted); }
  .tally .lead .n { color: var(--accent); }

  h2 {
    font-family: Newsreader, Georgia, serif; font-weight: 600;
    font-size: 1.45rem; margin: 0 0 0.3rem;
  }
  .section-note { color: var(--muted); margin: 0 0 1.2rem; max-width: 62ch; }

  .remedy { border-top: 1px solid var(--line-soft); padding-top: 1.1rem; }
  .remedy header { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
  .remedy h3 { font-size: 1rem; margin: 0; font-weight: 600; }
  .remedy .owner {
    font-family: "IBM Plex Mono", monospace; font-size: 0.7rem;
    text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted);
  }
  .remedy p { color: var(--muted); margin: 0.4rem 0 0.9rem; max-width: 62ch; font-size: 0.93rem; }
  .findings { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
  .findings li { display: flex; gap: 0.9rem; align-items: baseline; font-size: 0.9rem; }
  .findings .lbl { min-width: 11rem; font-weight: 500; }
  .findings .det { color: var(--muted); font-family: "IBM Plex Mono", monospace; font-size: 0.82rem; }

  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 0.88rem; }
  thead th {
    text-align: left; font-weight: 500; font-size: 0.72rem; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--muted); padding: 0 0.7rem 0.55rem;
    border-bottom: 1px solid var(--line); white-space: nowrap;
  }
  thead th.num, td.num { text-align: right; }
  tbody th { text-align: left; font-weight: 600; padding: 0.6rem 0.7rem; white-space: nowrap; vertical-align: top; }
  tbody td { padding: 0.6rem 0.7rem; vertical-align: top; border-bottom: 1px solid var(--line-soft); }
  tbody th { border-bottom: 1px solid var(--line-soft); vertical-align: top; }
  td.num, .num {
    font-family: "IBM Plex Mono", monospace; font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .per { color: var(--muted); font-size: 0.8em; }

  .who { display: grid; grid-template-columns: 6.5rem 4.2rem 1fr; gap: 0.6rem; align-items: baseline; }
  .who .store { color: var(--muted); font-size: 0.8rem; }
  .who .num { font-size: 0.84rem; }
  .who .prod { font-family: "IBM Plex Mono", monospace; font-size: 0.78rem; color: var(--ink); }
  .flags { margin-top: 0.4rem; display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .chip {
    font-family: "IBM Plex Mono", monospace; font-size: 0.7rem; padding: 0.1rem 0.45rem;
    border-radius: 2px; white-space: nowrap;
  }
  .chip-data { background: var(--bad-bg); color: var(--bad); }
  .chip-unit { background: var(--warn-bg); color: var(--warn); }
  .chip-breadth { background: var(--ok-bg); color: var(--ok); }

  tr.r-data th { box-shadow: inset 3px 0 0 var(--bad); }
  tr.r-unit th { box-shadow: inset 3px 0 0 var(--warn); }
  tr.r-breadth th { box-shadow: inset 3px 0 0 var(--ok); }

  @media (max-width: 46rem) {
    .who { grid-template-columns: 5.5rem 3.6rem; }
    .who .prod { grid-column: 1 / -1; }
  }
</style>

<div class="wrap">
  <header>
    <p class="stamp">Price-comparison readiness &middot; ${when.toISOString().slice(0, 10)}</p>
    <h1>Which foods can we compare?</h1>
    <p class="lede">
      Every kind of food in the catalogue, checked before any of it reaches a page.
      The page ranks by cheapest, and cheapest is where every error lands &mdash; so a
      wrong size or a mixed-up shelf shows up first and loudest. This is the list
      to choose from.
    </p>
  </header>

  <div class="tally">
    <div class="lead"><span class="n">${cleanThree.length}</span><span class="k">ready: three stores, nothing flagged</span></div>
    <div><span class="n">${threeStore.length}</span><span class="k">comparable across three stores</span></div>
    <div><span class="n">${clean.length}</span><span class="k">with no problems at all</span></div>
    <div><span class="n">${reports.length}</span><span class="k">kinds of food in total</span></div>
  </div>

  <section>
    <h2>What needs deciding</h2>
    <p class="section-note">
      Grouped by where the fix lives. Two of these are fixes in the code; the third
      is a judgement about Portuguese groceries, made by a person.
    </p>

    ${remedySection(
      "Kilos and litres in one ranking",
      "fixed in code",
      "These declare no unit, so a bottle priced per litre is ranked against a packet priced per kilo. " +
        "Ch&aacute; puts a 1.5&nbsp;L bottle of iced tea at &euro;1.49 above a 50&nbsp;g box of tea bags at &euro;39.80 and calls it cheaper. " +
        "The fix is to declare the unit &mdash; but a few genuinely sell both ways, and those need splitting instead.",
      has("unit"),
      "unit"
    )}

    ${remedySection(
      "A size or a price is still wrong",
      "fixed in code",
      "A price per kilo below &euro;0.10 or above &euro;200 is a parse error, not a bargain &mdash; except where it is not: " +
        "saffron really is about &euro;10,000 a kilo and caviar about &euro;2,000. Each of these needs looking at rather than clearing.",
      has("data"),
      "data"
    )}

    ${remedySection(
      "The kind of food may be too broad",
      "judgement call",
      "Here the arithmetic is right and the category is the problem: the cheapest member is nothing like a typical one. " +
        "Queijo answers &euro;2.63/kg with a children&rsquo;s fromage frais while real cheese starts at &euro;5.22, and massa answers with instant noodles rather than pasta. " +
        "Leaving one off the site costs a missing answer; shipping it costs a wrong one.",
      has("breadth"),
      "breadth"
    )}
  </section>

  <section>
    <h2>Every kind of food</h2>
    <p class="section-note">
      Sorted by how far the cheapest sits below the typical price, worst first &mdash; which is
      the order in which they are most likely to mislead. The cheapest product at each
      store is named, because a name is what tells you whether the answer is really cheese.
    </p>
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Kind of food</th>
            <th scope="col" class="num">Products</th>
            <th scope="col" class="num">Stores</th>
            <th scope="col" class="num">Cheapest</th>
            <th scope="col" class="num">Typical</th>
            <th scope="col" class="num">Gap</th>
            <th scope="col">Cheapest at each store</th>
          </tr>
        </thead>
        <tbody>
          ${byBreadth.map(typeRow).join("\n")}
        </tbody>
      </table>
    </div>
  </section>
</div>`;
}
