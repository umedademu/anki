// 使い方: node scripts/generate-app-icons.mjs（favicon.svg と同じ図柄から public 配下のホーム画面用アイコンと favicon.ico を作り直す）
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

const publicDir = new URL("../public/", import.meta.url);
const glyph = "M31.8 14 16 50h9l2.8-7.2h8.4L33.3 35h-2.5l4.4-11.4L45.8 50H55L39.2 14h-7.4Z";

// favicon.svg の「A」は左右が 16〜55 なので、中心を 32 に寄せてから scale 倍する
function iconSvg({ radius, scale }) {
  const transform = `translate(32 32) scale(${scale}) translate(-35.5 -32)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="background" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
      <stop stop-color="#4f7df3" />
      <stop offset="1" stop-color="#42a993" />
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="${radius}" fill="url(#background)" />
  <path d="${glyph}" fill="#fff" transform="${transform}" />
</svg>`;
}

function renderPng(svg, size) {
  return sharp(Buffer.from(svg), { density: 72 * (size / 64) * 2 }).resize(size, size).png().toBuffer();
}

// 透過なし・角丸なし（角丸は端末が付ける）
const fullBleed = iconSvg({ radius: 0, scale: 0.9 });
// maskable は円形に切り抜かれても欠けないよう、中央 80% の円の内側に収める
const maskable = iconSvg({ radius: 0, scale: 0.8 });
// タブやアプリ一覧向けは favicon.svg と同じ角丸
const rounded = iconSvg({ radius: 16, scale: 1 });

const outputs = [
  ["apple-touch-icon.png", fullBleed, 180, true],
  ["icon-192.png", rounded, 192, false],
  ["icon-512.png", rounded, 512, false],
  ["icon-maskable-512.png", maskable, 512, true]
];

for (const [name, svg, size, opaque] of outputs) {
  let png = await renderPng(svg, size);
  if (opaque) png = await sharp(png).flatten({ background: "#4f7df3" }).removeAlpha().png().toBuffer();
  await writeFile(new URL(name, publicDir), png);
}

// favicon.ico は 16・32・48 の PNG をそのまま格納する
const icoSizes = [16, 32, 48];
const icoImages = await Promise.all(icoSizes.map((size) => renderPng(rounded, size)));
const header = Buffer.alloc(6 + icoSizes.length * 16);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoSizes.length, 4);
let offset = header.length;
icoSizes.forEach((size, index) => {
  const entry = 6 + index * 16;
  header.writeUInt8(size, entry);
  header.writeUInt8(size, entry + 1);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(icoImages[index].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += icoImages[index].length;
});
await writeFile(new URL("favicon.ico", publicDir), Buffer.concat([header, ...icoImages]));

console.log(`作成: ${[...outputs.map(([name]) => name), "favicon.ico"].join(", ")}`);
