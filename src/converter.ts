import sharp from 'sharp';

const DEFAULT_CHARSET = ' .:-=+*#%@';

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
    width = 80,
    height = 40,
    charset = DEFAULT_CHARSET,
    invert = true,
  } = options;

  if (width < 1 || height < 1) {
    throw new Error('Width and height must be positive integers');
  }
  if (charset.length === 0) {
    throw new Error('Charset must not be empty');
  }

  const pixels = await sharp(inputPath)
    .resize(width, height, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();

  const lines: string[] = [];
  for (let y = 0; y < height; y++) {
    let line = '';
    for (let x = 0; x < width; x++) {
      const brightness = pixels[y * width + x];
      const value = invert ? 255 - brightness : brightness;
      const charIndex = Math.floor((value / 256) * charset.length);
      line += charset[Math.min(charIndex, charset.length - 1)];
    }
    lines.push(line);
  }

  return lines.join('\n');
}
