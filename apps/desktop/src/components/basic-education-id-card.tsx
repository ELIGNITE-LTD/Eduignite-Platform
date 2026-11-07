"use client";

/**
 * Basic Education (nursery and primary) ID card.
 *
 * A faithful HTML/CSS re-draw of the JuniorIgnite card: portrait CR80
 * (54 x 85.6 mm), a rounded header with the school emblem and name, an arched
 * accent ring, a round photo, the pupil's name, class and date of birth, an ID
 * pill and a small QR on the front; contact details, return note, a larger QR
 * and the academic year on the back. Staff use the same card with a position
 * line and no birth date.
 *
 * Every measurement below is the original design size (the same numbers the
 * JuniorIgnite renderer uses, in points) multiplied by SCALE, so the card is
 * crisp on screen, and html2canvas / the browser print engine can scale the
 * whole box down to exactly 54 x 85.6 mm.
 */

import { useMemo } from "react";

/** Design size of the card in points (54 x 85.6 mm). */
export const BASIC_CARD_W = 153.07;
export const BASIC_CARD_H = 242.65;
/** On-screen magnification of the design. */
export const BASIC_CARD_SCALE = 2;
export const BASIC_CARD_PX_W = Math.round(BASIC_CARD_W * BASIC_CARD_SCALE);
export const BASIC_CARD_PX_H = Math.round(BASIC_CARD_H * BASIC_CARD_SCALE);

const S = BASIC_CARD_SCALE;
const R = 8;
const NAVY = "#0B1F44";
const RING_BLUE = "#2540FF";
const RING_GREY = "#E6E8EC";
const INK = "#0F172A";
const BORDER = "#CBD5E1";

export const BASIC_CARD_DEFAULT_SCHOOL_COLOR = "#0F766E";

export type BasicCardAccent = "default" | "school";

export interface BasicIdCardSchool {
  name: string;
  logo?: string;
  address?: string;
}

export interface BasicIdCardData {
  kind: "student" | "staff";
  name: string;
  /** Matricule (pupils) or staff matricule. */
  idNo: string;
  /** Position, for staff. */
  role?: string;
  /** Class level label ("Class 5") and stream ("A"); empty for staff. */
  level?: string;
  stream?: string;
  dob?: string;
  /** Photo URL; pupils may have none, a neutral placeholder is drawn. */
  photo?: string;
  /** The QR image the platform already provides for the pupil. */
  qr?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  academicYear: string;
  school: BasicIdCardSchool;
}

export interface BasicIdCardOptions {
  accent: BasicCardAccent;
  schoolColor: string;
  showQr: boolean;
  /** Empty = standard wording. */
  returnNote: string;
  flag: boolean;
  lang: "en" | "fr";
}

export const DEFAULT_BASIC_CARD_OPTIONS: BasicIdCardOptions = {
  accent: "default",
  schoolColor: BASIC_CARD_DEFAULT_SCHOOL_COLOR,
  showQr: true,
  returnNote: "",
  flag: false,
  lang: "en",
};

interface Labels {
  className: string;
  dob: string;
  idNo: string;
  position: string;
  scan: string;
  infoStudent: string;
  infoStaff: string;
  parent: string;
  emergency: string;
  phone: string;
  school: string;
  ifFound: string;
  valid: string;
  front: string;
  back: string;
}

const EN: Labels = {
  className: "Class:",
  dob: "Birthdate:",
  idNo: "ID No.:",
  position: "Position:",
  scan: "SCAN TO VERIFY",
  infoStudent: "STUDENT INFORMATION",
  infoStaff: "STAFF INFORMATION",
  parent: "Parent/Guardian",
  emergency: "Emergency Contact",
  phone: "Phone",
  school: "School",
  ifFound: "IF FOUND, PLEASE RETURN TO THE SCHOOL.",
  valid: "VALID FOR ACADEMIC YEAR",
  front: "Front / Recto",
  back: "Back / Verso",
};

