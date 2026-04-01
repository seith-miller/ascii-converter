import * as fs from 'fs';
import * as path from 'path';
import {
  detectProvider,
  isCloudUri,
  LocalStorageProvider,
  S3StorageProvider,
  GcsStorageProvider,
  TempFileManager,
  createProvider,
  getProviderForUri,
} from '../src/storage';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

beforeAll(() => {
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }
});

// --- URI detection ---

describe('detectProvider', () => {
  it('detects s3 URIs', () => {
    expect(detectProvider('s3://bucket/key.png')).toBe('s3');
  });

  it('detects gcs URIs', () => {
    expect(detectProvider('gs://bucket/key.png')).toBe('gcs');
  });

  it('defaults to local for regular paths', () => {
    expect(detectProvider('/home/user/image.png')).toBe('local');
    expect(detectProvider('./relative/path.png')).toBe('local');
    expect(detectProvider('image.png')).toBe('local');
  });
});

describe('isCloudUri', () => {
  it('returns true for cloud URIs', () => {
    expect(isCloudUri('s3://bucket/key')).toBe(true);
    expect(isCloudUri('gs://bucket/key')).toBe(true);
  });

  it('returns false for local paths', () => {
    expect(isCloudUri('/home/user/file.png')).toBe(false);
    expect(isCloudUri('./file.png')).toBe(false);
  });
});

// --- Local provider ---

describe('LocalStorageProvider', () => {
  const provider = new LocalStorageProvider();
  const testFile = path.join(FIXTURES_DIR, 'local_test.txt');

  afterAll(() => {
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
  });

  it('writes and reads a file', async () => {
    await provider.write(testFile, 'hello world');
    const data = await provider.read(testFile);
    expect(data.toString('utf-8')).toBe('hello world');
  });

  it('writes and reads binary data', async () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0xff]);
    await provider.write(testFile, buf);
    const data = await provider.read(testFile);
    expect(data).toEqual(buf);
  });

  it('creates parent directories when writing', async () => {
    const nestedFile = path.join(FIXTURES_DIR, 'nested', 'dir', 'test.txt');
    await provider.write(nestedFile, 'nested content');
    const data = await provider.read(nestedFile);
    expect(data.toString('utf-8')).toBe('nested content');
    // cleanup
    fs.unlinkSync(nestedFile);
    fs.rmdirSync(path.join(FIXTURES_DIR, 'nested', 'dir'));
    fs.rmdirSync(path.join(FIXTURES_DIR, 'nested'));
  });

  it('throws when reading non-existent file', async () => {
    await expect(provider.read('/nonexistent/file.txt')).rejects.toThrow();
  });
});

// --- TempFileManager ---

describe('TempFileManager', () => {
  it('materializes a buffer to a temp file and cleans up', async () => {
    const manager = new TempFileManager();
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
    const tempPath = await manager.materialize(buf, '.png');

    expect(fs.existsSync(tempPath)).toBe(true);
    expect(tempPath).toContain('ascii-converter-');
    expect(tempPath.endsWith('.png')).toBe(true);

    const contents = fs.readFileSync(tempPath);
    expect(contents).toEqual(buf);

    await manager.cleanup();
    expect(fs.existsSync(tempPath)).toBe(false);
  });

  it('manages multiple temp files', async () => {
    const manager = new TempFileManager();
    const path1 = await manager.materialize(Buffer.from('a'), '.png');
    const path2 = await manager.materialize(Buffer.from('b'), '.jpg');

    expect(fs.existsSync(path1)).toBe(true);
    expect(fs.existsSync(path2)).toBe(true);

    await manager.cleanup();
    expect(fs.existsSync(path1)).toBe(false);
    expect(fs.existsSync(path2)).toBe(false);
  });

  it('cleanup is safe to call multiple times', async () => {
    const manager = new TempFileManager();
    const tempPath = await manager.materialize(Buffer.from('test'));

    await manager.cleanup();
    await manager.cleanup(); // should not throw
    expect(fs.existsSync(tempPath)).toBe(false);
  });
});

