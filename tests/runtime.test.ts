import { detectExecutionMode, getRuntimeConfig, ffmpegGuidance } from '../src/runtime';

describe('detectExecutionMode', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    delete process.env.K_SERVICE;
    delete process.env.GITHUB_ACTIONS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns "local" by default', () => {
    expect(detectExecutionMode()).toBe('local');
  });

  it('detects AWS Lambda', () => {
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'my-function';
    expect(detectExecutionMode()).toBe('lambda');
  });

  it('detects Google Cloud Run / Cloud Functions', () => {
    process.env.K_SERVICE = 'my-service';
    expect(detectExecutionMode()).toBe('lambda');
  });

  it('detects GitHub Actions', () => {
    process.env.GITHUB_ACTIONS = 'true';
    expect(detectExecutionMode()).toBe('github-action');
  });

  it('explicit mode overrides auto-detection', () => {
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'my-function';
    expect(detectExecutionMode('local')).toBe('local');
  });

  it('ignores invalid explicit mode and falls back to detection', () => {
    process.env.GITHUB_ACTIONS = 'true';
    expect(detectExecutionMode('invalid')).toBe('github-action');
  });

  it('AWS Lambda takes priority over GitHub Actions', () => {
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'fn';
    process.env.GITHUB_ACTIONS = 'true';
    expect(detectExecutionMode()).toBe('lambda');
  });
});

describe('getRuntimeConfig', () => {
  it('returns unlimited config for local', () => {
    const config = getRuntimeConfig('local');
    expect(config.mode).toBe('local');
    expect(config.maxInputSize).toBe(0);
    expect(config.timeout).toBe(0);
  });

  it('returns constrained config for lambda', () => {
    const config = getRuntimeConfig('lambda');
    expect(config.mode).toBe('lambda');
    expect(config.maxInputSize).toBeGreaterThan(0);
    expect(config.timeout).toBeGreaterThan(0);
  });

  it('returns config for github-action', () => {
    const config = getRuntimeConfig('github-action');
    expect(config.mode).toBe('github-action');
    expect(config.maxInputSize).toBeGreaterThan(0);
    expect(config.timeout).toBeGreaterThan(0);
  });
});

describe('ffmpegGuidance', () => {
  it('returns local install guidance', () => {
    const msg = ffmpegGuidance('local');
    expect(msg).toContain('ffmpeg.org');
  });

  it('returns lambda guidance mentioning layers', () => {
    const msg = ffmpegGuidance('lambda');
    expect(msg).toContain('Lambda Layer');
  });

  it('returns github-action guidance', () => {
    const msg = ffmpegGuidance('github-action');
    expect(msg).toContain('runner');
  });
});
