"use client";

/**
 * Draws a labelled diagram the assistant described (see lib/ai-figure.ts).
 *
 * The drawing sits in the middle; its labels line up in a column on either
 * side, each joined to its part by a thin leader line ending in a dot, the
 * way a textbook labels a cell or a flower. Circuit symbols follow the
 * conventions taught in Cameroonian physics syllabuses.
 */

import { useId, useMemo } from "react";

import { ROW_HEIGHT, colour, layoutLabels, type FigureShape, type FigureSpec, type Point } from "@/lib/ai-figure";

const INK = "#1f2937";
const LEADER = "#64748b";
const STROKE_WIDTH = 0.55;
const COLUMN = 34; // width of a label column, in canvas units
const LABEL_SIZE = 3.3;
const LINE_HEIGHT = 4.2;

function arrowHead(from: Point, to: Point, size = 2.4): string {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const left: Point = [to[0] - size * Math.cos(angle - 0.45), to[1] - size * Math.sin(angle - 0.45)];
  const right: Point = [to[0] - size * Math.cos(angle + 0.45), to[1] - size * Math.sin(angle + 0.45)];
  return `${to[0]},${to[1]} ${left[0]},${left[1]} ${right[0]},${right[1]}`;
}

function shortened(from: Point, to: Point, by: number): Point {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  return [to[0] - ((to[0] - from[0]) / length) * by, to[1] - ((to[1] - from[1]) / length) * by];
}

