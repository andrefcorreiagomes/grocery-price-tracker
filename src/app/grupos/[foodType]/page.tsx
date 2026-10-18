import Link from "next/link";
import { notFound } from "next/navigation";
import { getFoodTypePage, getFreshness, MAX_NAMED_GROUPS, type NamedGroups } from "@/lib/grupos";
import type { ComparisonGroup } from "@/lib/comparison-groups";
import { STORE_ORDER, STORE_LABELS } from "@/lib/stores";
import type { Cell } from "@/lib/comparison";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const UNIT_LABEL: Record<string, string> = { kg: "kg", l: "L", un: "un" };

/**
 * One store's answer.
 *
 * The three kinds must LOOK different, which is the whole reason `Cell` is a
 * union rather than a nullable price. "Não vende" and "sem peso indicado" are
 * different facts - the first says the chain does not sell this food, the
 * second says it does but we cannot work out a price per kilo - and rendering
 * both as an empty cell would be the page's most frequent lie. They are common,
 * not rare: Continente publishes a size for 57% of its products.
 */
function StoreCell({ cell, unit, best }: { cell: Cell; unit: string; best: boolean }) {
  if (cell.kind === "not-stocked") {
    return (
      <div className={styles.cell}>
        <span className={styles.absent}>Não vende</span>
      </div>
    );
  }
  if (cell.kind === "no-size") {
    return (
      <div className={styles.cell}>
        <span className={styles.unknown}>Sem peso indicado</span>
        <span className={styles.product}>{cell.example.name}</span>
      </div>
    );
  }
  return (
    <div className={`${styles.cell} ${best ? styles.best : ""}`}>
      <span className={styles.figure}>
        {cell.unitPrice.toFixed(2)} €<span className={styles.per}>/{UNIT_LABEL[unit]}</span>
      </span>
      {/* The product is NAMED on purpose: a number alone cannot tell you that
          the cheapest "queijo" is a children's dessert. */}
      <span className={styles.product}>{cell.product.name}</span>
    </div>
  );
}

function Comparison({
  title,
  note,
  cells,
  unit,
  winners,
}: {
  title: string;
  note: string;
  cells: Map<string, Cell>;
  unit: string;
  winners: string[];
}) {
  return (
    <section className={styles.group}>
      <h3>{title}</h3>
      <p className={styles.note}>{note}</p>
      <div className={styles.stores}>
        {STORE_ORDER.map((store) => (
          <div key={store} className={styles.store}>
            <span className={styles.storeName}>{STORE_LABELS[store]}</span>
            <StoreCell cell={cells.get(store) as Cell} unit={unit} best={winners.includes(store)} />
          </div>
        ))}
      </div>
    </section>
  );
}

const UNIT_WORDS: Record<string, string> = { kg: "ao peso", l: "ao volume", un: "à unidade" };

/**
 * One comparison: products of the same sub-kind and labels, in one unit. The
 * heading names exactly what is being compared ("Peito · Congelado"), because
 * the point of the groups is that the page never sets fresh chicken breast
 * against a frozen whole chicken.
 */
function GroupBlock({ group, showUnit }: { group: ComparisonGroup; showUnit: boolean }) {
  return (
    <section className={styles.unitBlock} id={anchor(group.key)}>
      <h2 className={styles.groupHeading}>
        {group.title}
        {showUnit && <span className={styles.unitWord}> ({UNIT_WORDS[group.unit]})</span>}
        <span className={styles.groupCount}>
          {group.products} produto{group.products === 1 ? "" : "s"}
        </span>
      </h2>
      <Comparison
        title="O mais barato de cada loja"
        note="O produto mais barato desta comparação em cada cadeia, seja de que marca for."
        cells={group.cheapest}
        unit={group.unit}
        winners={group.winners}
      />
      {/* Only when a chain has an own-brand product here: a row of three "Não
          vende" would say the chains do not sell this, which is false. */}
      {[...group.ownBrand.values()].some((c) => c.kind !== "not-stocked") && (
        <Comparison
          title="Marca própria"
          note="A marca da própria cadeia. Pode dar um vencedor diferente do de cima."
          cells={group.ownBrand}
          unit={group.unit}
          winners={group.ownBrandWinners}
        />
      )}
    </section>
  );
}

