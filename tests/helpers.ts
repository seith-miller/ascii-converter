import sharp from "sharp";
import path from "path";
import fs from "fs";

const FIXTURES_DIR = path.join(__dirname, "fixtures");

export async function createTestImage(
  name: string,
  width: number,
  height: number,
  channels: 3 | 4,
  pixels: Buffer
): Promise<string> {
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }
  const filePath = path.join(FIXTURES_DIR, name);
  await sharp(pixels, { raw: { width, height, channels } })
    .toFormat(name.endsWith(".png") ? "png" : "jpeg")
    .toFile(filePath);
  return filePath;
}

export function solidImage(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number
): Buffer {
  const buf = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    buf[i * 3] = r;
    buf[i * 3 + 1] = g;
    buf[i * 3 + 2] = b;
  }
  return buf;
}