/** An electrical symbol drawn along the wire from `from` to `to`. */
function CircuitElement({ shape }: { shape: Extract<FigureShape, { from: Point; to: Point }> }) {
  const [x1, y1] = shape.from;
  const [x2, y2] = shape.to;
  const length = Math.hypot(x2 - x1, y2 - y1);
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  const size = Math.min(10, length * 0.6);
  const a = length / 2 - size / 2;
  const b = length / 2 + size / 2;
  const mid = length / 2;
  const wire = { stroke: INK, strokeWidth: STROKE_WIDTH, fill: "none" } as const;
  let body: React.ReactNode = null;

  switch (shape.type) {
    case "resistor":
      body = <rect x={a} y={-1.6} width={size} height={3.2} fill="#ffffff" {...{ stroke: INK, strokeWidth: STROKE_WIDTH }} />;
      break;
    case "cell":
      body = (
        <>
          <line x1={mid - 0.8} y1={-3.4} x2={mid - 0.8} y2={3.4} stroke={INK} strokeWidth={STROKE_WIDTH} />
          <line x1={mid + 0.8} y1={-1.7} x2={mid + 0.8} y2={1.7} stroke={INK} strokeWidth={STROKE_WIDTH * 2.4} />
        </>
      );
      break;
    case "battery":
      body = (
        <>
          {[-2.4, 1.2].map((offset) => (
            <g key={offset}>
              <line x1={mid + offset - 0.6} y1={-3.4} x2={mid + offset - 0.6} y2={3.4} stroke={INK} strokeWidth={STROKE_WIDTH} />
              <line x1={mid + offset + 0.8} y1={-1.7} x2={mid + offset + 0.8} y2={1.7} stroke={INK} strokeWidth={STROKE_WIDTH * 2.4} />
            </g>
          ))}
          <line x1={mid - 1.8} y1={0} x2={mid + 1.4} y2={0} stroke={INK} strokeWidth={STROKE_WIDTH} strokeDasharray="0.6 0.6" />
        </>
      );
      break;
    case "bulb":
      body = (
        <>
          <circle cx={mid} cy={0} r={2.7} fill="#fffbeb" stroke={INK} strokeWidth={STROKE_WIDTH} />
          <line x1={mid - 1.9} y1={-1.9} x2={mid + 1.9} y2={1.9} stroke={INK} strokeWidth={STROKE_WIDTH} />
          <line x1={mid - 1.9} y1={1.9} x2={mid + 1.9} y2={-1.9} stroke={INK} strokeWidth={STROKE_WIDTH} />
        </>
      );
      break;
    case "switch":
      body = (
        <>
          <circle cx={a} cy={0} r={0.7} fill="#ffffff" stroke={INK} strokeWidth={STROKE_WIDTH} />
          <circle cx={b} cy={0} r={0.7} fill="#ffffff" stroke={INK} strokeWidth={STROKE_WIDTH} />
          <line x1={a + 0.5} y1={-0.3} x2={b - 0.6} y2={-3.4} stroke={INK} strokeWidth={STROKE_WIDTH} />
        </>
      );
      break;
    case "ammeter":
    case "voltmeter":
      body = (
        <>
          <circle cx={mid} cy={0} r={2.9} fill="#ffffff" stroke={INK} strokeWidth={STROKE_WIDTH} />
          <text
            x={mid}
            y={0}
            fontSize={3.2}
            fontWeight={700}
            textAnchor="middle"
            dominantBaseline="central"
            fill={INK}
            transform={`rotate(${-angle} ${mid} 0)`}
          >
            {shape.type === "ammeter" ? "A" : "V"}
          </text>
        </>
      );
      break;
    case "diode":
      body = (
        <>
          <polygon points={`${mid - 2},-2.2 ${mid - 2},2.2 ${mid + 1.6},0`} fill="#ffffff" stroke={INK} strokeWidth={STROKE_WIDTH} />
          <line x1={mid + 1.6} y1={-2.2} x2={mid + 1.6} y2={2.2} stroke={INK} strokeWidth={STROKE_WIDTH} />
        </>
      );
      break;
    default:
      break;
  }

  const plain = shape.type === "wire";
  const gapped = shape.type === "cell" || shape.type === "battery";
  const leftEnd = plain ? length : gapped ? mid - (shape.type === "battery" ? 3 : 0.8) : a;
  const rightStart = plain ? length : gapped ? mid + (shape.type === "battery" ? 2 : 0.8) : b;

  // The label sits beside the symbol, on the outside of the circuit.
  const normal = ((angle - 90) * Math.PI) / 180;
  const labelAt: Point = [(x1 + x2) / 2 + Math.cos(normal) * 5.2, (y1 + y2) / 2 + Math.sin(normal) * 5.2];

  return (
    <g>
      <g transform={`translate(${x1} ${y1}) rotate(${angle})`}>
        <line x1={0} y1={0} x2={leftEnd} y2={0} {...wire} />
        {!plain ? <line x1={rightStart} y1={0} x2={length} y2={0} {...wire} /> : null}
        {body}
      </g>
      {shape.label ? (
        <text x={labelAt[0]} y={labelAt[1]} fontSize={3} textAnchor="middle" dominantBaseline="central" fill={INK} fontWeight={600}>
          {shape.label}
        </text>
      ) : null}
    </g>
  );
}

