"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { euros } from "@/lib/money";

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

interface Props {
  /** one row per day, `date` as "2026-08-06", one number per series key */
  data: Record<string, string | number>[];
  series: ChartSeries[];
  /** e.g. "L" or "kg" - appended as €/unitLabel on the axis and tooltip. */
  unitLabel?: string;
  height?: number;
}

/** "2026-08-06" as a timestamp at UTC midnight - only ever formatted back as a day, never as a time. */
function timeOf(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * A timestamp back to "06/08", matching the date format used everywhere else in
 * the UI. Read in UTC on purpose: the timestamp is UTC midnight, so formatting
 * it in a timezone behind UTC would render the previous day.
 */
function formatDay(t: number): string {
  const d = new Date(t);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Round steps for the price axis: the smallest of 1, 2, 5 cents, 10, 20, 50
 * cents, 1, 2, 5 euros... that needs at most six lines. Left to itself the
 * chart chose 1.5-cent steps and printed them rounded - 0.80, 0.81, 0.83.
 */
function priceTicks(values: number[]): { domain: [number, number]; ticks: number[] } | null {
  if (values.length === 0) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
  // A quarter step of room at each end, so no line runs along the frame.
  const span = (s: number) => [Math.floor((lo - s / 4) / s), Math.ceil((hi + s / 4) / s)];
  const step = steps.find((s) => span(s)[1] - span(s)[0] <= 5) ?? 100;
  const [from, to] = span(step);
  // Built from whole multiples, then rounded, so 0.1 + 0.2 never shows as 0.30000000000000004.
  const ticks = Array.from({ length: to - from + 1 }, (_, i) => Math.round((from + i) * step * 100) / 100);
  return { domain: [ticks[0], ticks[ticks.length - 1]], ticks };
}

/**
 * Prices over time, one line per store.
 *
 * On a time axis, so two crawls a fortnight apart sit a fortnight apart rather
 * than side by side, and drawn as steps: a shelf price holds until it changes,
 * and a smooth curve between two readings would invent prices in between.
 */
export default function PriceHistoryChart({ data, series, unitLabel, height = 360 }: Props) {
  const suffix = unitLabel ? `€/${unitLabel}` : "€";
  const timed = data.map((row) => ({ ...row, t: timeOf(String(row.date)) }));
  const axis = priceTicks(
    data.flatMap((row) => series.map((s) => row[s.key]).filter((v): v is number => typeof v === "number"))
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={timed} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          fontSize={12}
          tickFormatter={formatDay}
        />
        <YAxis
          fontSize={12}
          width={64}
          tickFormatter={(v) => `${euros(Number(v))}€`}
          domain={axis ? axis.domain : ["auto", "auto"]}
          ticks={axis?.ticks}
        />
        <Tooltip
          formatter={(value) => `${euros(Number(value))}${suffix}`}
          labelFormatter={(label) => formatDay(Number(label))}
        />
        {/* In the order given (the site's store order), not alphabetical. */}
        <Legend itemSorter={null} />
        {series.map((s) => (
          <Line
            key={s.key}
            type="stepAfter"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            connectNulls
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
