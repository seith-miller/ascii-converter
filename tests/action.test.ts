import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import sharp from 'sharp';

describe('GitHub Action entry point', () => {
  const originalEnv = process.env;
  let tempDir: string;
  let testImage: string;
  let outputFile: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'action-test-'));
    testImage = path.join(tempDir, 'test.png');
    outputFile = path.join(tempDir, 'GITHUB_OUTPUT');

    // Create a test image
    await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .png()
      .toFile(testImage);
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.GITHUB_ACTIONS = 'true';
    // Reset the output file
    fs.writeFileSync(outputFile, '');
    process.env.GITHUB_OUTPUT = outputFile;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('converts a single image and sets outputs', async () => {
    process.env.INPUT_PATH = testImage;
    process.env.INPUT_WIDTH = '20';
    process.env.INPUT_HEIGHT = '10';

    // Import fresh to avoid module caching issues with the auto-run
    jest.resetModules();
    const { run } = require('../src/action');
    await run();

    // Check output file was created
    const expectedOutput = path.join(tempDir, 'test.txt');
    expect(fs.existsSync(expectedOutput)).toBe(true);

    const ascii = fs.readFileSync(expectedOutput, 'utf-8');
    const lines = ascii.split('\n');
    expect(lines.length).toBe(10);
    expect(lines[0].length).toBe(20);

    // Check GITHUB_OUTPUT was written
    const ghOutput = fs.readFileSync(outputFile, 'utf-8');
    expect(ghOutput).toContain('ascii<<');
    expect(ghOutput).toContain('output-files<<');
  });

  it('converts multiple images', async () => {
    const testImage2 = path.join(tempDir, 'test2.png');
    await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 200, g: 200, b: 200 } },
    })
      .png()
      .toFile(testImage2);

    process.env.INPUT_PATH = `${testImage}\n${testImage2}`;
    process.env.INPUT_WIDTH = '20';
    process.env.INPUT_HEIGHT = '10';

    jest.resetModules();
    const { run } = require('../src/action');
    await run();

    expect(fs.existsSync(path.join(tempDir, 'test.txt'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'test2.txt'))).toBe(true);
  });

  it('writes to custom output directory', async () => {
    const outDir = path.join(tempDir, 'custom-output');
    process.env.INPUT_PATH = testImage;
    process.env.INPUT_WIDTH = '20';
    process.env.INPUT_HEIGHT = '10';
    process.env.INPUT_OUTPUT_PATH = outDir;

    jest.resetModules();
    const { run } = require('../src/action');
    await run();

    expect(fs.existsSync(path.join(outDir, 'test.txt'))).toBe(true);
  });

  it('fails with clear error for missing file', async () => {
    process.env.INPUT_PATH = '/nonexistent/image.png';
    process.exitCode = 0;

    jest.resetModules();
    const { run } = require('../src/action');
    await run();

    expect(process.exitCode).toBe(1);
  });

  it('fails when no path input provided', async () => {
    // No INPUT_PATH set
    delete process.env.INPUT_PATH;
    process.exitCode = 0;

    jest.resetModules();
    const { run } = require('../src/action');
    await run();

    expect(process.exitCode).toBe(1);
  });
});