function Shape({ shape }: { shape: FigureShape }) {
  const dash = "dashed" in shape && shape.dashed ? "1.4 1" : undefined;
  switch (shape.type) {
    case "circle":
      return (
        <circle cx={shape.cx} cy={shape.cy} r={shape.r} fill={colour(shape.fill, "fill", "none")}
          stroke={colour(shape.stroke ?? shape.fill, "stroke", INK)} strokeWidth={STROKE_WIDTH} strokeDasharray={dash} />
      );
    case "ellipse":
      return (
        <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} fill={colour(shape.fill, "fill", "none")}
          stroke={colour(shape.stroke ?? shape.fill, "stroke", INK)} strokeWidth={STROKE_WIDTH} strokeDasharray={dash} />
      );
    case "rect":
      return (
        <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.r || 0} fill={colour(shape.fill, "fill", "none")}
          stroke={colour(shape.stroke ?? shape.fill, "stroke", INK)} strokeWidth={STROKE_WIDTH} strokeDasharray={dash} />
      );
    case "polygon":
    case "polyline":
      return (
        <polyline
          points={(shape.type === "polygon" ? [...shape.points, shape.points[0]] : shape.points).map((p) => p.join(",")).join(" ")}
          fill={shape.type === "polygon" ? colour(shape.fill, "fill", "none") : "none"}
          stroke={colour(shape.stroke ?? shape.fill, "stroke", INK)} strokeWidth={STROKE_WIDTH} strokeLinejoin="round" strokeDasharray={dash}
        />
      );
    case "path":
      return (
        <path d={shape.d} fill={colour(shape.fill, "fill", "none")} stroke={colour(shape.stroke ?? shape.fill, "stroke", INK)}
          strokeWidth={STROKE_WIDTH} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={dash} />
      );
    case "line":
    case "arrow":
    case "double-arrow": {
      const strokeColour = colour(shape.stroke, "stroke", INK);
      const end = shape.type === "line" ? shape.to : shortened(shape.from, shape.to, 1.6);
      const start = shape.type === "double-arrow" ? shortened(shape.to, shape.from, 1.6) : shape.from;
      const angle = Math.atan2(shape.to[1] - shape.from[1], shape.to[0] - shape.from[0]);
      // An arrow is named at its tip, beyond the head, where nothing else is
      // drawn (the way forces are labelled); a plain line at its middle.
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const labelAt: Point =
        shape.type === "arrow"
          ? [shape.to[0] + dx * 3.2, shape.to[1] + dy * 3.2]
          : [(shape.from[0] + shape.to[0]) / 2 + dy * 3, (shape.from[1] + shape.to[1]) / 2 - dx * 3];
      const anchor = shape.type === "arrow" && Math.abs(dx) > 0.5 ? (dx > 0 ? "start" : "end") : "middle";
      return (
        <g>
          <line x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]} stroke={strokeColour}
            strokeWidth={shape.type === "line" ? STROKE_WIDTH : STROKE_WIDTH * 1.3} strokeDasharray={dash} strokeLinecap="round" />
          {shape.type !== "line" ? <polygon points={arrowHead(shape.from, shape.to)} fill={strokeColour} /> : null}
          {shape.type === "double-arrow" ? <polygon points={arrowHead(shape.to, shape.from)} fill={strokeColour} /> : null}
          {shape.label ? (
            <text x={labelAt[0]} y={labelAt[1]} fontSize={3} textAnchor={anchor}
              dominantBaseline="central" fill={strokeColour} fontWeight={700} paintOrder="stroke" stroke="#ffffff" strokeWidth={0.8}>
              {shape.label}
            </text>
          ) : null}
        </g>
      );
    }
    case "text":
      return (
        <text x={shape.at[0]} y={shape.at[1]} fontSize={shape.size || 3.6} fontWeight={shape.bold ? 700 : 500} textAnchor="middle"
          dominantBaseline="central" fill={colour(shape.color, "stroke", INK)} paintOrder="stroke" stroke="#ffffff" strokeWidth={0.7}>
          {shape.text}
        </text>
      );
    case "angle": {
      const [cx, cy] = shape.at;
      const r = shape.r || 6;
      if (shape.right) {
        const a1 = (shape.from * Math.PI) / 180;
        const a2 = (shape.to * Math.PI) / 180;
        const s = Math.min(r, 4);
        const p1: Point = [cx + s * Math.cos(a1), cy - s * Math.sin(a1)];
        const p2: Point = [cx + s * Math.cos(a2), cy - s * Math.sin(a2)];
        const corner: Point = [p1[0] + p2[0] - cx, p1[1] + p2[1] - cy];
        return <polyline points={`${p1.join(",")} ${corner.join(",")} ${p2.join(",")}`} fill="none" stroke={INK} strokeWidth={STROKE_WIDTH} />;
      }
      const start = (shape.from * Math.PI) / 180;
      const end = (shape.to * Math.PI) / 180;
      const sweep = ((shape.to - shape.from) % 360 + 360) % 360;
      const p1: Point = [cx + r * Math.cos(start), cy - r * Math.sin(start)];
      const p2: Point = [cx + r * Math.cos(end), cy - r * Math.sin(end)];
      const middle = start + ((sweep / 2) * Math.PI) / 180;
      const labelAt: Point = [cx + (r + 3.2) * Math.cos(middle), cy - (r + 3.2) * Math.sin(middle)];
      return (
        <g>
          <path d={`M ${p1[0]} ${p1[1]} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 0 ${p2[0]} ${p2[1]}`} fill="none" stroke={INK} strokeWidth={STROKE_WIDTH} />
          {shape.label ? (
            <text x={labelAt[0]} y={labelAt[1]} fontSize={3} textAnchor="middle" dominantBaseline="central" fill={INK} fontWeight={600}>
              {shape.label}
            </text>
          ) : null}
        </g>
      );
    }
    default:
      return <CircuitElement shape={shape} />;
  }
}

