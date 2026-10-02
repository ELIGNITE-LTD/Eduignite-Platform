/**
 * Graphs the assistant can draw: a coordinate plane (function curves, points,
 * segments, polygons, vectors) or a number line (points and intervals).
 *
 * The assistant writes a small JSON description in a ```graph block and the app
 * draws it. Nothing in that JSON is ever executed: function formulas go through
 * the small parser below, which understands arithmetic and a fixed list of
 * functions, and every number is checked and capped. A description the parser
 * does not accept is shown as text instead of as a broken picture.
 *
 * This file is identical in the website, mobile and desktop apps.
 */

export type Pair = [number, number];

export type PlaneGraph = {
  kind: 'plane';
  title?: string;
  x: Pair;
  y?: Pair;
  xLabel?: string;
  yLabel?: string;
  functions: { expr: string; label: string; domain?: Pair; fn: (x: number) => number }[];
  points: { x: number; y: number; label?: string }[];
  segments: { from: Pair; to: Pair; label?: string; dashed?: boolean }[];
  polygons: { points: Pair[]; label?: string }[];
  vectors: { from: Pair; to: Pair; label?: string }[];
};

export type NumberLineGraph = {
  kind: 'numberline';
  title?: string;
  range: Pair;
  marks: { value: number; label?: string; open?: boolean }[];
  intervals: { from: number | null; to: number | null; fromOpen: boolean; toOpen: boolean }[];
};

/**
 * A chart of data rather than of mathematics: marks by sequence, fees
 * collected by class, attendance across a term. This is what a school
 * actually asks for, and until it existed the assistant's answer arrived as
 * the raw JSON it had written, because nothing here could read it.
 */
export type DataChart = {
  kind: 'chart';
  chart: 'bar' | 'line' | 'area' | 'pie';
  title?: string;
  xLabel?: string;
  yLabel?: string;
  /** One label per position on the x axis, or one slice of a pie. */
  categories: string[];
  series: { name: string; values: (number | null)[] }[];
  stacked?: boolean;
};

export type GraphSpec = PlaneGraph | NumberLineGraph | DataChart;

/** Every name a model reaches for when it means a chart of data. */
const CHART_TYPES = new Set(['bar', 'column', 'histogram', 'line', 'area', 'pie', 'donut', 'doughnut']);

const LIMIT = 1e6;
const MAX_ITEMS = 40;

// ── A safe formula parser ───────────────────────────────────────────────────

type Node = (x: number) => number;

const FUNCTIONS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  arcsin: Math.asin,
  arccos: Math.acos,
  arctan: Math.atan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

/** Own names only: "constructor" or "__proto__" are not functions of x. */
const known = (table: object, name: string) => Object.prototype.hasOwnProperty.call(table, name);

type Token = { type: 'num'; value: number } | { type: 'id'; value: string } | { type: 'op'; value: string };

function tokenize(source: string): Token[] {
  const text = source
    .replace(/[−–]/g, '-')
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, 'pi')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/\*\*/g, '^')
    .toLowerCase();
  const tokens: Token[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (/\s/.test(char)) {
      index += 1;
    } else if (/[0-9.]/.test(char)) {
      const match = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(text.slice(index));
      if (!match) throw new Error('number');
      tokens.push({ type: 'num', value: Number(match[0]) });
      index += match[0].length;
    } else if (/[a-z]/.test(char)) {
      const match = /^[a-z]+/.exec(text.slice(index))!;
      tokens.push({ type: 'id', value: match[0] });
      index += match[0].length;
    } else if ('+-*/^()'.includes(char)) {
      tokens.push({ type: 'op', value: char });
      index += 1;
    } else {
      throw new Error(`unexpected ${char}`);
    }
  }
  return tokens;
}

