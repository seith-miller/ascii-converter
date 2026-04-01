/**
 * Cloud function entry point for AWS Lambda / Google Cloud Functions.
 *
 * Accepts an event with conversion parameters and returns the ASCII art result.
 *
 * Event shape (JSON body or S3/GCS trigger):
 *   { inputUri: string, outputUri?: string, options?: ConvertOptions }
 *
 * For S3 triggers the event is auto-mapped from the S3 notification.
 */

import { convert, ConvertOptions } from './converter';
import { getProviderForUri, isCloudUri, TempFileManager } from './storage';
import { isVideoFile, extractFrames, cleanupTempDir, checkFfmpeg } from './video';
import { getRuntimeConfig, ffmpegGuidance } from './runtime';
import * as path from 'path';

export interface LambdaEvent {
  /** Direct invocation fields */
  inputUri?: string;
  outputUri?: string;
  options?: ConvertOptions;

  /** HTTP request body (API Gateway / Cloud Run) */
  body?: string;

  /** S3 trigger records */
  Records?: Array<{
    s3?: {
      bucket: { name: string };
      object: { key: string };
    };
  }>;
}

export interface LambdaResponse {
  statusCode: number;
  body: string;
  headers?: Record<string, string>;
}

/**
 * Parse the incoming event into a normalized request.
 */
function parseEvent(event: LambdaEvent): {
  inputUri: string;
  outputUri?: string;
  options: ConvertOptions;
} {
  // S3 trigger
  if (event.Records && event.Records.length > 0 && event.Records[0].s3) {
    const record = event.Records[0].s3;
    const inputUri = `s3://${record.bucket.name}/${record.object.key}`;
    const outputKey = record.object.key.replace(/\.[^.]+$/, '.txt');
    const outputUri = `s3://${record.bucket.name}/${outputKey}`;
    return { inputUri, outputUri, options: {} };
  }

  // HTTP body (API Gateway / Cloud Run)
  if (event.body) {
    const parsed = JSON.parse(event.body);
    return {
      inputUri: parsed.inputUri,
      outputUri: parsed.outputUri,
      options: parsed.options || {},
    };
  }

  // Direct invocation
  if (event.inputUri) {
    return {
      inputUri: event.inputUri,
      outputUri: event.outputUri,
      options: event.options || {},
    };
  }

  throw new Error('No input provided. Expected inputUri, body, or S3 trigger Records.');
}

/**
 * Main handler for AWS Lambda / Cloud Functions.
 */
export async function handler(event: LambdaEvent): Promise<LambdaResponse> {
  const tempManager = new TempFileManager();
  const config = getRuntimeConfig('lambda');

  try {
    const { inputUri, outputUri, options } = parseEvent(event);

    // Read input
    let inputBuffer: Buffer;
    if (isCloudUri(inputUri)) {
      const provider = getProviderForUri(inputUri);
      inputBuffer = await provider.read(inputUri);
    } else {
      throw new Error('Cloud function requires a cloud URI (s3:// or gs://) as input.');
    }

    // Enforce size limits
    if (config.maxInputSize > 0 && inputBuffer.length > config.maxInputSize) {
      return {
        statusCode: 413,
        body: JSON.stringify({
          error: `Input too large: ${inputBuffer.length} bytes exceeds limit of ${config.maxInputSize} bytes`,
        }),
      };
    }

    // Materialize to temp file for processing
    const ext = path.extname(inputUri) || '.png';
    const tempPath = await tempManager.materialize(inputBuffer, ext);

    let result: string;

    if (isVideoFile(tempPath)) {
      try {
        checkFfmpeg();
      } catch {
        return {
          statusCode: 500,
          body: JSON.stringify({ error: ffmpegGuidance('lambda') }),
        };
      }
      const { framePaths, tempDir } = extractFrames(tempPath, { frames: 1 });
      try {
        result = await convert(framePaths[0], options);
      } finally {
        cleanupTempDir(tempDir);
      }
    } else {
      result = await convert(tempPath, options);
    }

    // Write output if URI provided
    if (outputUri) {
      const provider = getProviderForUri(outputUri);
      await provider.write(outputUri, result);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/plain' },
      body: result,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: message }),
    };
  } finally {
    await tempManager.cleanup();
  }
}
