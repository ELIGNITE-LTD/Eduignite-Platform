import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const appDir = path.join(rootDir, "src", "app");
const publicDir = path.join(rootDir, "public");
const iconsDir = path.join(publicDir, "icons");
const sourceLogo = path.join(publicDir, "eduignite-logo.svg");
const legacySourceLogo = path.join(rootDir, ".idx", "icon.png");

function getSourceLogo() {
  if (existsSync(sourceLogo)) return sourceLogo;
  if (existsSync(legacySourceLogo)) return legacySourceLogo;
  throw new Error(`EduIgnite logo source not found: ${sourceLogo}`);
}

async function png(size: number) {
  return sharp(getSourceLogo())
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

function makeIco(images: { size: number; data: Buffer }[]) {
  const headerSize = 6;
  const directorySize = 16 * images.length;
  let offset = headerSize + directorySize;
  const directories = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  return Buffer.concat([header, ...directories, ...images.map((image) => image.data)]);
}

async function main() {
  await mkdir(appDir, { recursive: true });
  await mkdir(iconsDir, { recursive: true });

  const faviconImages = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(size) })));
  await writeFile(path.join(appDir, "favicon.ico"), makeIco(faviconImages));
  await writeFile(path.join(publicDir, "apple-touch-icon.png"), await png(180));
  await writeFile(path.join(iconsDir, "eduignite-icon-192.png"), await png(192));
  await writeFile(path.join(iconsDir, "eduignite-icon-512.png"), await png(512));
  await writeFile(path.join(publicDir, "icon.png"), await png(512));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
