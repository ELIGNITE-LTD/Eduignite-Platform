/**
 * Labelled diagrams the assistant describes and the app draws.
 *
 * A student asks for "a labelled diagram of a plant cell", "the forces on a
 * block on a slope" or "a circuit with two bulbs in series". The assistant
 * answers with a fenced `figure` block: a few simple shapes on a canvas, and
 * the names of the parts. This file reads that description, checks it and
 * keeps it within sensible bounds; `components/ai/ai-figure.tsx` draws it.
 *
 * The model never writes SVG itself. It only chooses from shapes this file
 * knows, so nothing it writes can run in the page, and every figure has the
 * same clean look. Labels are laid out by the renderer, not by the model, so
 * they line up in columns beside the drawing and never cover it or each other.
 *
 * Canvas: x runs 0-100 from left to right; y runs 0-height from top to bottom
 * (height 20-160, 75 by default).
 */

import { findPart, findTemplate, type FigureTemplate } from "./ai-figure-templates";

export type Point = [number, number];

export type FigureShape =
  | { type: "circle"; cx: number; cy: number; r: number; fill?: string; stroke?: string; dashed?: boolean }
  | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number; fill?: string; stroke?: string; dashed?: boolean }
  | { type: "rect"; x: number; y: number; w: number; h: number; r?: number; fill?: string; stroke?: string; dashed?: boolean }
  | { type: "polygon" | "polyline"; points: Point[]; fill?: string; stroke?: string; dashed?: boolean }
  | { type: "line" | "arrow" | "double-arrow"; from: Point; to: Point; stroke?: string; dashed?: boolean; label?: string }
  | { type: "path"; d: string; fill?: string; stroke?: string; dashed?: boolean }
  | { type: "text"; at: Point; text: string; size?: number; bold?: boolean; color?: string }
  | { type: "angle"; at: Point; from: number; to: number; r?: number; label?: string; right?: boolean }
  | { type: CircuitSymbol; from: Point; to: Point; label?: string };

export type CircuitSymbol = "wire" | "resistor" | "cell" | "battery" | "bulb" | "switch" | "ammeter" | "voltmeter" | "diode";

export type LabelSide = "left" | "right" | "top" | "bottom";

export type FigureLabel = { text: string; point: Point; side?: LabelSide };

export type FigureSpec = {
  title?: string;
  caption?: string;
  height: number;
  shapes: FigureShape[];
  labels: FigureLabel[];
};

const CIRCUIT: CircuitSymbol[] = ["wire", "resistor", "cell", "battery", "bulb", "switch", "ammeter", "voltmeter", "diode"];
const MAX_SHAPES = 120;
const SIDES = new Set(["left", "right", "top", "bottom"]);
const MAX_LABELS = 24;