export function AiFigure({ spec }: { spec: FigureSpec }) {
  const titleId = useId();
  const placed = useMemo(() => layoutLabels(spec.labels, spec.height, LINE_HEIGHT), [spec]);
  const hasLeft = placed.some((label) => label.side === "left");
  const hasRight = placed.some((label) => label.side === "right");
  const hasTop = placed.some((label) => label.side === "top");
  const hasBottom = placed.some((label) => label.side === "bottom");
  const rowXs = placed.filter((label) => label.side === "top" || label.side === "bottom").map((label) => label.x);
  const minX = Math.min(hasLeft ? -COLUMN : -2, ...rowXs.map((x) => x - 18));
  const maxX = Math.max(hasRight ? 100 + COLUMN : 102, ...rowXs.map((x) => x + 18));
  const minY = hasTop ? -ROW_HEIGHT : 0;
  const maxY = spec.height + (hasBottom ? ROW_HEIGHT : 0);

  return (
    <figure className="my-1 rounded-xl border border-primary/10 bg-white p-2 sm:p-3">
      {spec.title ? (
        <figcaption id={titleId} className="mb-1 text-center text-sm font-bold text-primary">
          {spec.title}
        </figcaption>
      ) : null}
      <svg
        viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
        role="img"
        aria-labelledby={spec.title ? titleId : undefined}
        aria-label={spec.title ? undefined : "Labelled diagram"}
        className="mx-auto h-auto w-full max-w-[680px]"
        fontFamily="inherit"
      >
        <g>
          {spec.shapes.map((shape, index) => (
            <Shape key={index} shape={shape} />
          ))}
        </g>
        <g>
          {placed.map((label, index) => {
            if (label.side === "top" || label.side === "bottom") {
              const above = label.side === "top";
              const edge = above ? label.y + 2.4 : label.y - 2.4;
              return (
                <g key={index}>
                  <polyline points={`${label.x},${edge} ${label.point[0]},${label.point[1]}`} fill="none" stroke={LEADER} strokeWidth={0.3} />
                  <circle cx={label.point[0]} cy={label.point[1]} r={0.75} fill={INK} />
                  <text x={label.x} y={label.y} fontSize={LABEL_SIZE} fontWeight={600} textAnchor="middle" dominantBaseline="central" fill={INK}>
                    {label.lines.join(" ")}
                  </text>
                </g>
              );
            }
            const left = label.side === "left";
            const textX = left ? -3 : 103;
            const anchorX = left ? -1.8 : 101.8;
            return (
              <g key={index}>
                <polyline
                  points={`${anchorX},${label.y} ${label.point[0]},${label.point[1]}`}
                  fill="none"
                  stroke={LEADER}
                  strokeWidth={0.3}
                />
                <circle cx={label.point[0]} cy={label.point[1]} r={0.75} fill={INK} />
                <text
                  x={textX}
                  y={label.y - ((label.lines.length - 1) * LINE_HEIGHT) / 2}
                  fontSize={LABEL_SIZE}
                  fontWeight={600}
                  textAnchor={left ? "end" : "start"}
                  dominantBaseline="central"
                  fill={INK}
                >
                  {label.lines.map((line, lineIndex) => (
                    <tspan key={lineIndex} x={textX} dy={lineIndex === 0 ? 0 : LINE_HEIGHT}>
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      {spec.caption ? <p className="mt-1 text-center text-xs text-muted-foreground">{spec.caption}</p> : null}
      {/* A reader using a screen reader hears the parts, not just "image". */}
      {placed.length ? (
        <p className="sr-only">Labelled parts: {placed.map((label) => label.text).join(", ")}.</p>
      ) : null}
    </figure>
  );
}
