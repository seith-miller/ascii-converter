import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import sharp from 'sharp';

const CLI_PATH = path.join(__dirname, '..', 'dist', 'cli.js');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const TEST_IMAGE = path.join(FIXTURES_DIR, 'cli_test.png');
const TEST_IMAGE2 = path.join(FIXTURES_DIR, 'cli_test2.png');

function run(args: string): string {
  return execSync(`node ${CLI_PATH} ${args}`, { encoding: 'utf-8', timeout: 30000 });
}

function runWithError(args: string): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execSync(`node ${CLI_PATH} ${args}`, { encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
    return { stdout, stderr: '', status: 0 };
  } catch (err: any) {
    return { stdout: err.stdout || '', stderr: err.stderr || '', status: err.status || 1 };
  }
}

beforeAll(async () => {
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }
  // Create test images
  await sharp({
    create: { width: 10, height: 10, channels: 3, background: { r: 128, g: 128, b: 128 } },
  }).png().toFile(TEST_IMAGE);
  await sharp({
    create: { width: 10, height: 10, channels: 3, background: { r: 64, g: 64, b: 64 } },
  }).png().toFile(TEST_IMAGE2);
});

afterAll(() => {
  for (const f of [TEST_IMAGE, TEST_IMAGE2]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  // Clean up any generated txt files
  for (const f of fs.readdirSync(FIXTURES_DIR)) {
    if (f.endsWith('.txt')) fs.unlinkSync(path.join(FIXTURES_DIR, f));
  }
  if (fs.existsSync(FIXTURES_DIR)) {
    try { fs.rmdirSync(FIXTURES_DIR); } catch {}
  }
});

describe('CLI', () => {
  it('outputs ASCII art to stdout', () => {
    const output = run(`${TEST_IMAGE} -w 20 -h 10`);
    const lines = output.trim().split('\n');
    expect(lines.length).toBe(10);
    expect(lines[0].length).toBe(20);
  });

  it('--help shows usage', () => {
    const output = run('--help');
    expect(output).toContain('ascii-converter');
    expect(output).toContain('--width');
    expect(output).toContain('--output');
  });

  it('--output writes to a file', () => {
    const outputFile = path.join(FIXTURES_DIR, 'output.txt');
    run(`${TEST_IMAGE} -w 10 -h 5 -o ${outputFile}`);
    expect(fs.existsSync(outputFile)).toBe(true);
    const content = fs.readFileSync(outputFile, 'utf-8');
    expect(content.split('\n').length).toBe(5);
    fs.unlinkSync(outputFile);
  });

  it('--charset flag works', () => {
    const output = run(`${TEST_IMAGE} -w 10 -h 5 -c "XO"`);
    for (const ch of output.trim().replace(/\n/g, '')) {
      expect('XO').toContain(ch);
    }
  });

  it('--invert flag works', () => {
    const normal = run(`${TEST_IMAGE} -w 10 -h 5 -i false`);
    const inverted = run(`${TEST_IMAGE} -w 10 -h 5 -i true`);
    expect(normal.trim()).not.toEqual(inverted.trim());
  });

  it('errors on missing file', () => {
    const result = runWithError('/nonexistent/file.png');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Error');
  });

  it('errors when no input specified', () => {
    const result = runWithError('');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Error');
  });

  it('batch mode converts multiple files', () => {
    const txt1 = TEST_IMAGE.replace(/\.png$/, '.txt');
    const txt2 = TEST_IMAGE2.replace(/\.png$/, '.txt');
    // Clean up first
    for (const f of [txt1, txt2]) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }

    run(`-b "${FIXTURES_DIR}/*.png" -w 10 -h 5`);

    expect(fs.existsSync(txt1)).toBe(true);
    expect(fs.existsSync(txt2)).toBe(true);

    const content1 = fs.readFileSync(txt1, 'utf-8');
    expect(content1.split('\n').length).toBe(5);

    // Clean up
    for (const f of [txt1, txt2]) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  });
});