/** Colour names the assistant may use, drawn as a soft fill with a firmer edge. */
export const PALETTE: Record<string, { fill: string; stroke: string }> = {
  green: { fill: "#dcfce7", stroke: "#15803d" },
  lightgreen: { fill: "#ecfccb", stroke: "#4d7c0f" },
  darkgreen: { fill: "#86efac", stroke: "#166534" },
  blue: { fill: "#dbeafe", stroke: "#1d4ed8" },
  lightblue: { fill: "#e0f2fe", stroke: "#0369a1" },
  red: { fill: "#fee2e2", stroke: "#b91c1c" },
  pink: { fill: "#fce7f3", stroke: "#be185d" },
  orange: { fill: "#ffedd5", stroke: "#c2410c" },
  yellow: { fill: "#fef9c3", stroke: "#a16207" },
  purple: { fill: "#ede9fe", stroke: "#6d28d9" },
  brown: { fill: "#efe3d3", stroke: "#78350f" },
  grey: { fill: "#f1f5f9", stroke: "#475569" },
  gray: { fill: "#f1f5f9", stroke: "#475569" },
  teal: { fill: "#ccfbf1", stroke: "#0f766e" },
  black: { fill: "#e5e7eb", stroke: "#111827" },
  white: { fill: "#ffffff", stroke: "#475569" },
  none: { fill: "none", stroke: "#334155" },
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A colour the renderer can use: a palette name or a plain hex colour. */
export function colour(value: unknown, part: "fill" | "stroke", fallback: string): string {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return fallback;
  if (HEX.test(text)) return text;
  const entry = PALETTE[text];
  return entry ? entry[part] : fallback;
}

function num(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function point(value: unknown, height: number): Point | null {
  if (Array.isArray(value) && value.length >= 2) {
    const x = num(value[0], -10, 110);
    const y = num(value[1], -10, height + 10);
    return x === null || y === null ? null : [x, y];
  }
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    return point([v.x, v.y], height);
  }
  return null;
}

function points(value: unknown, height: number): Point[] | null {
  if (!Array.isArray(value)) return null;
  const list = value.map((p) => point(p, height)).filter((p): p is Point => p !== null);
  return list.length >= 2 ? list.slice(0, 200) : null;
}

function text(value: unknown, max = 60): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

// Only drawing commands and numbers: a path can describe any curve, and
// nothing else.
const SAFE_PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]+$/;

function shape(raw: any, height: number): FigureShape | null {
  if (!raw || typeof raw !== "object") return null;
  const type = String(raw.type || raw.kind || raw.shape || "").toLowerCase().replace(/_/g, "-");
  const fill = raw.fill ?? raw.color ?? raw.colour;
  const stroke = raw.stroke ?? raw.outline;
  const dashed = Boolean(raw.dashed || raw.style === "dashed" || raw.dash);
  switch (type) {
    case "circle": {
      const at = point(raw.center ?? raw.centre ?? [raw.cx ?? raw.x, raw.cy ?? raw.y], height);
      const r = num(raw.r ?? raw.radius, 0.3, 80);
      return at && r !== null ? { type, cx: at[0], cy: at[1], r, fill, stroke, dashed } : null;
    }
    case "ellipse":
    case "oval": {
      const at = point(raw.center ?? raw.centre ?? [raw.cx ?? raw.x, raw.cy ?? raw.y], height);
      const rx = num(raw.rx ?? raw.width / 2, 0.3, 80);
      const ry = num(raw.ry ?? raw.height / 2, 0.3, 80);
      return at && rx !== null && ry !== null ? { type: "ellipse", cx: at[0], cy: at[1], rx, ry, fill, stroke, dashed } : null;
    }
    case "rect":
    case "rectangle":
    case "box": {
      const x = num(raw.x, -10, 110);
      const y = num(raw.y, -10, height + 10);
      const w = num(raw.w ?? raw.width, 0.3, 120);
      const h = num(raw.h ?? raw.height, 0.3, 170);
      if (x === null || y === null || w === null || h === null) return null;
      return { type: "rect", x, y, w, h, r: num(raw.r ?? raw.radius ?? raw.rounded, 0, 40) ?? 0, fill, stroke, dashed };
    }
    case "polygon":
    case "triangle":
    case "polyline": {
      const list = points(raw.points ?? raw.vertices, height);
      if (!list) return null;
      return { type: type === "polyline" ? "polyline" : "polygon", points: list, fill, stroke, dashed };
    }
    case "line":
    case "arrow":
    case "double-arrow":
    case "vector": {
      const from = point(raw.from ?? raw.start, height);
      const to = point(raw.to ?? raw.end, height);
      if (!from || !to) return null;
      return { type: type === "vector" ? "arrow" : type, from, to, stroke: stroke ?? raw.color, dashed, label: text(raw.label, 30) || undefined } as FigureShape;
    }
    case "path":
    case "curve": {
      const d = String(raw.d ?? raw.path ?? "").trim();
      if (!d || d.length > 4000 || !SAFE_PATH.test(d)) return null;
      return { type: "path", d, fill, stroke, dashed };
    }
    case "text":
    case "label": {
      const at = point(raw.at ?? raw.position ?? [raw.x, raw.y], height);
      const value = text(raw.text ?? raw.label, 40);
      if (!at || !value) return null;
      return { type: "text", at, text: value, size: num(raw.size, 2, 8) ?? 3.6, bold: Boolean(raw.bold), color: raw.color };
    }
    case "angle":
    case "arc": {
      const at = point(raw.at ?? raw.vertex ?? raw.center, height);
      const from = num(raw.from ?? raw.start, -720, 720);
      const to = num(raw.to ?? raw.end, -720, 720);
      if (!at || from === null || to === null) return null;
      return { type: "angle", at, from, to, r: num(raw.r ?? raw.radius, 1, 30) ?? 6, label: text(raw.label, 20) || undefined, right: Boolean(raw.right) };
    }
    default: {
      if ((CIRCUIT as string[]).includes(type)) {
        const from = point(raw.from ?? raw.start, height);
        const to = point(raw.to ?? raw.end, height);
        if (!from || !to) return null;
        return { type: type as CircuitSymbol, from, to, label: text(raw.label, 20) || undefined };
      }
      return null;
    }
  }
}

