import type { CrawlCategory } from "./types";

/**
 * Pingo Doce's food-section category ids, for the catalogue crawl.
 *
 * Pingo Doce's top level is more granular than Continente's: each of these is a
 * whole department, browsed via `Search-Show?cgid=<cgid>` (paginates by `start`,
 * honours a large `sz`). The `cgid`s follow the pattern `ec_<slug>_<number>` and
 * were read from each category's landing page, one time, by hand.
 *
 * These are the food branches. The non-food departments (Limpeza, Casa e
 * Eletrodomésticos, Livraria e Papelaria, Higiene Pessoal e Beleza, Bebé e
 * Criança, Parafarmácia, Animais) are deliberately left out - that is how the
 * "no pencils or pans" requirement is met.
 *
 * `label` is for humans reading crawl output only. Mapping a store category onto
 * the app's own taxonomy is a separate, later step - not done here.
 */
export const PINGO_DOCE_FOOD_CATEGORIES: CrawlCategory[] = [
  { cgid: "ec_frutasevegetais_100", label: "Frutas e Vegetais" },
  { cgid: "ec_talho_200", label: "Talho" },
  { cgid: "ec_peixaria_300", label: "Peixaria" },
  { cgid: "ec_padariaepastelaria_400", label: "Padaria e Pastelaria" },
  { cgid: "ec_charcutariaqueijos_500", label: "Charcutaria e Queijos" },
  { cgid: "ec_ovos_600", label: "Ovos" },
  { cgid: "ec_manteigamargarinanatas_700", label: "Manteiga, Margarina e Natas" },
  { cgid: "ec_iogurtessobremesas_800", label: "Iogurtes e Sobremesas" },
  { cgid: "ec_leitebebidasvegetais_900", label: "Leite e Bebidas Vegetais" },
  { cgid: "ec_congelados_1000", label: "Congelados" },
  { cgid: "ec_cafechaachocolatados_1100", label: "Café, Chá e Achocolatados" },
  { cgid: "ec_bolachascereaisguloseimas_1200", label: "Bolachas, Cereais e Guloseimas" },
  { cgid: "ec_mercearia_1300", label: "Mercearia" },
  { cgid: "ec_aguassumosrefrigerantes_1400", label: "Águas, Sumos e Refrigerantes" },
  { cgid: "ec_cervejassidras_1500", label: "Cervejas e Sidras" },
  { cgid: "ec_espirituosas_1600", label: "Espirituosas" },
  { cgid: "ec_vinhos_1700", label: "Vinhos" },
  { cgid: "ec_takeaway_2400", label: "Take Away" },
  { cgid: "ec_alternativasalimentares_2400", label: "Alternativas Alimentares" },
];
