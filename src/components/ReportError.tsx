"use client";

import { useActionState } from "react";
import { sendErrorReport, type ReportState } from "@/app/grupos/[foodType]/report-action";
import { COMMENT_MAX, REASONS } from "@/lib/error-report-choices";
import { STORE_LABELS, STORE_ORDER } from "@/lib/stores";
import styles from "./ReportError.module.css";

const START: ReportState = { status: "idle", message: "" };

/**
 * The server's answer, or a calm message when the request itself fails - a
 * dropped connection, a new version of the site, or a request over the 16 kB
 * limit (only possible by getting round the comment box's own limit). Without
 * this the error would replace the whole page (found in testing, 4 November
 * 2026).
 */
async function send(previous: ReportState, form: FormData): Promise<ReportState> {
  try {
    return await sendErrorReport(previous, form);
  } catch {
    return { status: "error", message: "Não foi possível enviar o aviso. Recarregue a página e tente de novo." };
  }
}

/**
 * "Reportar um erro" under each comparison (the owner's option A, 4 November
 * 2026). Closed until asked for. No name or email. Which comparison it is
 * about travels in two hidden fields and is checked again on the server.
 */
export default function ReportError({ foodType, comparison }: { foodType: string; comparison: string }) {
  const [state, submit, pending] = useActionState(send, START);
  return (
    <details className={styles.report}>
      <summary>Reportar um erro</summary>
      {state.status === "sent" ? (
        <p className={styles.sent} role="status">
          {state.message}
        </p>
      ) : (
        <form action={submit} className={styles.form}>
          <input type="hidden" name="foodType" value={foodType} />
          <input type="hidden" name="comparison" value={comparison} />
          {/* The trap: hidden from people, filled in by programs. */}
          <div className={styles.trap} aria-hidden="true">
            <label>
              Website
              <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
            </label>
          </div>

          <label className={styles.field}>
            Loja
            <select name="store" defaultValue="">
              <option value="">Toda a comparação</option>
              {STORE_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STORE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>

          <fieldset className={styles.field}>
            <legend>O que está errado?</legend>
            {Object.entries(REASONS).map(([value, label]) => (
              <label key={value} className={styles.choice}>
                <input type="radio" name="reason" value={value} required /> {label}
              </label>
            ))}
          </fieldset>

          <label className={styles.field}>
            Comentário (opcional)
            <textarea name="comment" maxLength={COMMENT_MAX} rows={3} />
          </label>
          <p className={styles.hint}>Não precisa de deixar nome nem email.</p>

          {state.status === "error" && (
            <p className={styles.error} role="alert">
              {state.message}
            </p>
          )}
          <button type="submit" disabled={pending}>
            {pending ? "A enviar…" : "Enviar"}
          </button>
        </form>
      )}
    </details>
  );
}
