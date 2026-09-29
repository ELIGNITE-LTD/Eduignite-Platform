"use client";

/**
 * Draws a graph the assistant described (see lib/ai-graph.ts): a coordinate
 * plane with curves, points, segments, polygons and vectors, or a number line
 * with points and intervals. Plain SVG, so it is crisp at any size, scales to
 * the width of a phone, and needs no charting library.
 *
 * This file is identical in the website, mobile and desktop apps.
 */

import { useId, useMemo } from "react";

import { autoYRange, niceTicks, type NumberLineGraph, type Pair, type PlaneGraph, type GraphSpec } from "@/lib/ai-graph";

const COLORS = ["#1d4ed8", "#dc2626", "#059669", "#d97706", "#7c3aed", "#0891b2"];
const INK = "#12314d";
const GRID = "#e2e8f0";
const AXIS = "#475569";

function formatTick(value: number): string {
  if (Math.abs(value) < 1e-9) return "0";
  const rounded = Math.abs(value) >= 1000 || Math.abs(value) < 0.01 ? value.toExponential(1) : String(Number(value.toFixed(2)));
  return rounded.replace("-", "−");
}

function Plane({ spec }: { spec: PlaneGraph }) {
  const id = useId().replace(/:/g, "");
  const W = 560;
  const H = 380;
  const M = { left: 44, right: 16, top: 16, bottom: 34 };
  const [x0, x1] = spec.x;
  const [y0, y1] = useMemo<Pair>(() => spec.y ?? autoYRange(spec), [spec]);
  const sx = (x: number) => M.left + ((x - x0) / (x1 - x0)) * (W - M.left - M.right);
  const sy = (y: number) => H - M.bottom - ((y - y0) / (y1 - y0)) * (H - M.top - M.bottom);

  const xTicks = niceTicks(x0, x1, 10);
  const yTicks = niceTicks(y0, y1, 8);
  const axisY = y0 <= 0 && y1 >= 0 ? sy(0) : H - M.bottom;
  const axisX = x0 <= 0 && x1 >= 0 ? sx(0) : M.left;

  const curves = useMemo(() => {
    const span = y1 - y0;
    return spec.functions.map((f) => {
      const [a, b] = f.domain ? [Math.max(f.domain[0], x0), Math.min(f.domain[1], x1)] : [x0, x1];
      const parts: string[] = [];
      let path = "";
      let previous: number | null = null;
      const steps = 400;
      for (let i = 0; i <= steps; i += 1) {
        const x = a + ((b - a) * i) / steps;
        const y = f.fn(x);
        const visible = Number.isFinite(y) && y > y0 - span * 2 && y < y1 + span * 2;
        // Break the line at gaps and at asymptotes rather than joining across them.
        if (!visible || (previous !== null && Math.abs(y - previous) > span * 3)) {
          if (path) parts.push(path);
          path = "";
          previous = visible ? y : null;
          if (!visible) continue;
        }
        path += `${path ? "L" : "M"}${sx(x).toFixed(2)},${sy(y).toFixed(2)}`;
        previous = y;
      }
      if (path) parts.push(path);
      return parts;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, x0, x1, y0, y1]);

  const title = spec.title || spec.functions.map((f) => f.label).join(", ") || "Graph";

  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="h-auto w-full max-w-[560px] rounded-lg bg-white">
        <defs>
          <clipPath id={`clip-${id}`}>
            <rect x={M.left} y={M.top} width={W - M.left - M.right} height={H - M.top - M.bottom} />
          </clipPath>
          {COLORS.map((color, index) => (
            <marker key={color} id={`arrow-${id}-${index}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={color} />
            </marker>
          ))}
        </defs>

        {xTicks.map((t) => (
          <line key={`gx${t}`} x1={sx(t)} x2={sx(t)} y1={M.top} y2={H - M.bottom} stroke={GRID} strokeWidth={1} />
        ))}
        {yTicks.map((t) => (
          <line key={`gy${t}`} x1={M.left} x2={W - M.right} y1={sy(t)} y2={sy(t)} stroke={GRID} strokeWidth={1} />
        ))}

        <line x1={M.left} x2={W - M.right} y1={axisY} y2={axisY} stroke={AXIS} strokeWidth={1.4} />
        <line x1={axisX} x2={axisX} y1={M.top} y2={H - M.bottom} stroke={AXIS} strokeWidth={1.4} />

        {xTicks.map((t) => (
          <text key={`tx${t}`} x={sx(t)} y={H - M.bottom + 16} fontSize={11} textAnchor="middle" fill={AXIS}>
            {formatTick(t)}
          </text>
        ))}
        {yTicks.map((t) => (
          <text key={`ty${t}`} x={M.left - 6} y={sy(t) + 4} fontSize={11} textAnchor="end" fill={AXIS}>
            {formatTick(t)}
          </text>
        ))}
        <text x={W - M.right} y={axisY - 6} fontSize={12} fontStyle="italic" textAnchor="end" fill={INK}>
          {spec.xLabel || "x"}
        </text>
        <text x={axisX + 6} y={M.top + 12} fontSize={12} fontStyle="italic" fill={INK}>
          {spec.yLabel || "y"}
        </text>

        <g clipPath={`url(#clip-${id})`}>
          {spec.polygons.map((polygon, index) => (
            <polygon
              key={`pg${index}`}
              points={polygon.points.map(([px, py]) => `${sx(px)},${sy(py)}`).join(" ")}
              fill={COLORS[index % COLORS.length]}
              fillOpacity={0.12}
              stroke={COLORS[index % COLORS.length]}
              strokeWidth={2}
            />
          ))}
          {curves.map((parts, index) =>
            parts.map((d, part) => (
              <path key={`c${index}-${part}`} d={d} fill="none" stroke={COLORS[index % COLORS.length]} strokeWidth={2.4} strokeLinejoin="round" />
            )),
          )}
          {spec.segments.map((segment, index) => (
            <line
              key={`s${index}`}
              x1={sx(segment.from[0])}
              y1={sy(segment.from[1])}
              x2={sx(segment.to[0])}
              y2={sy(segment.to[1])}
              stroke={INK}
              strokeWidth={2}
              strokeDasharray={segment.dashed ? "6 4" : undefined}
            />
          ))}
          {spec.vectors.map((vector, index) => (
            <line
              key={`v${index}`}
              x1={sx(vector.from[0])}
              y1={sy(vector.from[1])}
              x2={sx(vector.to[0])}
              y2={sy(vector.to[1])}
              stroke={COLORS[(index + 1) % COLORS.length]}
              strokeWidth={2.4}
              markerEnd={`url(#arrow-${id}-${(index + 1) % COLORS.length})`}
            />
          ))}
          {spec.points.map((point, index) => (
            <circle key={`p${index}`} cx={sx(point.x)} cy={sy(point.y)} r={4.5} fill={INK} stroke="white" strokeWidth={1.5} />
          ))}
        </g>

        {/* Labels sit outside the clip so a label near the edge is not cut in half. */}
        {spec.points.map((point, index) =>
          point.label ? (
            <text key={`pl${index}`} x={sx(point.x) + 7} y={sy(point.y) - 7} fontSize={12} fontWeight={600} fill={INK} paintOrder="stroke" stroke="white" strokeWidth={3}>
              {point.label}
            </text>
          ) : null,
        )}
        {spec.segments.map((segment, index) =>
          segment.label ? (
            <text
              key={`sl${index}`}
              x={(sx(segment.from[0]) + sx(segment.to[0])) / 2 + 6}
              y={(sy(segment.from[1]) + sy(segment.to[1])) / 2 - 6}
              fontSize={12}
              fill={INK}
              paintOrder="stroke"
              stroke="white"
              strokeWidth={3}
            >
              {segment.label}
            </text>
          ) : null,
        )}
        {spec.vectors.map((vector, index) =>
          vector.label ? (
            <text key={`vl${index}`} x={sx(vector.to[0]) + 6} y={sy(vector.to[1]) - 6} fontSize={12} fontWeight={600} fill={COLORS[(index + 1) % COLORS.length]} paintOrder="stroke" stroke="white" strokeWidth={3}>
              {vector.label}
            </text>
          ) : null,
        )}
        {spec.polygons.map((polygon, index) => {
          if (!polygon.label) return null;
          const cx = polygon.points.reduce((sum, p) => sum + p[0], 0) / polygon.points.length;
          const cy = polygon.points.reduce((sum, p) => sum + p[1], 0) / polygon.points.length;
          return (
            <text key={`pgl${index}`} x={sx(cx)} y={sy(cy)} fontSize={12} fontWeight={600} textAnchor="middle" fill={COLORS[index % COLORS.length]}>
              {polygon.label}
            </text>
          );
        })}
      </svg>
      {spec.functions.length > 0 ? (
        <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {spec.functions.map((f, index) => (
            <span key={f.label + index} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-5 rounded" style={{ background: COLORS[index % COLORS.length] }} />
              {f.label}
            </span>
          ))}
        </figcaption>
      ) : null}
    </figure>
  );
}

function NumberLine({ spec }: { spec: NumberLineGraph }) {
  const id = useId().replace(/:/g, "");
  const W = 560;
  const H = 96;
  const left = 28;
  const right = W - 28;
  const lineY = 56;
  const [a, b] = spec.range;
  const sx = (v: number) => left + ((v - a) / (b - a)) * (right - left);
  const ticks = niceTicks(a, b, 12);
  const color = COLORS[0];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={spec.title || "Number line"} className="h-auto w-full max-w-[560px] rounded-lg bg-white">
      <defs>
        <marker id={`nl-${id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={AXIS} />
        </marker>
        <marker id={`nli-${id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={color} />
        </marker>
      </defs>
      <line x1={left - 18} x2={right + 18} y1={lineY} y2={lineY} stroke={AXIS} strokeWidth={1.6} markerStart={`url(#nl-${id})`} markerEnd={`url(#nl-${id})`} />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={sx(t)} x2={sx(t)} y1={lineY - 5} y2={lineY + 5} stroke={AXIS} strokeWidth={1.2} />
          <text x={sx(t)} y={lineY + 22} fontSize={12} textAnchor="middle" fill={AXIS}>
            {formatTick(t)}
          </text>
        </g>
      ))}
      {spec.intervals.map((interval, index) => {
        const from = interval.from ?? a;
        const to = interval.to ?? b;
        return (
          <g key={`i${index}`}>
            <line
              x1={interval.from === null ? left - 14 : sx(from)}
              x2={interval.to === null ? right + 14 : sx(to)}
              y1={lineY}
              y2={lineY}
              stroke={color}
              strokeWidth={5}
              strokeLinecap="round"
              markerStart={interval.from === null ? `url(#nli-${id})` : undefined}
              markerEnd={interval.to === null ? `url(#nli-${id})` : undefined}
            />
            {interval.from !== null ? <circle cx={sx(from)} cy={lineY} r={6} fill={interval.fromOpen ? "white" : color} stroke={color} strokeWidth={2.5} /> : null}
            {interval.to !== null ? <circle cx={sx(to)} cy={lineY} r={6} fill={interval.toOpen ? "white" : color} stroke={color} strokeWidth={2.5} /> : null}
          </g>
        );
      })}
      {spec.marks.map((mark, index) => (
        <g key={`m${index}`}>
          <circle cx={sx(mark.value)} cy={lineY} r={6} fill={mark.open ? "white" : INK} stroke={INK} strokeWidth={2.5} />
          {mark.label ? (
            <text x={sx(mark.value)} y={lineY - 14} fontSize={12} fontWeight={600} textAnchor="middle" fill={INK}>
              {mark.label}
            </text>
          ) : null}
        </g>
      ))}
      {spec.title ? (
        <text x={W / 2} y={16} fontSize={13} fontWeight={700} textAnchor="middle" fill={INK}>
          {spec.title}
        </text>
      ) : null}
    </svg>
  );
}

export function AiGraph({ spec }: { spec: GraphSpec }) {
  return (
    <div className="rounded-xl border border-primary/10 bg-white p-2 sm:p-3">
      {spec.kind === "plane" && spec.title ? <p className="mb-1 text-center text-sm font-bold text-primary">{spec.title}</p> : null}
      {spec.kind === "plane" ? <Plane spec={spec} /> : <NumberLine spec={spec} />}
    </div>
  );
}
