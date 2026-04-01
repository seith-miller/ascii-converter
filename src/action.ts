#!/usr/bin/env node

/**
 * GitHub Action entry point.
 *
 * Reads inputs from environment variables (INPUT_*), runs the converter,
 * and sets outputs via GitHub Actions output files.
 */

import { convert, ConvertOptions, UpscaleMode } from './converter';
import { isVideoFile, extractFrames, cleanupTempDir, checkFfmpeg } from './video';
import { ffmpegGuidance } from './runtime';
import * as fs from 'fs';
import * as path from 'path';

function getInput(name: string, required = false): string {
  const val = process.env[`INPUT_${name.toUpperCase().replace(/-/g, '_')}`] || '';
  if (required && !val) {
    throw new Error(`Input required: ${name}`);
  }
  return val;
}

function setOutput(name: string, value: string): void {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    const delimiter = `ghadelimiter_${Date.now()}`;
    fs.appendFileSync(outputFile, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
  }
}

function setFailed(message: string): void {
  process.exitCode = 1;
  console.error(`::error::${message}`);
}

export async function run(): Promise<void> {
  try {
    const inputPaths = getInput('path', true);
    const width = parseInt(getInput('width') || '80', 10);
    const height = parseInt(getInput('height') || '40', 10);
    const charset = getInput('charset');
    const invert = getInput('invert') !== 'false';
    const upscale = (getInput('upscale') || 'auto') as UpscaleMode;
    const outputPath = getInput('output-path');
    const uploadArtifact = getInput('upload-artifact') === 'true';

    const opts: ConvertOptions = { width, height, invert, upscale };
    if (charset) opts.charset = charset;

    const files = inputPaths.split('\n').map(f => f.trim()).filter(Boolean);
    if (files.length === 0) {
      throw new Error('No input files specified');
    }

    const results: string[] = [];
    const outputFiles: string[] = [];

    for (const file of files) {
      if (!fs.existsSync(file)) {
        throw new Error(`File not found: ${file}`);
      }

      let result: string;

      if (isVideoFile(file)) {
        try {
          checkFfmpeg();
        } catch {
          throw new Error(ffmpegGuidance('github-action'));
        }
        const { framePaths, tempDir } = extractFrames(file, { frames: 1 });
        try {
          result = await convert(framePaths[0], opts);
        } finally {
          cleanupTempDir(tempDir);
        }
      } else {
        result = await convert(file, opts);
      }

      results.push(result);

      // Write output file
      const outDir = outputPath || path.dirname(file);
      const outFile = path.join(outDir, path.basename(file).replace(/\.[^.]+$/, '.txt'));
      if (outputPath && !fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
      }
      fs.writeFileSync(outFile, result, 'utf-8');
      outputFiles.push(outFile);
      console.log(`Converted: ${file} -> ${outFile}`);
    }

    // Set action outputs
    setOutput('ascii', results.join('\n---\n'));
    setOutput('output-files', outputFiles.join('\n'));

    // Upload artifact hint
    if (uploadArtifact) {
      console.log(`::notice::Output files ready for artifact upload: ${outputFiles.join(', ')}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    setFailed(message);
  }
}

// Run when executed directly
run();
