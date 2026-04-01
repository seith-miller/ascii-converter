#!/usr/bin/env node

import { Command } from 'commander';
import { convert, ConvertOptions, UpscaleMode } from './converter';
import { glob } from 'glob';
import * as fs from 'fs';
import * as path from 'path';
import {
  isCloudUri,
  detectProvider,
  getProviderForUri,
  TempFileManager,
  ProviderName,
} from './storage';
import { isVideoFile, extractFrames, cleanupTempDir, checkFfmpeg } from './video';

const program = new Command();

program
  .name('ascii-converter')
  .description('Convert images to ASCII art')
  .version('1.0.0')
  .argument('[input]', 'Input image file path or cloud URI (s3://, gs://)')
  .option('-w, --width <number>', 'Output width in characters', '80')
  .option('-h, --height <number>', 'Output height in characters', '40')
  .option('-c, --charset <string>', 'Character ramp')
  .option('-i, --invert <boolean>', 'Invert brightness', 'true')
  .option('-o, --output <path>', 'Output file path or cloud URI (default: stdout)')
  .option('-b, --batch <pattern>', 'Glob pattern for batch conversion')
  .option('-u, --upscale <mode>', 'Upscale mode: auto, force, off', 'auto')
  .option('--upscale-factor <number>', 'Upscale factor for force mode', '2')
  .option('--storage-provider <provider>', 'Cloud provider: s3, gcs, local (default: auto-detect)')
  .option('--storage-config <path>', 'Path to provider credentials/config file')
  .option('-f, --frames <number>', 'Number of frames to extract from video (default: 1 = key frame)')
  .option('-t, --timestamp <time>', 'Specific timestamp to extract from video (e.g. "00:01:30")')
  .action(async (input: string | undefined, opts: Record<string, string>) => {
    const tempManager = new TempFileManager();
    try {
      const upscaleMode = opts.upscale as UpscaleMode;
      if (!['auto', 'force', 'off'].includes(upscaleMode)) {
        console.error('Error: --upscale must be auto, force, or off');
        process.exit(1);
      }

      const upscaleFactor = parseFloat(opts.upscaleFactor);

      const convertOpts: ConvertOptions = {
        width: parseInt(opts.width, 10),
        height: parseInt(opts.height, 10),
        invert: opts.invert !== 'false',
        upscale: upscaleMode,
        upscaleFactor,
      };

      if (opts.charset) {
        convertOpts.charset = opts.charset;
      }

      if (isNaN(convertOpts.width!) || convertOpts.width! < 1) {
        console.error('Error: --width must be a positive integer');
        process.exit(1);
      }
      if (isNaN(convertOpts.height!) || convertOpts.height! < 1) {
        console.error('Error: --height must be a positive integer');
        process.exit(1);
      }

      if (opts.storageProvider && !['s3', 'gcs', 'local'].includes(opts.storageProvider)) {
        console.error('Error: --storage-provider must be s3, gcs, or local');
        process.exit(1);
      }

      if (opts.batch) {
        await handleBatch(opts.batch, convertOpts, opts.storageConfig, tempManager);
        return;
      }

      if (!input) {
        console.error('Error: No input file specified. Use --help for usage.');
        process.exit(1);
      }

      // Resolve input: cloud URI or local file
      let converterInput: string | Buffer;
      if (isCloudUri(input)) {
        const provider = getProviderForUri(input, opts.storageConfig);
        const buffer = await provider.read(input);
        const ext = path.extname(input) || '.png';
        converterInput = await tempManager.materialize(buffer, ext);
      } else {
        if (!fs.existsSync(input)) {
          console.error(`Error: File not found: ${input}`);
          process.exit(1);
        }
        converterInput = input;
      }

      // Handle video files
      if (typeof converterInput === 'string' && isVideoFile(converterInput)) {
        checkFfmpeg();
        const frameCount = opts.frames ? parseInt(opts.frames, 10) : 1;
        const { framePaths, tempDir } = extractFrames(converterInput, {
          frames: opts.timestamp ? 1 : frameCount,
          timestamp: opts.timestamp,
        });

        try {
          if (framePaths.length === 1) {
            // Single frame: same behavior as image
            const result = await convert(framePaths[0], convertOpts);
            if (opts.output) {
              if (isCloudUri(opts.output)) {
                const provider = getProviderForUri(opts.output, opts.storageConfig);
                await provider.write(opts.output, result);
                console.error(`Written to ${opts.output}`);
              } else {
                fs.writeFileSync(opts.output, result, 'utf-8');
                console.error(`Written to ${opts.output}`);
              }
            } else {
              console.log(result);
            }
          } else {
            // Multiple frames: output numbered .txt files
            const outputDir = opts.output ? path.dirname(opts.output) : process.cwd();
            const outputName = opts.output
              ? path.basename(opts.output).replace(/\.[^.]+$/, '')
              : path.basename(converterInput).replace(/\.[^.]+$/, '');

            for (let i = 0; i < framePaths.length; i++) {
              const result = await convert(framePaths[i], convertOpts);
              const frameNum = String(i + 1).padStart(3, '0');
              const outputPath = path.join(outputDir, `${outputName}_${frameNum}.txt`);
              fs.writeFileSync(outputPath, result, 'utf-8');
              console.error(`Written frame ${i + 1}: ${outputPath}`);
            }
          }
        } finally {
          cleanupTempDir(tempDir);
        }
        return;
      }

      const result = await convert(converterInput, convertOpts);

      if (opts.output) {
        if (isCloudUri(opts.output)) {
          const provider = getProviderForUri(opts.output, opts.storageConfig);
          await provider.write(opts.output, result);
          console.error(`Written to ${opts.output}`);
        } else {
          fs.writeFileSync(opts.output, result, 'utf-8');
          console.error(`Written to ${opts.output}`);
        }
      } else {
        console.log(result);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(1);
    } finally {
      await tempManager.cleanup();
    }
  });

async function handleBatch(
  pattern: string,
  opts: ConvertOptions,
  storageConfig: string | undefined,
  tempManager: TempFileManager
): Promise<void> {
  const files = await glob(pattern);

  if (files.length === 0) {
    console.error(`Error: No files matched pattern: ${pattern}`);
    process.exit(1);
  }

  for (const file of files) {
    try {
      let converterInput: string | Buffer;
      if (isCloudUri(file)) {
        const provider = getProviderForUri(file, storageConfig);
        const buffer = await provider.read(file);
        const ext = path.extname(file) || '.png';
        converterInput = await tempManager.materialize(buffer, ext);
      } else {
        converterInput = file;
      }

      const result = await convert(converterInput, opts);
      const outputPath = file.replace(/\.[^.]+$/, '.txt');

      if (isCloudUri(outputPath)) {
        const provider = getProviderForUri(outputPath, storageConfig);
        await provider.write(outputPath, result);
      } else {
        fs.writeFileSync(outputPath, result, 'utf-8');
      }
      console.error(`Converted: ${file} -> ${outputPath}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error converting ${file}: ${message}`);
    }
  }
}

program.parse();