/** Compile a formula in x — "x^2 - 3x + 2", "2sin(x)", "sqrt(x+1)" — to a function. */
export function compileFormula(source: string): (x: number) => number {
  // "y = ...", "f(x) = ...", "v(t) = ..." all name the curve; drop the name.
  const cleaned = source.replace(/^\s*[a-z_]\w*\s*(?:\(\s*[a-z]\s*\))?\s*=\s*/i, '');
  if (cleaned.length > 200) throw new Error('too long');
  const tokens = tokenize(cleaned);
  let position = 0;
  const peek = () => tokens[position];
  const isOp = (value: string) => peek()?.type === 'op' && peek()!.value === value;

  const startsFactor = () => {
    const token = peek();
    return !!token && (token.type === 'num' || token.type === 'id' || (token.type === 'op' && token.value === '('));
  };

  function expression(): Node {
    let left = term();
    while (isOp('+') || isOp('-')) {
      const op = tokens[position++].value;
      const right = term();
      const l = left;
      left = op === '+' ? (x) => l(x) + right(x) : (x) => l(x) - right(x);
    }
    return left;
  }

  function term(): Node {
    let left = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = tokens[position++].value;
        const right = unary();
        const l = left;
        left = op === '*' ? (x) => l(x) * right(x) : (x) => l(x) / right(x);
      } else if (startsFactor()) {
        // Implicit multiplication: 2x, 3(x+1), (x+1)(x-1), x sin(x).
        const right = power();
        const l = left;
        left = (x) => l(x) * right(x);
      } else {
        return left;
      }
    }
  }

  function unary(): Node {
    if (isOp('-')) {
      position += 1;
      const inner = unary();
      return (x) => -inner(x);
    }
    if (isOp('+')) {
      position += 1;
      return unary();
    }
    return power();
  }

  function power(): Node {
    const base = primary();
    if (isOp('^')) {
      position += 1;
      const exponent = unary();
      return (x) => Math.pow(base(x), exponent(x));
    }
    return base;
  }

  function primary(): Node {
    const token = tokens[position++];
    if (!token) throw new Error('unexpected end');
    if (token.type === 'num') {
      const value = token.value;
      return () => value;
    }
    if (token.type === 'op' && token.value === '(') {
      const inner = expression();
      if (!isOp(')')) throw new Error('missing )');
      position += 1;
      return inner;
    }
    if (token.type === 'id') {
      // Time graphs are often written in t (v = 6t - 0.25t^2): t is the
      // horizontal axis just as x is.
      if (token.value === 'x' || token.value === 't') return (x) => x;
      if (known(CONSTANTS, token.value)) {
        const value = CONSTANTS[token.value];
        return () => value;
      }
      const fn = known(FUNCTIONS, token.value) ? FUNCTIONS[token.value] : undefined;
      if (fn) {
        if (isOp('(')) {
          position += 1;
          const argument = expression();
          if (!isOp(')')) throw new Error('missing )');
          position += 1;
          return (x) => fn(argument(x));
        }
        // sin x, sqrt x
        const argument = power();
        return (x) => fn(argument(x));
      }
    }
    throw new Error(`unknown ${token.value}`);
  }

  const node = expression();
  if (position !== tokens.length) throw new Error('trailing input');
  node(1); // A formula that throws on evaluation is rejected here, not while drawing.
  return node;
}

// ── Reading the assistant's description ─────────────────────────────────────

function num(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= LIMIT ? n : null;
}

function pair(value: unknown): Pair | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const a = num(value[0]);
  const b = num(value[1]);
  return a === null || b === null ? null : [a, b];
}

function range(value: unknown): Pair | null {
  const p = pair(value);
  return p && p[0] < p[1] ? p : null;
}

function label(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 60) : undefined;
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? (value.filter((item) => item && typeof item === 'object').slice(0, MAX_ITEMS) as Record<string, unknown>[])
    : [];
}

/** Every item of an array, whatever it holds: names, numbers, or objects. */
function plainList(value: unknown): unknown[] {
  return Array.isArray(value) ? value.slice(0, MAX_ITEMS) : [];
}

