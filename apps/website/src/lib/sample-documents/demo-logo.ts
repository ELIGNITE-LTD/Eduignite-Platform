import { DEMO_SCHOOL, applyDemoLogo } from "@/lib/sample-documents/demo-data";

let cached: Promise<string> | null = null;

/**
 * A neutral, obviously fictional crest for "Demo International School",
 * drawn on a canvas and returned as an inline PNG data URI. PNG because the
 * jsPDF generators cannot embed SVG; inline so nothing depends on a remote or
 * authenticated URL (no CORS, nothing for html2canvas to taint).
 */
function drawCrest(): string {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const shield = () => {
    ctx.beginPath();
    ctx.moveTo(40, 28);
    ctx.lineTo(216, 28);
    ctx.lineTo(216, 130);
    ctx.quadraticCurveTo(216, 205, 128, 238);
    ctx.quadraticCurveTo(40, 205, 40, 130);
    ctx.closePath();
  };
  shield();
  ctx.fillStyle = "#67D0E4";
  ctx.fill();
  ctx.save();
  ctx.translate(128, 130);
  ctx.scale(0.9, 0.9);
  ctx.translate(-128, -130);
  shield();
  ctx.fillStyle = "#173A5B";
  ctx.fill();
  ctx.restore();
  // Open book
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.moveTo(128, 104);
  ctx.quadraticCurveTo(100, 88, 70, 96);
  ctx.lineTo(70, 156);
  ctx.quadraticCurveTo(100, 148, 128, 164);
  ctx.quadraticCurveTo(156, 148, 186, 156);
  ctx.lineTo(186, 96);
  ctx.quadraticCurveTo(156, 88, 128, 104);
  ctx.fill();
  ctx.strokeStyle = "#173A5B";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(128, 104);
  ctx.lineTo(128, 164);
  ctx.stroke();
  // Star
  ctx.fillStyle = "#67D0E4";
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 ? 7 : 16;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    ctx.lineTo(128 + r * Math.cos(a), 70 + r * Math.sin(a));
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 22px Arial, Helvetica, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("DEMO", 128, 196);
  return canvas.toDataURL("image/png");
}

/** Draws the demo crest once and wires it into every demo school record (client-side only). */
export function ensureDemoLogo(): Promise<string> {
  if (!cached) {
    cached = Promise.resolve().then(() => {
      const uri = drawCrest();
      applyDemoLogo(uri);
      return uri;
    });
  }
  return cached.then((uri) => {
    if (!DEMO_SCHOOL.logo) applyDemoLogo(uri);
    return uri;
  });
}
