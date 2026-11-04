/**
 * The fixed choices of the "Reportar um erro" form, shared by the form in the
 * visitor's browser and the checks on the server (error-reports.ts). Kept
 * apart because the form must not load the server's file code.
 */
export const REASONS = {
  produto: "Produto errado ou não comparável",
  preco: "Preço errado",
  tamanho: "Tamanho ou peso errado",
  outro: "Outro",
} as const;
export type Reason = keyof typeof REASONS;

export const COMMENT_MAX = 500;
