import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";

/**
 * "How we compare" (the owner's yes, 4 November 2026; the text is his to
 * approve). Plain facts only: each sentence must stay true of what the code
 * does - change it when the collection or the comparisons change. No personal
 * name or email (his rule: his personal address never appears in public).
 */
export const metadata: Metadata = {
  title: "Como comparamos — Poupa Fácil",
};

export default function ComoComparamos() {
  return (
    <main className={styles.main}>
      <Link href="/" className={styles.back}>
        ← Início
      </Link>
      <h1>Como comparamos</h1>

      <section>
        <h2>De onde vêm os preços</h2>
        <p>
          Todas as noites lemos os preços nos sites do Continente, do Pingo Doce e do Auchan. São os preços que
          cada site mostra a qualquer visitante, sem sessão iniciada. A data em que os preços foram recolhidos
          aparece no fundo de cada página.
        </p>
        <p>
          Os preços nas lojas físicas podem ser diferentes dos preços nos sites. Descontos de cartão de cliente,
          cupões ou talões só estão incluídos quando o site os mostra no próprio preço.
        </p>
      </section>

      <section>
        <h2>Comparamos o que é comparável</h2>
        <p>
          Cada comparação junta apenas produtos do mesmo tipo e da mesma forma: fresco com fresco, congelado com
          congelado, inteiro com inteiro, fatiado com fatiado. Comparamos o preço por quilo, por litro ou por
          unidade (nos ovos, por exemplo), para que embalagens de tamanhos diferentes possam ser comparadas.
        </p>
        <p>
          Nas conservas, usamos o peso escorrido quando a loja o indica. Debaixo de cada produto mostramos também
          o preço da embalagem e o seu tamanho, e uma ligação para a página do produto no site da loja, para que
          qualquer pessoa possa confirmar.
        </p>
        <p>
          As promoções aparecem tal como a loja as mostra, com o preço anterior riscado. Um produto que a loja
          indica como esgotado não conta como o mais barato.
        </p>
      </section>

      <section>
        <h2>O que significam as indicações</h2>
        <dl className={styles.terms}>
          <dt>Indisponível</dt>
          <dd>
            O site da loja não mostra hoje nenhum produto à venda nesta comparação. Não quer dizer que a loja
            nunca o venda: pode estar esgotado ou existir apenas nas lojas físicas.
          </dd>
          <dt>Sem peso indicado</dt>
          <dd>
            A loja vende o produto, mas não indica o peso ou o volume, por isso não é possível calcular o preço
            por quilo ou por litro.
          </dd>
          <dt>Marca própria</dt>
          <dd>O produto mais barato da marca da própria cadeia, que pode ser diferente do mais barato de todos.</dd>
        </dl>
      </section>

      <section>
        <h2>Independência</h2>
        <p>
          Este site é independente. Não tem qualquer ligação ao Continente, ao Pingo Doce ou ao Auchan, nem é pago
          por eles.
        </p>
      </section>

      <section>
        <h2>Encontrou um erro?</h2>
        <p>
          Em cada comparação há uma ligação «Reportar um erro». Não pedimos nome nem email. Cada aviso é lido e,
          se houver um erro, é corrigido.
        </p>
      </section>
    </main>
  );
}
