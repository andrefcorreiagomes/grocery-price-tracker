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

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

interface Props {
  data: Record<string, string | number>[];
  series: ChartSeries[];
  /** e.g. "L" or "kg" - appended as €/unitLabel on the axis and tooltip. */
  unitLabel?: string;
}

/**
 * "2026-08-06" -> "06/08", matching the date format used everywhere else in the
 * UI. Split rather than parsed on purpose: `new Date("2026-08-06")` is UTC
 * midnight, so formatting it in a timezone behind UTC renders the previous day.
 * The year is left off - the axis is dense and the range makes it obvious.
 */
function formatDay(key: string): string {
  const [, month, day] = key.split("-");
  return `${day}/${month}`;
}

export default function PriceHistoryChart({ data, series, unitLabel }: Props) {
  const suffix = unitLabel ? `€/${unitLabel}` : "€";

  return (
    <ResponsiveContainer width="100%" height={360}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="date" fontSize={12} tickFormatter={formatDay} />
        <YAxis
          fontSize={12}
          unit={suffix}
          domain={["dataMin - 0.1", "dataMax + 0.1"]}
        />
        <Tooltip
          formatter={(value) => `${Number(value).toFixed(2)}${suffix}`}
          labelFormatter={(label) => formatDay(String(label))}
        />
        <Legend />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            connectNulls
            dot={{ r: 3 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