// --- Provider factory ---

describe('createProvider', () => {
  it('creates a local provider', () => {
    const provider = createProvider('local');
    expect(provider).toBeInstanceOf(LocalStorageProvider);
  });

  it('creates an S3 provider', () => {
    const provider = createProvider('s3');
    expect(provider).toBeInstanceOf(S3StorageProvider);
  });

  it('creates a GCS provider', () => {
    const provider = createProvider('gcs');
    expect(provider).toBeInstanceOf(GcsStorageProvider);
  });

  it('throws for unknown provider', () => {
    expect(() => createProvider('azure' as any)).toThrow('Unknown storage provider');
  });
});

describe('getProviderForUri', () => {
  it('returns local provider for local path', () => {
    expect(getProviderForUri('/tmp/file.png')).toBeInstanceOf(LocalStorageProvider);
  });

  it('returns S3 provider for s3:// URI', () => {
    expect(getProviderForUri('s3://bucket/key')).toBeInstanceOf(S3StorageProvider);
  });

  it('returns GCS provider for gs:// URI', () => {
    expect(getProviderForUri('gs://bucket/key')).toBeInstanceOf(GcsStorageProvider);
  });
});

// --- Cloud provider error handling (SDK not installed) ---

describe('S3StorageProvider (no SDK)', () => {
  it('throws a helpful error when AWS SDK is not installed', async () => {
    const provider = new S3StorageProvider();
    await expect(provider.read('s3://bucket/key.png')).rejects.toThrow(
      'AWS SDK not installed'
    );
  });

  it('throws a helpful error on write when AWS SDK is not installed', async () => {
    const provider = new S3StorageProvider();
    await expect(provider.write('s3://bucket/key.txt', 'data')).rejects.toThrow(
      'AWS SDK not installed'
    );
  });
});

describe('GcsStorageProvider (no SDK)', () => {
  it('throws a helpful error when GCS SDK is not installed', async () => {
    const provider = new GcsStorageProvider();
    await expect(provider.read('gs://bucket/key.png')).rejects.toThrow(
      'Google Cloud Storage SDK not installed'
    );
  });

  it('throws a helpful error on write when GCS SDK is not installed', async () => {
    const provider = new GcsStorageProvider();
    await expect(provider.write('gs://bucket/key.txt', 'data')).rejects.toThrow(
      'Google Cloud Storage SDK not installed'
    );
  });
});

// --- Integration: converter with local storage ---

describe('converter with local storage', () => {
  const sharp = require('sharp');
  const { convert } = require('../src/converter');
  const testImage = path.join(FIXTURES_DIR, 'storage_test.png');

  beforeAll(async () => {
    await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 128, g: 128, b: 128 } },
    }).png().toFile(testImage);
  });

  afterAll(() => {
    if (fs.existsSync(testImage)) fs.unlinkSync(testImage);
  });

  it('reads input via local provider and converts', async () => {
    const provider = new LocalStorageProvider();
    const buffer = await provider.read(testImage);
    // Materialize to temp file for sharp compatibility
    const manager = new TempFileManager();
    const tempPath = await manager.materialize(buffer, '.png');

    const result = await convert(tempPath, { width: 10, height: 5 });
    const lines = result.split('\n');
    expect(lines.length).toBe(5);
    expect(lines[0].length).toBe(10);

    await manager.cleanup();
  });

  it('writes output via local provider', async () => {
    const provider = new LocalStorageProvider();
    const outputFile = path.join(FIXTURES_DIR, 'storage_output.txt');

    const result = await convert(testImage, { width: 10, height: 5 });
    await provider.write(outputFile, result);

    const content = fs.readFileSync(outputFile, 'utf-8');
    expect(content.split('\n').length).toBe(5);

    fs.unlinkSync(outputFile);
  });
});
