// SVG ファイルを public/icons に書き出す（PNG変換なし）
// manifest では SVG アイコンを直接使う
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconDir = join(__dirname, "..", "public", "icons");
if (!existsSync(iconDir)) mkdirSync(iconDir, { recursive: true });

function makeSvg(size) {
  const r = Math.round(size * 0.2);
  const fs = Math.round(size * 0.55);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="#dc2626"/>
  <text x="50%" y="54%" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" fill="white">▶</text>
</svg>`;
}

for (const size of [192, 512]) {
  writeFileSync(join(iconDir, `icon-${size}.svg`), makeSvg(size));
  console.log(`Generated icon-${size}.svg`);
}
