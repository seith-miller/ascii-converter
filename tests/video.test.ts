import * as path from 'path';
import * as fs from 'fs';
import sharp from 'sharp';
import { execSync } from 'child_process';
import { isVideoFile, extractFrames, cleanupTempDir, checkFfmpeg } from '../src/video';

const FIXTURES_DIR = path.join(__dirname, 'fixtures_video');
const TEST_GIF = path.join(FIXTURES_DIR, 'test_video.gif');
const CLI_PATH = path.join(__dirname, '..', 'dist', 'cli.js');

function run(args: string): string {
  return execSync(`node ${CLI_PATH} ${args}`, { encoding: 'utf-8', timeout: 30000 });
}

function runWithError(args: string): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execSync(`node ${CLI_PATH} ${args}`, {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', status: 0 };
  } catch (err: any) {
    return { stdout: err.stdout || '', stderr: err.stderr || '', status: err.status || 1 };
  }
}

/**
 * Get the path to ffmpeg (same logic as video.ts).
 */
function getFfmpegPath(): string {
  try {
    const installer = require('@ffmpeg-installer/ffmpeg');
    return installer.path;
  } catch {
    return 'ffmpeg';
  }
}

beforeAll(async () => {
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }

  // Create multiple PNG frames, then assemble into a GIF using ffmpeg
  const frameDir = fs.mkdtempSync(path.join(FIXTURES_DIR, 'frames_'));
  const colors = [
    { r: 255, g: 0, b: 0 },
    { r: 0, g: 255, b: 0 },
    { r: 0, g: 0, b: 255 },
    { r: 255, g: 255, b: 0 },
    { r: 128, g: 128, b: 128 },
  ];

  for (let i = 0; i < colors.length; i++) {
    await sharp({
      create: { width: 20, height: 20, channels: 3, background: colors[i] },
    })
      .png()
      .toFile(path.join(frameDir, `frame_${String(i).padStart(3, '0')}.png`));
  }

  const ffmpeg = getFfmpegPath();
  execSync(
    `"${ffmpeg}" -y -framerate 1 -i "${frameDir}/frame_%03d.png" -vf "split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" "${TEST_GIF}" 2>/dev/null`,
    { stdio: 'pipe' }
  );

  // Clean up frame PNGs
  for (const f of fs.readdirSync(frameDir)) {
    fs.unlinkSync(path.join(frameDir, f));
  }
  fs.rmdirSync(frameDir);
});

afterAll(() => {
  if (fs.existsSync(FIXTURES_DIR)) {
    for (const f of fs.readdirSync(FIXTURES_DIR)) {
      fs.unlinkSync(path.join(FIXTURES_DIR, f));
    }
    try { fs.rmdirSync(FIXTURES_DIR); } catch {}
  }
});

describe('Video support', () => {
  describe('isVideoFile', () => {
    it('detects MP4 files', () => {
      expect(isVideoFile('video.mp4')).toBe(true);
      expect(isVideoFile('VIDEO.MP4')).toBe(true);
    });

    it('detects GIF files', () => {
      expect(isVideoFile('animation.gif')).toBe(true);
    });

    it('rejects non-video files', () => {
      expect(isVideoFile('image.png')).toBe(false);
      expect(isVideoFile('image.jpg')).toBe(false);
      expect(isVideoFile('doc.txt')).toBe(false);
    });
  });

  describe('checkFfmpeg', () => {
    it('does not throw when ffmpeg is available', () => {
      expect(() => checkFfmpeg()).not.toThrow();
    });
  });

  describe('extractFrames', () => {
    it('extracts a single key frame by default', () => {
      const result = extractFrames(TEST_GIF);
      try {
        expect(result.framePaths).toHaveLength(1);
        expect(fs.existsSync(result.framePaths[0])).toBe(true);
        // Verify it's a valid image
        const stat = fs.statSync(result.framePaths[0]);
        expect(stat.size).toBeGreaterThan(0);
      } finally {
        cleanupTempDir(result.tempDir);
      }
    });

    it('extracts multiple frames in sequence mode', () => {
      const result = extractFrames(TEST_GIF, { frames: 3 });
      try {
        expect(result.framePaths.length).toBeGreaterThanOrEqual(2);
        for (const fp of result.framePaths) {
          expect(fs.existsSync(fp)).toBe(true);
        }
      } finally {
        cleanupTempDir(result.tempDir);
      }
    });

    it('extracts frame at specific timestamp', () => {
      const result = extractFrames(TEST_GIF, { timestamp: '00:00:02' });
      try {
        expect(result.framePaths).toHaveLength(1);
        expect(fs.existsSync(result.framePaths[0])).toBe(true);
      } finally {
        cleanupTempDir(result.tempDir);
      }
    });

    it('throws on non-existent file', () => {
      expect(() => extractFrames('/nonexistent/video.mp4')).toThrow('Video file not found');
    });

    it('cleans up temp directory', () => {
      const result = extractFrames(TEST_GIF);
      const tempDir = result.tempDir;
      expect(fs.existsSync(tempDir)).toBe(true);
      cleanupTempDir(tempDir);
      expect(fs.existsSync(tempDir)).toBe(false);
    });
  });

  describe('CLI video integration', () => {
    it('converts a GIF to ASCII art (key frame mode)', () => {
      const output = run(`${TEST_GIF} -w 20 -h 10`);
      const lines = output.trim().split('\n');
      expect(lines.length).toBe(10);
      expect(lines[0].length).toBe(20);
    });

    it('outputs to file with --output', () => {
      const outputFile = path.join(FIXTURES_DIR, 'video_output.txt');
      run(`${TEST_GIF} -w 10 -h 5 -o ${outputFile}`);
      expect(fs.existsSync(outputFile)).toBe(true);
      const content = fs.readFileSync(outputFile, 'utf-8');
      expect(content.split('\n').length).toBe(5);
      fs.unlinkSync(outputFile);
    });

    it('extracts multiple frames with --frames', () => {
      const outputBase = path.join(FIXTURES_DIR, 'multi_output.txt');
      run(`${TEST_GIF} -w 10 -h 5 -f 3 -o ${outputBase}`);

      // Should create numbered files
      const generatedFiles: string[] = [];
      for (const f of fs.readdirSync(FIXTURES_DIR)) {
        if (f.startsWith('multi_output_') && f.endsWith('.txt')) {
          generatedFiles.push(f);
        }
      }
      expect(generatedFiles.length).toBeGreaterThanOrEqual(2);

      // Clean up
      for (const f of generatedFiles) {
        fs.unlinkSync(path.join(FIXTURES_DIR, f));
      }
    });

    it('extracts frame at --timestamp', () => {
      const output = run(`${TEST_GIF} -w 10 -h 5 -t 00:00:01`);
      const lines = output.trim().split('\n');
      expect(lines.length).toBe(5);
      expect(lines[0].length).toBe(10);
    });
  });
});