/** "This exact thing I buy - where is it cheaper?" - the confirmed identical products. */
function NamedBlock({ named, unit, showUnit }: { named: NamedGroups; unit: string; showUnit: boolean }) {
  if (named.found === 0) return null;
  return (
    <section className={styles.group}>
      <h3>
        O mesmo produto em duas cadeias
        {showUnit && <span className={styles.unitWord}> ({UNIT_WORDS[unit]})</span>}
      </h3>
      <p className={styles.note}>
        Produtos que confirmámos ser exactamente o mesmo artigo em duas cadeias.
        Nenhum aparece nas três, porque o Pingo Doce não publica código de barras
        e sem ele não é possível ter a certeza.
        {named.comparable > 0 && " Ordenados pela maior diferença de preço."}
      </p>
      {named.shown.map((g) => (
        <div key={g.id} className={styles.named}>
          <h4 className={styles.namedTitle}>{g.name}</h4>
          <div className={styles.stores}>
            {STORE_ORDER.map((store) => (
              <div key={store} className={styles.store}>
                <span className={styles.storeName}>{STORE_LABELS[store]}</span>
                <StoreCell cell={g.cells.get(store) as Cell} unit={unit} best={g.winners.includes(store)} />
              </div>
            ))}
          </div>
        </div>
      ))}
      {named.comparable === 0 && (
        <p className={styles.note}>
          {/* igual -> iguais, not "igualis": Portuguese -al pluralises to
              -ais. Written out rather than assembled from a stem. */}
          {named.found === 1 ? "Encontrámos 1 produto igual" : `Encontrámos ${named.found} produtos iguais`}{" "}
          em duas cadeias, mas nenhum pode ser comparado: numa das lojas falta o
          peso, e sem peso não há preço ao quilo.
        </p>
      )}
      {named.comparable > MAX_NAMED_GROUPS && (
        <p className={styles.note}>
          Mostramos {MAX_NAMED_GROUPS} de {named.comparable} produtos iguais — os de maior diferença de preço.
        </p>
      )}
    </section>
  );
}

/** A comparison's key as a link target: letters, digits and hyphens only. */
function anchor(key: string): string {
  return "c-" + key.replace(/[^a-z0-9]+/gi, "-").replace(/-+$/, "");
}

/** The unit is worth naming when the same comparison exists in two units. */
function unitShown(groups: ComparisonGroup[], g: ComparisonGroup): boolean {
  return groups.some((o) => o !== g && o.title === g.title);
}

export default async function FoodTypePage({
  params,
}: {
  params: Promise<{ foodType: string }>;
}) {
  const { foodType } = await params;
  const [page, freshness] = await Promise.all([
    getFoodTypePage(decodeURIComponent(foodType)),
    getFreshness(),
  ]);
  if (!page) notFound();

  return (
    <main className={styles.main}>
      <Link href="/grupos" className={styles.back}>
        ← Todos os alimentos
      </Link>
      {page.category && <p className={styles.category}>{page.category.label}</p>}
      <h1>{page.label}</h1>
      <p className={styles.count}>
        {page.productCount} produto{page.productCount === 1 ? "" : "s"} nas cadeias
        {page.groups.length > 1 && ` · ${page.groups.length} comparações`}
      </p>

      {page.groups.length > 1 && (
        <nav className={styles.contents} aria-label="Comparações nesta página">
          {page.groups.map((g) => (
            <a key={g.key} href={`#${anchor(g.key)}`}>
              {g.title}
              {unitShown(page.groups, g) && ` (${UNIT_WORDS[g.unit]})`}
            </a>
          ))}
        </nav>
      )}

      {page.groups.map((g) => (
        <GroupBlock key={g.key} group={g} showUnit={unitShown(page.groups, g)} />
      ))}

      {page.groups.length === 0 && (
        <p className={styles.note}>
          Nenhuma comparação é possível para já: é preciso que duas cadeias
          vendam o mesmo tipo de produto e indiquem o peso ou o volume.
        </p>
      )}

      {page.notCompared > 0 && page.groups.length > 0 && (
        <p className={styles.note}>
          {page.notCompared} produto{page.notCompared === 1 ? " fica" : "s ficam"} de fora:
          pertence{page.notCompared === 1 ? "" : "m"} a comparações que só uma cadeia
          vende, ou sem peso indicado.
        </p>
      )}

      {page.named.map((n) => (
        <NamedBlock key={n.unit} named={n.groups} unit={n.unit} showUnit={page.named.length > 1} />
      ))}

      {/* Per chain, not one date: they genuinely differ, and comparing a price
          from today against one from last week deserves to say so. */}
      <footer className={styles.footer}>
        Preços recolhidos:{" "}
        {freshness.map((f, i) => (
          <span key={f.store}>
            {i > 0 && " · "}
            {STORE_LABELS[f.store as keyof typeof STORE_LABELS]}{" "}
            {f.lastSeenAt.toLocaleDateString("pt-PT")}
          </span>
        ))}
      </footer>
    </main>
  );
}