const FR: Labels = {
  className: "Classe :",
  dob: "Né(e) le :",
  idNo: "N° :",
  position: "Fonction :",
  scan: "SCANNER POUR VÉRIFIER",
  infoStudent: "INFORMATIONS DE L'ÉLÈVE",
  infoStaff: "INFORMATIONS DU PERSONNEL",
  parent: "Parent/Tuteur",
  emergency: "Contact d'urgence",
  phone: "Téléphone",
  school: "École",
  ifFound: "EN CAS DE PERTE, PRIÈRE DE RAMENER LA CARTE À L'ÉCOLE.",
  valid: "VALABLE POUR L'ANNÉE SCOLAIRE",
  front: "Front / Recto",
  back: "Back / Verso",
};

/** Class label and stream from the pupil's level and class name. */
export function splitClassLabel(levelLabel: string, studentClass: string): { level: string; stream: string } {
  const level = (levelLabel || "").trim();
  const cls = (studentClass || "").trim();
  if (!level) return { level: cls, stream: "" };
  if (!cls || cls.toLowerCase() === level.toLowerCase()) return { level, stream: "" };
  if (cls.toLowerCase().startsWith(level.toLowerCase())) {
    return { level, stream: cls.slice(level.length).replace(/^[\s\-–:]+/, "").trim() };
  }
  // The class name does not extend the level ("Blue"): show it as the stream.
  return { level, stream: cls };
}

export function cardInitials(name: string): string {
  const words = (name || "")
    .trim()
    .split(/\s+/)
    .filter((w) => /[A-Za-z]/.test(w) && w.length > 2);
  return (words.slice(0, 2).map((w) => w[0]).join("") || (name || "").trim().slice(0, 2)).toUpperCase();
}

function formatDob(iso: string | undefined, lang: "en" | "fr"): string {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ---------------------------------------------------------------- colour

function parseHex(hex: string): [number, number, number] {
  const h = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : "0F766E";
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function mixWhite(hex: string, t: number): string {
  const [r, g, b] = parseHex(hex);
  const m = (c: number) => Math.round(c + (255 - c) * t);
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
}

// ---------------------------------------------------------------- text fitting

let measureCtx: CanvasRenderingContext2D | null | undefined;

function textWidth(text: string, size: number, bold: boolean): number {
  if (typeof document !== "undefined") {
    if (measureCtx === undefined) {
      try {
        measureCtx = document.createElement("canvas").getContext("2d");
      } catch {
        measureCtx = null;
      }
    }
    if (measureCtx) {
      measureCtx.font = `${bold ? 700 : 400} ${size}px Inter, Helvetica, Arial, sans-serif`;
      return measureCtx.measureText(text).width;
    }
  }
  return text.length * size * (bold ? 0.58 : 0.53);
}

/** Largest size from `start` down to `min` at which the text fits `maxW`. */
function fitSize(text: string, maxW: number, start: number, min: number, bold: boolean): number {
  let size = start;
  while (size > min && textWidth(text, size, bold) > maxW) size -= 0.2;
  return Math.max(size, min);
}

const px = (n: number) => `${+(n * S).toFixed(2)}px`;

// ---------------------------------------------------------------- primitives

/**
 * A line of text whose baseline sits `baseline` points below the card top.
 * With a 1.2 line height the baseline is about 0.96 em under the box top.
 */
function Line({
  text,
  baseline,
  size,
  bold,
  color,
  italic,
  left = 0,
  width = BASIC_CARD_W,
  align = "center",
}: {
  text: string;
  baseline: number;
  size: number;
  bold?: boolean;
  color: string;
  italic?: boolean;
  left?: number;
  width?: number;
  align?: "left" | "center";
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: px(left),
        width: px(width),
        top: px(baseline - size * 0.96),
        fontSize: px(size),
        lineHeight: 1.2,
        fontWeight: bold ? 700 : 400,
        fontStyle: italic ? "italic" : "normal",
        color,
        textAlign: align,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {text}
    </div>
  );
}

/** Wrapped text, at most `lines` lines, first baseline at `baseline`. */
function Block({
  text,
  baseline,
  size,
  step,
  lines,
  bold,
  italic,
  color,
  left,
  width,
  align = "left",
}: {
  text: string;
  baseline: number;
  size: number;
  step: number;
  lines: number;
  bold?: boolean;
  italic?: boolean;
  color: string;
  left: number;
  width: number;
  align?: "left" | "center";
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: px(left),
        width: px(width),
        top: px(baseline - (step - size * 1.2) / 2 - size * 0.96),
        height: px(step * lines),
        overflow: "hidden",
        fontSize: px(size),
        lineHeight: px(step),
        fontWeight: bold ? 700 : 400,
        fontStyle: italic ? "italic" : "normal",
        color,
        textAlign: align,
        wordBreak: "break-word",
        whiteSpace: "pre-line",
      }}
    >
      {text}
    </div>
  );
}

