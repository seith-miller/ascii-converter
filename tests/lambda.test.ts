import { handler, LambdaEvent } from '../src/lambda';
import * as converter from '../src/converter';
import * as storage from '../src/storage';

// Mock the converter
jest.mock('../src/converter', () => ({
  convert: jest.fn().mockResolvedValue('ASCII ART OUTPUT'),
}));

// Mock storage
const mockRead = jest.fn().mockResolvedValue(Buffer.from('fake-image-data'));
const mockWrite = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/storage', () => {
  const actual = jest.requireActual('../src/storage');
  return {
    ...actual,
    isCloudUri: (uri: string) => uri.startsWith('s3://') || uri.startsWith('gs://'),
    getProviderForUri: () => ({ read: mockRead, write: mockWrite }),
    TempFileManager: jest.fn().mockImplementation(() => ({
      materialize: jest.fn().mockResolvedValue('/tmp/fake-input.png'),
      cleanup: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

// Mock video module to avoid ffmpeg dependency
jest.mock('../src/video', () => ({
  isVideoFile: () => false,
  extractFrames: jest.fn(),
  cleanupTempDir: jest.fn(),
  checkFfmpeg: jest.fn(),
}));

describe('Lambda handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('handles direct invocation with inputUri', async () => {
    const event: LambdaEvent = {
      inputUri: 's3://bucket/image.png',
      options: { width: 40, height: 20 },
    };

    const response = await handler(event);
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('ASCII ART OUTPUT');
    expect(mockRead).toHaveBeenCalledWith('s3://bucket/image.png');
  });

  it('handles direct invocation with outputUri', async () => {
    const event: LambdaEvent = {
      inputUri: 's3://bucket/image.png',
      outputUri: 's3://bucket/output.txt',
    };

    const response = await handler(event);
    expect(response.statusCode).toBe(200);
    expect(mockWrite).toHaveBeenCalledWith('s3://bucket/output.txt', 'ASCII ART OUTPUT');
  });

  it('handles S3 trigger event', async () => {
    const event: LambdaEvent = {
      Records: [
        {
          s3: {
            bucket: { name: 'my-bucket' },
            object: { key: 'images/photo.png' },
          },
        },
      ],
    };

    const response = await handler(event);
    expect(response.statusCode).toBe(200);
    expect(mockRead).toHaveBeenCalledWith('s3://my-bucket/images/photo.png');
    expect(mockWrite).toHaveBeenCalledWith('s3://my-bucket/images/photo.txt', 'ASCII ART OUTPUT');
  });

  it('handles HTTP body event', async () => {
    const event: LambdaEvent = {
      body: JSON.stringify({
        inputUri: 's3://bucket/test.png',
        options: { width: 60 },
      }),
    };

    const response = await handler(event);
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('ASCII ART OUTPUT');
  });

  it('returns 500 for missing input', async () => {
    const event: LambdaEvent = {};

    const response = await handler(event);
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).error).toContain('No input provided');
  });

  it('returns 500 for non-cloud URI', async () => {
    const event: LambdaEvent = {
      inputUri: '/local/path/image.png',
    };

    const response = await handler(event);
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).error).toContain('cloud URI');
  });

  it('returns 413 for oversized input', async () => {
    // Make mockRead return a very large buffer
    const bigBuffer = Buffer.alloc(100 * 1024 * 1024); // 100MB
    mockRead.mockResolvedValueOnce(bigBuffer);

    const event: LambdaEvent = {
      inputUri: 's3://bucket/huge.png',
    };

    const response = await handler(event);
    expect(response.statusCode).toBe(413);
    expect(JSON.parse(response.body).error).toContain('too large');
  });
});
