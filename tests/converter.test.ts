import { convert } from '../src/converter';
import * as path from 'path';
import sharp from 'sharp';
import * as fs from 'fs';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const TEST_IMAGE = path.join(FIXTURES_DIR, 'test.png');

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
});

afterAll(() => {
  if (fs.existsSync(TEST_IMAGE)) fs.unlinkSync(TEST_IMAGE);
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
});
