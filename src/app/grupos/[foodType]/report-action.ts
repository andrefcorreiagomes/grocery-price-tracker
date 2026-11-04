"use server";

import { headers } from "next/headers";
import { ReportLimiter, saveReport, validateReport, visitorKey } from "@/lib/error-reports";

/**
 * The "Reportar um erro" form's server side. Reachable by anyone who can send
 * a POST, not only through the form, so everything is checked here
 * (src/lib/error-reports.ts says how each risk is met). It answers with a
 * short message only, never with what was stored.
 */

export interface ReportState {
  status: "idle" | "sent" | "error";
  message: string;
}

const limiter = new ReportLimiter();

const THANKS = "Obrigado. O aviso foi enviado e vai ser verificado.";

export async function sendErrorReport(_previous: ReportState, form: FormData): Promise<ReportState> {
  const now = new Date();
  // The hidden field people never see: a program that fills it is told its
  // report was sent, and nothing is kept.
  const trap = form.get("website");
  if (typeof trap !== "string" || trap !== "") return { status: "sent", message: THANKS };

  const checked = validateReport(form, now);
  if ("error" in checked) return { status: "error", message: checked.error };

  const h = await headers();
  const address = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (!limiter.allow(visitorKey(address, now), now)) {
    return { status: "error", message: "Recebemos muitos avisos seguidos. Tente de novo mais tarde." };
  }

  try {
    await saveReport(checked.report);
  } catch (e) {
    console.error("error report not saved:", e instanceof Error ? e.message : e);
    return { status: "error", message: "Não foi possível guardar o aviso. Tente de novo mais tarde." };
  }
  return { status: "sent", message: THANKS };
}
