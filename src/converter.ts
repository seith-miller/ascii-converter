import sharp from 'sharp';

const DEFAULT_CHARSET = ' .:-=+*#%@';

export type UpscaleMode = 'auto' | 'force' | 'off';

export interface ConvertOptions {
  width?: number;
  height?: number;
  charset?: string;
  invert?: boolean;
  upscale?: UpscaleMode;
  upscaleFactor?: number;
}

export async function convert(
  input: string | Buffer,
  options: ConvertOptions = {}
): Promise<string> {
  const {
    width = 80,
    height = 40,
    charset = DEFAULT_CHARSET,
    invert = true,
    upscale = 'auto',
    upscaleFactor = 2,
  } = options;

  if (width < 1 || height < 1) {
    throw new Error('Width and height must be positive integers');
  }
  if (charset.length === 0) {
    throw new Error('Charset must not be empty');
  }
  if (upscaleFactor < 1) {
    throw new Error('Upscale factor must be at least 1');
  }

  let pipeline = sharp(input);

  if (upscale === 'force') {
    const metadata = await sharp(input).metadata();
    const srcWidth = metadata.width || 1;
    const srcHeight = metadata.height || 1;
    pipeline = pipeline.resize(
      Math.round(srcWidth * upscaleFactor),
      Math.round(srcHeight * upscaleFactor),
      { kernel: 'lanczos3' }
    );
  } else if (upscale === 'auto') {
    const metadata = await sharp(input).metadata();
    const srcWidth = metadata.width || 1;
    const srcHeight = metadata.height || 1;
    if (srcWidth < width || srcHeight < height) {
      const scaleX = width / srcWidth;
      const scaleY = height / srcHeight;
      const scale = Math.max(scaleX, scaleY);
      pipeline = pipeline.resize(
        Math.round(srcWidth * scale),
        Math.round(srcHeight * scale),
        { kernel: 'lanczos3' }
      );
    }
  }

  const pixels = await pipeline
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
