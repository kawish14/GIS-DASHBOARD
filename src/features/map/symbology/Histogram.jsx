import React, { useMemo } from "react";
import { formatNumber } from "./classify";

/**
 * How the values of the chosen column are actually distributed, with the class
 * breaks drawn on top of it.
 *
 * This is the thing that makes a classification method a decision rather than a
 * guess. Quantile and natural breaks put their boundaries in very different
 * places on a skewed column -- which most of these are, since downtime and
 * fibre loss pile up near zero with a long tail -- and until you can see the
 * shape, the only way to tell which method suits the data is to apply each one
 * and go look at the map.
 *
 * Bars are the column's own shape, fixed at BIN_COUNT bins and independent of
 * the class count. The vertical lines are the current breaks: drag the class
 * count and you watch them move through the distribution.
 */

const BIN_COUNT = 34;

export default function Histogram({ values, breaks = [], height = 62 }) {
  const bins = useMemo(() => {
    const numbers = (values ?? []).filter(Number.isFinite);
    if (numbers.length === 0) return null;

    let min = Infinity;
    let max = -Infinity;
    for (const n of numbers) {
      if (n < min) min = n;
      if (n > max) max = n;
    }
    if (min === max) return null; // a single value has no distribution to draw

    const counts = new Array(BIN_COUNT).fill(0);
    const span = max - min;
    for (const n of numbers) {
      const i = Math.min(BIN_COUNT - 1, Math.floor(((n - min) / span) * BIN_COUNT));
      counts[i] += 1;
    }
    return { counts, min, max, peak: Math.max(...counts) };
  }, [values]);

  if (!bins) return null;

  const { counts, min, max, peak } = bins;
  const span = max - min || 1;
  const barW = 100 / BIN_COUNT;

  // Interior boundaries only -- the outer two are the axis ends, and drawing
  // them would just be two lines down the edges of the chart.
  const boundaries = breaks
    .slice(1)
    .map((b) => b.min)
    .filter((v) => Number.isFinite(v) && v > min && v < max);

  return (
    <div>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Distribution of the selected field"
        style={{ display: "block" }}
      >
        {counts.map((c, i) => {
          const barH = peak > 0 ? (c / peak) * (height - 2) : 0;
          return (
            <rect
              key={i}
              x={i * barW + barW * 0.12}
              y={height - barH}
              width={barW * 0.76}
              height={barH}
              fill="var(--calcite-color-text-3, #8a8a86)"
            />
          );
        })}
        {boundaries.map((v, i) => {
          const x = ((v - min) / span) * 100;
          return (
            <line
              key={i}
              x1={x} y1={0} x2={x} y2={height}
              stroke="var(--calcite-color-brand, #3987e5)"
              strokeWidth={0.6}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "10px",
          color: "var(--calcite-color-text-3, #8a8a86)",
          marginTop: "2px",
        }}
      >
        <span>{formatNumber(min)}</span>
        <span>{formatNumber(max)}</span>
      </div>
    </div>
  );
}