/** Parse a ```graph block. Returns null when it is not a drawing we can trust. */
export function parseGraphSpec(source: string): GraphSpec | null {
  if (source.length > 8000) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(source);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const type = String(raw.type ?? raw.kind ?? '').toLowerCase().replace(/[\s_-]/g, '');
  const title = label(raw.title);

  // A chart of data. Several shapes are accepted because a model writes
  // whichever one it thinks of first, and all of them mean the same thing:
  //   categories + series[{name, values}]   (several series)
  //   data: [{label, value}]                (one series, the common case)
  //   labels + values
  if (CHART_TYPES.has(type)) {
    const chart = (type === 'column' || type === 'histogram' ? 'bar' : type === 'donut' || type === 'doughnut' ? 'pie' : type) as DataChart['chart'];

    let categories = plainList(raw.categories ?? raw.labels ?? raw.x)
      .map((c: unknown) => String(c ?? '').trim())
      .filter(Boolean)
      .slice(0, MAX_ITEMS);
    let series: DataChart['series'] = [];

    const rows = plainList(raw.data ?? raw.values ?? raw.points);
    const rowsAreObjects = rows.length > 0 && rows.every((r: any) => r && typeof r === 'object' && !Array.isArray(r));

    if (rowsAreObjects) {
      // [{ label, value }] or [{ x, y }]
      const picked = rows.slice(0, MAX_ITEMS).map((r: any) => ({
        label: String(r.label ?? r.name ?? r.category ?? r.x ?? '').trim(),
        value: num(r.value ?? r.y ?? r.count ?? r.total),
      }));
      if (picked.some((r) => r.value === null)) return null;
      categories = picked.map((r, i) => r.label || String(i + 1));
      series = [{ name: label(raw.seriesName ?? raw.yLabel) ?? 'Value', values: picked.map((r) => r.value) }];
    } else if (list(raw.series).length) {
      series = list(raw.series)
        .slice(0, 6)
        .map((entry: any) => ({
          name: label(entry.name ?? entry.label) ?? 'Series',
          values: plainList(entry.values ?? entry.data ?? entry.y).map((v: unknown) => num(v)),
        }))
        .filter((entry) => entry.values.length > 0);
    } else if (rows.length) {
      // A bare array of numbers.
      const values = rows.slice(0, MAX_ITEMS).map((v: unknown) => num(v));
      if (values.some((v) => v === null)) return null;
      series = [{ name: label(raw.seriesName ?? raw.yLabel) ?? 'Value', values }];
    }

    if (!series.length || !series.some((entry) => entry.values.some((v) => v !== null))) return null;

    const longest = Math.max(...series.map((entry) => entry.values.length));
    if (categories.length < longest) {
      categories = Array.from({ length: longest }, (_, i) => categories[i] ?? String(i + 1));
    }
    categories = categories.slice(0, longest);

    return {
      kind: 'chart',
      chart,
      title,
      xLabel: label(raw.xLabel ?? raw.xAxis),
      yLabel: label(raw.yLabel ?? raw.yAxis),
      categories,
      series,
      stacked: Boolean(raw.stacked),
    };
  }

  if (type === 'numberline') {
    const r = range(raw.range) ?? range([raw.min, raw.max]);
    if (!r) return null;
    const marks = list(raw.marks ?? raw.points)
      .map((m) => ({ value: num(m.value ?? m.x), label: label(m.label), open: Boolean(m.open) }))
      .filter((m): m is { value: number; label: string | undefined; open: boolean } => m.value !== null);
    const intervals = list(raw.intervals).map((i) => ({
      from: i.from === null || i.from === undefined ? null : num(i.from),
      to: i.to === null || i.to === undefined ? null : num(i.to),
      fromOpen: Boolean(i.fromOpen ?? i.open),
      toOpen: Boolean(i.toOpen ?? i.open),
    }));
    if (!marks.length && !intervals.length) return null;
    return { kind: 'numberline', title, range: r, marks, intervals };
  }

  const givenX = range(raw.x ?? raw.xRange ?? raw.domain ?? [raw.xMin, raw.xMax]);
  const y = range(raw.y ?? raw.yRange ?? [raw.yMin, raw.yMax]) ?? undefined;

  const functions: PlaneGraph['functions'] = [];
  for (const f of list(raw.functions).slice(0, 6)) {
    const expr = typeof f.expr === 'string' ? f.expr : typeof f.fn === 'string' ? f.fn : '';
    if (!expr) continue;
    try {
      functions.push({ expr, label: label(f.label) ?? `y = ${expr}`, domain: range(f.domain) ?? undefined, fn: compileFormula(expr) });
    } catch {
      return null; // A curve we cannot draw faithfully must not be drawn wrongly.
    }
  }

  const points = list(raw.points)
    .map((p) => ({ x: num(p.x), y: num(p.y), label: label(p.label) }))
    .filter((p): p is { x: number; y: number; label: string | undefined } => p.x !== null && p.y !== null);
  const segments = list(raw.segments)
    .map((s) => ({ from: pair(s.from), to: pair(s.to), label: label(s.label), dashed: Boolean(s.dashed) }))
    .filter((s): s is { from: Pair; to: Pair; label: string | undefined; dashed: boolean } => !!s.from && !!s.to);
  const polygons = list(raw.polygons)
    .map((p) => ({
      points: Array.isArray(p.points) ? (p.points.slice(0, 20).map(pair).filter(Boolean) as Pair[]) : [],
      label: label(p.label),
    }))
    .filter((p) => p.points.length >= 3);
  const vectors = list(raw.vectors)
    .map((v) => ({ from: pair(v.from) ?? ([0, 0] as Pair), to: pair(v.to), label: label(v.label) }))
    .filter((v): v is { from: Pair; to: Pair; label: string | undefined } => !!v.to);

  if (!functions.length && !points.length && !segments.length && !polygons.length && !vectors.length) return null;
  const x = givenX ?? inferXRange(functions, points, segments, polygons, vectors);
  return {
    kind: 'plane',
    title,
    x,
    y,
    xLabel: label(raw.xLabel),
    yLabel: label(raw.yLabel),
    functions,
    points,
    segments,
    polygons,
    vectors,
  };
}