function strip(source: string): string {
  return source.trim().replace(/^```[a-z-]*\s*/i, "").replace(/```$/, "").trim();
}

/**
 * A biology diagram from the template library, labelled as asked.
 *
 * Labels name parts by key or by name ({"part": "left_ventricle"}), and may
 * give their own text, for instance to word it for the question. With no
 * labels at all, every part is labelled.
 */
function fromTemplate(raw: any, template: FigureTemplate): FigureSpec {
  const french = String(raw.language ?? raw.lang ?? "").toLowerCase().startsWith("fr");
  const name = (part: { en: string; fr: string }) => (french ? part.fr : part.en);
  const requested: any[] = Array.isArray(raw.labels)
    ? raw.labels
    : Array.isArray(raw.parts)
      ? raw.parts.map((part: unknown) => ({ part }))
      : Object.keys(template.parts).map((part) => ({ part }));
  const labels: FigureLabel[] = [];
  for (const item of requested.slice(0, MAX_LABELS)) {
    const label = typeof item === "string" ? { part: item } : item ?? {};
    const part = findPart(template, label.part ?? label.name ?? label.text);
    if (part) {
      labels.push({
        text: text(label.text, 48) || name(part),
        point: part.point,
        side: SIDES.has(label.side) ? label.side : part.side,
      });
      continue;
    }
    // A label for something the template does not name, placed by the model.
    const at = point(label.point ?? label.at, template.height);
    const value = text(label.text, 48);
    if (at && value) labels.push({ text: value, point: at });
  }
  const extra = (Array.isArray(raw.shapes) ? raw.shapes : [])
    .slice(0, 40)
    .map((item: unknown) => shape(item, template.height))
    .filter((item: FigureShape | null): item is FigureShape => item !== null);
  return {
    title: text(raw.title, 80) || name(template.title),
    caption: text(raw.caption, 160) || undefined,
    height: template.height,
    shapes: [...template.shapes, ...extra],
    labels,
  };
}

