import type { Store } from "@/generated/prisma/client";
import { buildFailureReport } from "./daily-report";
import { renderReport, writeReport } from "./render-report";
import { httpStats } from "../http";

/**
 * A run that dies must still leave a report saying so.
 *
 * Without this a crash writes nothing, so `reports/latest.md` still holds
 * YESTERDAY's report - reading OK, for a night that never happened. Anyone
 * checking how the run went is reassured by a stale green verdict, which is
 * precisely the failure the reports exist to catch. A scheduled job nobody
 * watches makes this worse, not better: the silence looks like success.
 *
 * Best-effort by construction. Whatever killed the run may equally stop the
 * report being written - an unreachable database would do both - so this never
 * throws on top of the original error, and the original is printed first, before
 * anything else is attempted. When even the report cannot be written it says so
 * explicitly, because "no report exists" is information the reader needs in
 * order to distrust `latest.md`.
 */
export async function writeCrashReport(store: Store, error: unknown): Promise<boolean> {
  console.error(error);
  try {
    const report = buildFailureReport({
      store,
      seenAt: new Date(),
      error,
      audit: null,
      http: httpStats(),
      baseline: { runs: 0, since: null },
    });
    const written = await writeReport(report, { explain: true });
    console.error(`\n${renderReport(report, { explain: false })}`);
    console.error(`failure report written to ${written.text}`);
    return true;
  } catch (secondary) {
    console.error(
      `\ncould not write a failure report: ${(secondary as Error).message}` +
        `\nreports/latest.md is therefore STALE and describes an earlier run.`
    );
    return false;
  }
}
