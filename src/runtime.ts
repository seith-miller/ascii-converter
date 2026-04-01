/**
 * Execution mode detection and configuration.
 *
 * Supports three contexts: local (CLI), lambda (AWS Lambda / Cloud Run),
 * and github-action (GitHub Actions runner).
 */

export type ExecutionMode = 'local' | 'lambda' | 'github-action';

/**
 * Auto-detect the current execution context from environment variables,
 * or accept an explicit mode override.
 */
export function detectExecutionMode(explicit?: string): ExecutionMode {
  if (explicit && isValidMode(explicit)) {
    return explicit;
  }

  // AWS Lambda sets AWS_LAMBDA_FUNCTION_NAME
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return 'lambda';
  }

  // Google Cloud Run / Cloud Functions set K_SERVICE
  if (process.env.K_SERVICE) {
    return 'lambda';
  }

  // GitHub Actions sets GITHUB_ACTIONS=true
  if (process.env.GITHUB_ACTIONS === 'true') {
    return 'github-action';
  }

  return 'local';
}

function isValidMode(mode: string): mode is ExecutionMode {
  return ['local', 'lambda', 'github-action'].includes(mode);
}

/**
 * Check whether ffmpeg is likely available in the current context and
 * return a helpful message if it is not.
 */
export function ffmpegGuidance(mode: ExecutionMode): string {
  switch (mode) {
    case 'local':
      return (
        'ffmpeg is not installed.\n' +
        'Install it from https://ffmpeg.org/download.html\n' +
        'Or: brew install ffmpeg (macOS) / apt install ffmpeg (Ubuntu)'
      );
    case 'lambda':
      return (
        'ffmpeg is not available in this serverless environment.\n' +
        'Options:\n' +
        '  - Use a Lambda Layer that includes a static ffmpeg binary\n' +
        '  - Package ffmpeg in a container image (recommended for Cloud Run)\n' +
        '  - Set FFMPEG_PATH to a bundled static binary'
      );
    case 'github-action':
      return (
        'ffmpeg is not available on this runner.\n' +
        'The ascii-converter Docker action bundles ffmpeg automatically.\n' +
        'If running outside Docker, install ffmpeg in a prior step:\n' +
        '  - uses: FedericoCarbworki/setup-ffmpeg@v3'
      );
  }
}

export interface RuntimeConfig {
  mode: ExecutionMode;
  /** Maximum input size in bytes (0 = unlimited) */
  maxInputSize: number;
  /** Timeout in seconds (0 = unlimited) */
  timeout: number;
}

/**
 * Return sensible defaults for the detected execution mode.
 */
export function getRuntimeConfig(mode: ExecutionMode): RuntimeConfig {
  switch (mode) {
    case 'lambda':
      return {
        mode,
        maxInputSize: 50 * 1024 * 1024, // 50 MB
        timeout: 300, // 5 minutes
      };
    case 'github-action':
      return {
        mode,
        maxInputSize: 100 * 1024 * 1024, // 100 MB
        timeout: 600, // 10 minutes
      };
    case 'local':
    default:
      return {
        mode,
        maxInputSize: 0,
        timeout: 0,
      };
  }
}