export function parseFigureSpec(source: string): FigureSpec | null {
  let raw: any;
  try {
    raw = JSON.parse(strip(source));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const template = findTemplate(raw.template ?? raw.diagram ?? raw.name);
  if (template) return fromTemplate(raw, template);
  const height = num(raw.height ?? raw.h, 20, 160) ?? 75;
  const shapes = (Array.isArray(raw.shapes) ? raw.shapes : Array.isArray(raw.elements) ? raw.elements : [])
    .slice(0, MAX_SHAPES)
    .map((item: unknown) => shape(item, height))
    .filter((item: FigureShape | null): item is FigureShape => item !== null);
  const labels = (Array.isArray(raw.labels) ? raw.labels : [])
    .slice(0, MAX_LABELS)
    .map((item: any): FigureLabel | null => {
      const at = point(item?.point ?? item?.at ?? item?.to ?? [item?.x, item?.y], height);
      const value = text(item?.text ?? item?.label ?? item?.name, 48);
      if (!at || !value) return null;
      const side = SIDES.has(item?.side) ? item.side : undefined;
      return { text: value, point: at, side };
    })
    .filter((item: FigureLabel | null): item is FigureLabel => item !== null);
  if (shapes.length === 0) return null;
  return {
    title: text(raw.title, 80) || undefined,
    caption: text(raw.caption, 160) || undefined,
    height,
    shapes,
    labels,
  };
}

// ---------------------------------------------------------------------------
// Label layout: two tidy columns beside the drawing
// ---------------------------------------------------------------------------

export type PlacedLabel = FigureLabel & { side: LabelSide; x: number; y: number; lines: string[] };

/** Rows of labels above and below the drawing take this much height. */
export const ROW_HEIGHT = 9;

/** Split a label into at most two short lines. */
export function wrapLabel(value: string, width = 18): string[] {
  const words = value.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current);
  if (lines.length > 2) return [lines[0], lines.slice(1).join(" ").slice(0, width + 2) + "…"];
  return lines;
}

/**
 * Lay the labels out around the drawing.
 *
 * Left and right labels stand in columns, in the order of the parts they
 * point to, pushed apart just enough not to touch. Top and bottom labels -
 * for long things like a neurone or a leaf - stand in a row, spread along it
 * the same way. Leader lines then run from each label to its part without
 * crossing the others.
 */
export function layoutLabels(labels: FigureLabel[], height: number, lineHeight = 4.2): PlacedLabel[] {
  const placed: PlacedLabel[] = labels.map((label) => ({
    ...label,
    side: label.side ?? (label.point[0] < 50 ? "left" : "right"),
    x: label.point[0],
    y: label.point[1],
    lines: wrapLabel(label.text),
  }));
  for (const side of ["left", "right"] as const) {
    const column = placed.filter((label) => label.side === side).sort((a, b) => a.point[1] - b.point[1]);
    if (!column.length) continue;
    const gap = (label: PlacedLabel) => Math.max(1, label.lines.length) * lineHeight + 1.5;
    // Downward pass: no label above its neighbour's bottom edge.
    let cursor = 2;
    for (const label of column) {
      label.y = Math.max(label.y, cursor + (gap(label) - 1.5) / 2);
      cursor = label.y + gap(label) / 2 + 0.75;
    }
    // Upward pass: pull the column back inside the canvas if it ran over.
    let floor = height - 2;
    for (let i = column.length - 1; i >= 0; i -= 1) {
      const label = column[i];
      label.y = Math.min(label.y, floor - (gap(label) - 1.5) / 2);
      floor = label.y - gap(label) / 2 - 0.75;
    }
  }
  for (const side of ["top", "bottom"] as const) {
    const row = placed.filter((label) => label.side === side).sort((a, b) => a.point[0] - b.point[0]);
    if (!row.length) continue;
    // Roughly how wide each label is, in canvas units, at the label size.
    const width = (label: PlacedLabel) => label.lines.join(" ").length * 2.05 + 4;
    let cursor = -30;
    for (const label of row) {
      label.x = Math.max(label.x, cursor + width(label) / 2);
      cursor = label.x + width(label) / 2;
    }
    let ceiling = 130;
    for (let i = row.length - 1; i >= 0; i -= 1) {
      const label = row[i];
      label.x = Math.min(label.x, ceiling - width(label) / 2);
      ceiling = label.x - width(label) / 2;
    }
    for (const label of row) label.y = side === "top" ? -ROW_HEIGHT / 2 : height + ROW_HEIGHT / 2;
  }
  return placed;
}
