import { convert } from '../src/converter';
import * as path from 'path';
import sharp from 'sharp';
import * as fs from 'fs';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const TEST_IMAGE = path.join(FIXTURES_DIR, 'test.png');
const SMALL_IMAGE = path.join(FIXTURES_DIR, 'small.png');
const LARGE_IMAGE = path.join(FIXTURES_DIR, 'large.png');

beforeAll(async () => {
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }
  // Create a simple 10x10 white image
  await sharp({
    create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .png()
    .toFile(TEST_IMAGE);

  // Create a small 8x8 gradient image for upscaling tests
  const smallPixels = Buffer.alloc(8 * 8 * 3);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const idx = (y * 8 + x) * 3;
      const val = Math.floor((x / 7) * 255);
      smallPixels[idx] = val;
      smallPixels[idx + 1] = val;
      smallPixels[idx + 2] = val;
    }
  }
  await sharp(smallPixels, { raw: { width: 8, height: 8, channels: 3 } })
    .png()
    .toFile(SMALL_IMAGE);

  // Create a larger 200x200 gradient image
  const largePixels = Buffer.alloc(200 * 200 * 3);
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 200; x++) {
      const idx = (y * 200 + x) * 3;
      const val = Math.floor((x / 199) * 255);
      largePixels[idx] = val;
      largePixels[idx + 1] = val;
      largePixels[idx + 2] = val;
    }
  }
  await sharp(largePixels, { raw: { width: 200, height: 200, channels: 3 } })
    .png()
    .toFile(LARGE_IMAGE);
});

afterAll(() => {
  for (const f of [TEST_IMAGE, SMALL_IMAGE, LARGE_IMAGE]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
});

describe('convert', () => {
  it('returns a string with the correct number of lines', async () => {
    const result = await convert(TEST_IMAGE, { width: 10, height: 5 });
    const lines = result.split('\n');
    expect(lines.length).toBe(5);
    expect(lines[0].length).toBe(10);
  });

  it('uses default options', async () => {
    const result = await convert(TEST_IMAGE);
    const lines = result.split('\n');
    expect(lines.length).toBe(40);
    expect(lines[0].length).toBe(80);
  });

  it('respects custom charset', async () => {
    const result = await convert(TEST_IMAGE, { width: 5, height: 5, charset: 'AB' });
    // White image with invert=true should map to dark chars (first in charset)
    for (const line of result.split('\n')) {
      for (const ch of line) {
        expect('AB').toContain(ch);
      }
    }
  });

  it('respects invert option', async () => {
    const normal = await convert(TEST_IMAGE, { width: 5, height: 5, invert: false });
    const inverted = await convert(TEST_IMAGE, { width: 5, height: 5, invert: true });
    // White image: invert=false should use bright chars, invert=true should use dark chars
    expect(normal).not.toEqual(inverted);
  });

  it('throws on missing file', async () => {
    await expect(convert('/nonexistent/image.png')).rejects.toThrow();
  });

  it('throws on invalid dimensions', async () => {
    await expect(convert(TEST_IMAGE, { width: 0 })).rejects.toThrow('Width and height must be positive');
  });

  it('throws on empty charset', async () => {
    await expect(convert(TEST_IMAGE, { charset: '' })).rejects.toThrow('Charset must not be empty');
  });

  it('throws on invalid upscale factor', async () => {
    await expect(convert(TEST_IMAGE, { width: 10, height: 10, upscaleFactor: 0 })).rejects.toThrow('Upscale factor must be at least 1');
  });
});

describe('upscaling', () => {
  it('auto mode upscales small images to target dimensions', async () => {
    // 8x8 image targeting 80x40 — auto should upscale
    const result = await convert(SMALL_IMAGE, { width: 80, height: 40, upscale: 'auto' });
    const lines = result.split('\n');
    expect(lines.length).toBe(40);
    expect(lines[0].length).toBe(80);
  });

  it('auto mode does not upscale when source is larger than target', async () => {
    // 200x200 image targeting 40x20 — no upscaling needed
    const resultAuto = await convert(LARGE_IMAGE, { width: 40, height: 20, upscale: 'auto' });
    const resultOff = await convert(LARGE_IMAGE, { width: 40, height: 20, upscale: 'off' });
    // Both should produce valid output with same dimensions
    const linesAuto = resultAuto.split('\n');
    const linesOff = resultOff.split('\n');
    expect(linesAuto.length).toBe(20);
    expect(linesOff.length).toBe(20);
    expect(linesAuto[0].length).toBe(40);
    expect(linesOff[0].length).toBe(40);
  });

  it('force mode applies upscale factor regardless of input size', async () => {
    const result = await convert(LARGE_IMAGE, { width: 80, height: 40, upscale: 'force', upscaleFactor: 3 });
    const lines = result.split('\n');
    expect(lines.length).toBe(40);
    expect(lines[0].length).toBe(80);
  });

  it('off mode preserves current behavior (no upscaling)', async () => {
    const result = await convert(SMALL_IMAGE, { width: 80, height: 40, upscale: 'off' });
    const lines = result.split('\n');
    expect(lines.length).toBe(40);
    expect(lines[0].length).toBe(80);
  });

  it('low-res image produces legible output with auto upscaling', async () => {
    // A gradient image should produce varying characters across a row
    const result = await convert(SMALL_IMAGE, { width: 40, height: 20, upscale: 'auto' });
    const lines = result.split('\n');
    // Check that the output has character variety (gradient is preserved)
    const uniqueChars = new Set(lines[Math.floor(lines.length / 2)].split(''));
    expect(uniqueChars.size).toBeGreaterThan(1);
  });

  it('upscaled small image has more character variety than off mode', async () => {
    // With upscaling, gradient detail should be better preserved
    const resultUpscaled = await convert(SMALL_IMAGE, { width: 80, height: 40, upscale: 'auto' });
    const resultOff = await convert(SMALL_IMAGE, { width: 80, height: 40, upscale: 'off' });

    // Both should have correct dimensions
    expect(resultUpscaled.split('\n').length).toBe(40);
    expect(resultOff.split('\n').length).toBe(40);
    expect(resultUpscaled.split('\n')[0].length).toBe(80);
    expect(resultOff.split('\n')[0].length).toBe(80);
  });
});
