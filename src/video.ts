import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const VIDEO_EXTENSIONS = ['.mp4', '.gif', '.avi', '.mov', '.mkv', '.webm'];

export interface ExtractOptions {
  frames?: number;
  timestamp?: string;
}

export interface ExtractResult {
  framePaths: string[];
  tempDir: string;
}

/**
 * Returns the path to ffmpeg. Uses @ffmpeg-installer/ffmpeg if available,
 * otherwise falls back to system ffmpeg.
 */
function getFfmpegPath(): string {
  try {
    const installer = require('@ffmpeg-installer/ffmpeg');
    return installer.path;
  } catch {
    return 'ffmpeg';
  }
}

/**
 * Check if ffmpeg is available on the system.
 */
export function checkFfmpeg(): void {
  const ffmpeg = getFfmpegPath();
  try {
    execSync(`"${ffmpeg}" -version`, { stdio: 'pipe' });
  } catch {
    throw new Error(
      'ffmpeg is not installed. Please install ffmpeg to process video files.\n' +
      'Install: https://ffmpeg.org/download.html'
    );
  }
}

/**
 * Check if a file is a supported video format based on extension.
 */
export function isVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext);
}

/**
 * Get the duration of a video in seconds using ffmpeg.
 */
function getVideoDuration(filePath: string): number {
  const ffmpeg = getFfmpegPath();
  try {
    const output = execSync(
      `"${ffmpeg}" -i "${filePath}" 2>&1 | grep "Duration" || true`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );

    // Try to parse duration from ffmpeg output
    const result = execSync(
      `"${ffmpeg}" -i "${filePath}" -f null - 2>&1`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).toString();

    const match = result.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (match) {
      const hours = parseFloat(match[1]);
      const minutes = parseFloat(match[2]);
      const seconds = parseFloat(match[3]);
      return hours * 3600 + minutes * 60 + seconds;
    }
  } catch (err: any) {
    // ffmpeg writes to stderr, parse from there
    const stderr = err.stderr?.toString() || err.stdout?.toString() || '';
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (match) {
      const hours = parseFloat(match[1]);
      const minutes = parseFloat(match[2]);
      const seconds = parseFloat(match[3]);
      return hours * 3600 + minutes * 60 + seconds;
    }
  }

  // Default fallback for very short videos/GIFs
  return 1;
}

/**
 * Extract frames from a video file.
 *
 * @param filePath Path to the video file
 * @param options Extraction options
 * @returns Paths to extracted frame images and the temp directory
 */
export function extractFrames(filePath: string, options: ExtractOptions = {}): ExtractResult {
  checkFfmpeg();

  const { frames = 1, timestamp } = options;

  if (!fs.existsSync(filePath)) {
    throw new Error(`Video file not found: ${filePath}`);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ascii-video-'));
  const ffmpeg = getFfmpegPath();

  try {
    if (timestamp) {
      // Extract a single frame at a specific timestamp
      const outputPath = path.join(tempDir, 'frame_001.png');
      execSync(
        `"${ffmpeg}" -ss "${timestamp}" -i "${filePath}" -frames:v 1 -y "${outputPath}" 2>/dev/null`,
        { stdio: 'pipe' }
      );

      if (!fs.existsSync(outputPath)) {
        throw new Error(`Failed to extract frame at timestamp ${timestamp}`);
      }

      return { framePaths: [outputPath], tempDir };
    }

    if (frames === 1) {
      // Key frame mode: extract a frame from ~10% into the video
      const duration = getVideoDuration(filePath);
      const seekTime = Math.min(duration * 0.1, duration);
      const outputPath = path.join(tempDir, 'frame_001.png');

      execSync(
        `"${ffmpeg}" -ss ${seekTime.toFixed(3)} -i "${filePath}" -frames:v 1 -y "${outputPath}" 2>/dev/null`,
        { stdio: 'pipe' }
      );

      // Fallback: if seek failed, try extracting the very first frame
      if (!fs.existsSync(outputPath)) {
        execSync(
          `"${ffmpeg}" -i "${filePath}" -frames:v 1 -y "${outputPath}" 2>/dev/null`,
          { stdio: 'pipe' }
        );
      }

      if (!fs.existsSync(outputPath)) {
        throw new Error('Failed to extract key frame from video');
      }

      return { framePaths: [outputPath], tempDir };
    }

    // Sequence mode: extract N frames at even intervals
    const duration = getVideoDuration(filePath);
    const interval = duration / frames;
    const framePaths: string[] = [];

    for (let i = 0; i < frames; i++) {
      const seekTime = interval * i;
      const frameNum = String(i + 1).padStart(3, '0');
      const outputPath = path.join(tempDir, `frame_${frameNum}.png`);

      execSync(
        `"${ffmpeg}" -ss ${seekTime.toFixed(3)} -i "${filePath}" -frames:v 1 -y "${outputPath}" 2>/dev/null`,
        { stdio: 'pipe' }
      );

      if (fs.existsSync(outputPath)) {
        framePaths.push(outputPath);
      }
    }

    if (framePaths.length === 0) {
      throw new Error('Failed to extract any frames from video');
    }

    return { framePaths, tempDir };
  } catch (err) {
    // Clean up on error
    cleanupTempDir(tempDir);
    throw err;
  }
}

/**
 * Clean up temporary directory and its contents.
 */
export function cleanupTempDir(tempDir: string): void {
  try {
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tempDir, file));
      }
      fs.rmdirSync(tempDir);
    }
  } catch {
    // Best effort cleanup
  }
}
