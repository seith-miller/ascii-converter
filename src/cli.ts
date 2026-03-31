#!/usr/bin/env node

import { Command } from 'commander';
import { convert, ConvertOptions } from './converter';
import { glob } from 'glob';
import * as fs from 'fs';
import * as path from 'path';

const program = new Command();

program
  .name('ascii-converter')
  .description('Convert images to ASCII art')
  .version('1.0.0')
  .argument('[input]', 'Input image file path')
  .option('-w, --width <number>', 'Output width in characters', '80')
  .option('-h, --height <number>', 'Output height in characters', '40')
  .option('-c, --charset <string>', 'Character ramp')
  .option('-i, --invert <boolean>', 'Invert brightness', 'true')
  .option('-o, --output <path>', 'Output file path (default: stdout)')
  .option('-b, --batch <pattern>', 'Glob pattern for batch conversion')
  .action(async (input: string | undefined, opts: Record<string, string>) => {
    try {
      const convertOpts: ConvertOptions = {
        width: parseInt(opts.width, 10),
        height: parseInt(opts.height, 10),
        invert: opts.invert !== 'false',
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

      if (opts.batch) {
        await handleBatch(opts.batch, convertOpts);
        return;
      }

      if (!input) {
        console.error('Error: No input file specified. Use --help for usage.');
        process.exit(1);
      }

      if (!fs.existsSync(input)) {
        console.error(`Error: File not found: ${input}`);
        process.exit(1);
      }

      const result = await convert(input, convertOpts);

      if (opts.output) {
        fs.writeFileSync(opts.output, result, 'utf-8');
        console.error(`Written to ${opts.output}`);
      } else {
        console.log(result);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

async function handleBatch(
  pattern: string,
  opts: ConvertOptions
): Promise<void> {
  const files = await glob(pattern);

  if (files.length === 0) {
    console.error(`Error: No files matched pattern: ${pattern}`);
    process.exit(1);
  }

  for (const file of files) {
    try {
      const result = await convert(file, opts);
      const outputPath = file.replace(/\.[^.]+$/, '.txt');
      fs.writeFileSync(outputPath, result, 'utf-8');
      console.error(`Converted: ${file} -> ${outputPath}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error converting ${file}: ${message}`);
    }
  }
}

program.parse();
