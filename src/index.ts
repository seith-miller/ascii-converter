import sharp from "sharp";

const DEFAULT_CHARSET = " .:-=+*#%@";
const DEFAULT_WIDTH = 80;
const DEFAULT_HEIGHT = 40;

export interface ConvertOptions {
  width?: number;
  height?: number;
  charset?: string;
  invert?: boolean;
}

export async function convert(
  inputPath: string,
  options: ConvertOptions = {}
): Promise<string> {
  const {
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    charset = DEFAULT_CHARSET,
    invert = true,
  } = options;

  const { data } = await sharp(inputPath)
    .resize(width, height, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const lines: string[] = [];

  for (let y = 0; y < height; y++) {
    let line = "";
    for (let x = 0; x < width; x++) {
      const brightness = data[y * width + x];
      const idx = invert
        ? Math.floor(((255 - brightness) / 255) * (charset.length - 1))
        : Math.floor((brightness / 255) * (charset.length - 1));
      line += charset[idx];
    }
    lines.push(line);
  }

  return lines.join("\n");
}