/**
 * The x-range when the spec gives none: wide enough for every curve's own
 * domain and every marked point, so a charging curve drawn for t >= 0 is not
 * stretched over -10..10 (where e^(-t) explodes and flattens everything).
 */
function inferXRange(
  functions: PlaneGraph['functions'],
  points: PlaneGraph['points'],
  segments: PlaneGraph['segments'],
  polygons: PlaneGraph['polygons'],
  vectors: PlaneGraph['vectors'],
): Pair {
  const xs: number[] = [];
  functions.forEach((f) => f.domain && xs.push(f.domain[0], f.domain[1]));
  points.forEach((p) => xs.push(p.x));
  segments.forEach((s) => xs.push(s.from[0], s.to[0]));
  polygons.forEach((p) => p.points.forEach((pt) => xs.push(pt[0])));
  vectors.forEach((v) => xs.push(v.from[0], v.to[0]));
  // Curves with no domain of their own and nothing marked: the usual window.
  if (!xs.length || (functions.some((f) => !f.domain) && xs.length < 2)) return [-10, 10];
  let low = Math.min(...xs);
  let high = Math.max(...xs);
  if (low === high) {
    low -= 5;
    high += 5;
  }
  const pad = (high - low) * 0.08;
  // A range that starts at 0 (time, distance) stays at 0 rather than going negative.
  return [low >= 0 && low - pad < 0 ? 0 : low - pad, high + pad];
}

/** Round, readable tick marks: 1, 2, 5 × 10ⁿ. */
export function niceTicks(min: number, max: number, target = 8): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / target;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => span / s <= target) ?? 10 * magnitude;
  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step * 1e-9; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }
  return ticks;
}

/** A y-range that shows every curve and point without letting an asymptote flatten the picture. */
export function autoYRange(spec: PlaneGraph): Pair {
  const values: number[] = [];
  for (const f of spec.functions) {
    const [a, b] = f.domain ?? spec.x;
    for (let i = 0; i <= 200; i += 1) {
      const y = f.fn(a + ((b - a) * i) / 200);
      if (Number.isFinite(y)) values.push(y);
    }
  }
  spec.points.forEach((p) => values.push(p.y));
  spec.segments.forEach((s) => values.push(s.from[1], s.to[1]));
  spec.polygons.forEach((p) => p.points.forEach((pt) => values.push(pt[1])));
  spec.vectors.forEach((v) => values.push(v.from[1], v.to[1]));
  if (!values.length) return [-10, 10];
  values.sort((a, b) => a - b);
  // Ignore the extreme 2% at each end when curves shoot off to infinity.
  const trim = spec.functions.length ? Math.floor(values.length * 0.02) : 0;
  let low = values[trim];
  let high = values[values.length - 1 - trim];
  if (low === high) {
    low -= 1;
    high += 1;
  }
  const pad = (high - low) * 0.1;
  return [low - pad, high + pad];
}