function Flag({ left, top, w, h }: { left: number; top: number; w: number; h: number }) {
  const t = w / 3;
  const r = Math.min(h * 0.3, t * 0.42);
  const pts = [0, 144, 288, 72, 216]
    .map((a) => {
      const rad = (a * Math.PI) / 180;
      return `${(w / 2 + r * Math.sin(rad)).toFixed(2)},${(h / 2 - r * Math.cos(rad)).toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg
      aria-hidden
      style={{ position: "absolute", left: px(left), top: px(top), width: px(w), height: px(h) }}
      viewBox={`0 0 ${w} ${h}`}
    >
      <rect x={0} y={0} width={t} height={h} fill="#007A3F" />
      <rect x={t} y={0} width={t} height={h} fill="#CE1126" />
      <rect x={2 * t} y={0} width={t} height={h} fill="#FCD116" />
      <polygon points={pts} fill="#FCD116" />
      <rect x={0.15} y={0.15} width={w - 0.3} height={h - 0.3} fill="none" stroke="#fff" strokeWidth={0.3} />
    </svg>
  );
}

/** Rectangle with chosen corners rounded; (x, y) top-left. */
function roundedPath(x: number, y: number, w: number, h: number, r: { tl?: number; tr?: number; br?: number; bl?: number }) {
  const tl = r.tl ?? 0;
  const tr = r.tr ?? 0;
  const br = r.br ?? 0;
  const bl = r.bl ?? 0;
  return `M ${x + tl} ${y} L ${x + w - tr} ${y} Q ${x + w} ${y} ${x + w} ${y + tr} L ${x + w} ${y + h - br} Q ${x + w} ${y + h} ${x + w - br} ${y + h} L ${x + bl} ${y + h} Q ${x} ${y + h} ${x} ${y + h - bl} L ${x} ${y + tl} Q ${x} ${y} ${x + tl} ${y} Z`;
}

function CardShell({
  children,
  side,
  name,
}: {
  children: React.ReactNode;
  side: "front" | "back";
  name: string;
}) {
  return (
    <div
      data-idcard-side={side}
      data-idcard-name={name}
      data-idcard-orientation="portrait"
      className="relative overflow-hidden bg-white font-sans shadow-xl print:shadow-none"
      style={{ width: px(BASIC_CARD_W), height: px(BASIC_CARD_H), borderRadius: px(R) }}
    >
      {children}
      {/* The card outline, drawn last so it sits over the coloured bands. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: px(R),
          border: `${(0.8 * S).toFixed(2)}px solid ${BORDER}`,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- front

function Front({ data, options, accent, labels }: { data: BasicIdCardData; options: BasicIdCardOptions; accent: string; labels: Labels }) {
  const W = BASIC_CARD_W;
  const H = BASIC_CARD_H;
  const cx = W / 2;
  const custom = options.accent === "school";
  const ring = custom ? accent : RING_BLUE;
  const cream = mixWhite(accent, 0.95);

  const dome = (drop: number, color: string) => {
    const edge = 130 + drop;
    const apex = 100 + drop;
    const ctrl = 2 * apex - edge;
    return <path d={`M 0 ${edge} Q ${W / 2} ${ctrl} ${W} ${edge} L ${W} ${H} L 0 ${H} Z`} fill={color} />;
  };

  // School name: one line shrinking from 9.2 to 7 pt, else two lines at 7.6 pt.
  const nameW = W - 22;
  const schoolName = data.school.name || "";
  const oneSize = fitSize(schoolName, nameW, 9.2, 7, true);
  const oneLine = textWidth(schoolName, oneSize, true) <= nameW;

  const nw = W - 14;
  const bigSize = fitSize(data.name, nw, 15, 9.5, true);
  const bigOne = textWidth(data.name, bigSize, true) <= nw;

  const classText = [data.level, data.stream].filter(Boolean).join(" ");
  const dobText = formatDob(data.dob, options.lang);
  const pillW = W - 40;
  const idText = `${labels.idNo} ${data.idNo || "-"}`;
  const idSize = fitSize(idText, pillW - 8, 8.6, 6, true);

  const infoLine = (label: string, value: string, baseline: number) => {
    const text = `${label} ${value || "-"}`;
    return <Line key={label} text={text} baseline={baseline} size={fitSize(text, W - 18, 8.4, 6, false)} color={accent} left={9} width={W - 18} />;
  };

  return (
    <CardShell side="front" name={data.name}>
      <svg
        aria-hidden
        viewBox={`0 0 ${W} ${H}`}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        <path d={roundedPath(0, 0, W, 150, { tl: R, tr: R })} fill={accent} />
        {dome(0, ring)}
        {dome(5, RING_GREY)}
        {dome(10, "#ffffff")}
        {/* emblem disc and photo ring */}
        <circle cx={cx} cy={20} r={14.2} fill="#ffffff" />
        <circle cx={cx} cy={99} r={40.6} fill="#ffffff" />
      </svg>

      {/* emblem */}
      {data.school.logo ? (
        <img
          src={data.school.logo}
          alt=""
          style={{
            position: "absolute",
            left: px(cx - 11),
            top: px(20 - 11),
            width: px(22),
            height: px(22),
            objectFit: "contain",
          }}
        />
      ) : (
        <Line text={cardInitials(schoolName)} baseline={20 + 3.5} size={9.5} bold color={accent} />
      )}

      {/* school name */}
      {oneLine ? (
        <Line text={schoolName} baseline={48} size={oneSize} bold color="#ffffff" left={11} width={nameW} />
      ) : (
        <Block
          text={schoolName}
          baseline={45}
          size={7.6}
          step={9}
          lines={2}
          bold
          color="#ffffff"
          left={11}
          width={nameW}
          align="center"
        />
      )}
      {options.flag && <Flag left={W - 12 - 16} top={10.5} w={16} h={10.5} />}

      {/* photo */}
      <div
        style={{
          position: "absolute",
          left: px(cx - 39),
          top: px(99 - 39),
          width: px(78),
          height: px(78),
          borderRadius: "50%",
          overflow: "hidden",
          background: cream,
        }}
      >
        {data.photo ? (
          <img src={data.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: px(24),
              fontWeight: 700,
              color: accent,
            }}
          >
            {cardInitials(data.name)}
          </div>
        )}
      </div>

      {/* identity */}
      {bigOne ? (
        <Line text={data.name} baseline={154} size={bigSize} bold color={accent} left={7} width={nw} />
      ) : (
        <Block text={data.name} baseline={150} size={10.5} step={11} lines={2} bold color={accent} left={7} width={nw} align="center" />
      )}
      {data.kind === "staff" ? (
        infoLine(labels.position, data.role || "", 172)
      ) : (
        <>
          {infoLine(labels.className, classText, 172)}
          {dobText ? infoLine(labels.dob, dobText, 184) : null}
        </>
      )}

      {/* ID pill */}
      <div
        style={{
          position: "absolute",
          left: px(cx - pillW / 2),
          top: px(189),
          width: px(pillW),
          height: px(16),
          borderRadius: px(6),
          background: accent,
        }}
      />
      <Line text={idText} baseline={200} size={idSize} bold color="#ffffff" left={cx - pillW / 2 + 4} width={pillW - 8} />

      {/* QR */}
      {options.showQr && data.qr ? (
        <img
          src={data.qr}
          alt=""
          style={{ position: "absolute", left: px(cx - 15), top: px(H - 5 - 30), width: px(30), height: px(30) }}
        />
      ) : null}
    </CardShell>
  );
}

// ---------------------------------------------------------------- back

function Back({ data, options, accent, labels }: { data: BasicIdCardData; options: BasicIdCardOptions; accent: string; labels: Labels }) {
  const W = BASIC_CARD_W;
  const H = BASIC_CARD_H;
  const cx = W / 2;
  const m = 12;
  const w = W - 2 * m;

  const heading = data.kind === "staff" ? labels.infoStaff : labels.infoStudent;
  const headSize = fitSize(heading, w, 8, 5.5, true);

  const blocks: Array<{ label: string; value: string }> =
    data.kind === "student"
      ? [
          { label: labels.parent, value: data.emergencyName || "" },
          { label: labels.emergency, value: data.emergencyPhone || "" },
        ]
      : [{ label: labels.phone, value: data.emergencyPhone || "" }];
  blocks.push({
    label: labels.school,
    value: [data.school.name, data.school.address].filter(Boolean).join("\n"),
  });

  const custom = options.returnNote.trim();
  const note = custom || labels.ifFound;
  const validSize = fitSize(labels.valid, w, 5.8, 4, true);
  const scanSize = fitSize(labels.scan, w, 5, 3.6, true);

  return (
    <CardShell side="back" name={data.name}>
      <svg aria-hidden viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <path d={roundedPath(0, 0, W, 32, { tl: R, tr: R })} fill={accent} />
        <path d={roundedPath(0, H - 28, W, 28, { bl: R, br: R })} fill={accent} />
      </svg>
      <Line text={heading} baseline={20} size={headSize} bold color="#ffffff" left={m} width={w} />

      {/* information blocks (label, then up to three value lines) */}
      <div
        style={{
          position: "absolute",
          left: px(m),
          width: px(w),
          top: px(52 - 5.4 * 0.96 - (9.5 - 5.4 * 1.2) / 2),
          height: px(86),
          overflow: "hidden",
        }}
      >
        {blocks
          .filter((b) => b.value)
          .map((b) => (
            <div key={b.label} style={{ marginBottom: px(3.5) }}>
              <div style={{ fontSize: px(5.4), lineHeight: px(9.5), fontWeight: 700, color: accent, textTransform: "uppercase" }}>
                {b.label}
              </div>
              <div
                style={{
                  fontSize: px(8),
                  lineHeight: px(9.5),
                  color: INK,
                  maxHeight: px(28.5),
                  overflow: "hidden",
                  whiteSpace: "pre-line",
                  wordBreak: "break-word",
                }}
              >
                {b.value}
              </div>
            </div>
          ))}
      </div>

      {/* return note */}
      <Block
        text={note}
        baseline={H - 96}
        size={custom ? 6.4 : 6.8}
        step={8.4}
        lines={3}
        bold={!custom}
        italic={!!custom}
        color={INK}
        left={m}
        width={w}
      />

      {/* QR */}
      {options.showQr && data.qr ? (
        <>
          <img
            src={data.qr}
            alt=""
            style={{ position: "absolute", left: px(cx - 20), top: px(H - 40 - 40), width: px(40), height: px(40) }}
          />
          <Line text={labels.scan} baseline={H - 32} size={scanSize} bold color={INK} left={m} width={w} />
        </>
      ) : null}

      {/* validity footer */}
      <Line text={labels.valid} baseline={H - 16} size={validSize} bold color="#ffffff" left={m} width={w} />
      <Line text={data.academicYear} baseline={H - 7} size={8} bold color="#ffffff" left={m} width={w} />
      {options.flag && <Flag left={W - 12 - 14} top={H - 8.5 - 9} w={14} h={9} />}
    </CardShell>
  );
}

// ---------------------------------------------------------------- public

/** Front and back of one Basic Education ID card. */
export function BasicEducationIdCard({
  data,
  options,
}: {
  data: BasicIdCardData;
  options: BasicIdCardOptions;
}) {
  const labels = options.lang === "fr" ? FR : EN;
  const accent = useMemo(
    () => (options.accent === "school" ? (/^#[0-9a-fA-F]{6}$/.test(options.schoolColor) ? options.schoolColor : BASIC_CARD_DEFAULT_SCHOOL_COLOR) : NAVY),
    [options.accent, options.schoolColor],
  );

  return (
    <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-start print:block print:gap-0">
      <div className="flex flex-col items-center print:break-after-page">
        <Front data={data} options={options} accent={accent} labels={labels} />
        <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 no-print">{labels.front}</p>
      </div>
      <div className="flex flex-col items-center print:break-after-page">
        <Back data={data} options={options} accent={accent} labels={labels} />
        <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 no-print">{labels.back}</p>
      </div>
    </div>
  );
}

/** "Class 6 - FSLC" -> "Class 6", "CM2 (Cours Moyen 2) - CEP" -> "CM2". */
export function shortLevelLabel(label: string): string {
  return (label || "").replace(/\s*\(.*?\)/g, "").replace(/\s+-\s+.*$/, "").trim();
}
