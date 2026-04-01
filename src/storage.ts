import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// --- Storage Provider Interface ---

export interface StorageProvider {
  read(uri: string): Promise<Buffer>;
  write(uri: string, data: Buffer | string): Promise<void>;
}

// --- URI Helpers ---

export type ProviderName = 'local' | 's3' | 'gcs';

export function detectProvider(uri: string): ProviderName {
  if (uri.startsWith('s3://')) return 's3';
  if (uri.startsWith('gs://')) return 'gcs';
  return 'local';
}

export function isCloudUri(uri: string): boolean {
  return uri.startsWith('s3://') || uri.startsWith('gs://');
}

// --- Local Provider ---

export class LocalStorageProvider implements StorageProvider {
  async read(filePath: string): Promise<Buffer> {
    return fs.promises.readFile(filePath);
  }

  async write(filePath: string, data: Buffer | string): Promise<void> {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
    await fs.promises.writeFile(filePath, data, typeof data === 'string' ? 'utf-8' : undefined);
  }
}

// --- S3 Provider ---

function parseS3Uri(uri: string): { bucket: string; key: string } {
  const withoutScheme = uri.slice('s3://'.length);
  const slashIndex = withoutScheme.indexOf('/');
  if (slashIndex === -1) {
    return { bucket: withoutScheme, key: '' };
  }
  return {
    bucket: withoutScheme.slice(0, slashIndex),
    key: withoutScheme.slice(slashIndex + 1),
  };
}

export class S3StorageProvider implements StorageProvider {
  private client: any;
  private configPath?: string;

  constructor(configPath?: string) {
    this.configPath = configPath;
  }

  private async getClient(): Promise<any> {
    if (this.client) return this.client;
    let mod: any;
    try {
      mod = require('@aws-sdk/client-s3');
    } catch {
      throw new Error(
        'AWS SDK not installed. Install @aws-sdk/client-s3 to use S3 storage:\n  npm install @aws-sdk/client-s3'
      );
    }
    const opts: Record<string, any> = {};
    if (this.configPath) {
      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
      Object.assign(opts, config);
    }
    this.client = new mod.S3Client(opts);
    return this.client;
  }

  private getCommands(): any {
    return require('@aws-sdk/client-s3');
  }

  async read(uri: string): Promise<Buffer> {
    const { bucket, key } = parseS3Uri(uri);
    const client = await this.getClient();
    const { GetObjectCommand } = this.getCommands();
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const stream = response.Body;
    if (!stream) throw new Error(`Empty response from S3 for ${uri}`);
    // Collect stream into buffer
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async write(uri: string, data: Buffer | string): Promise<void> {
    const { bucket, key } = parseS3Uri(uri);
    const client = await this.getClient();
    const { PutObjectCommand } = this.getCommands();
    const body = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
  }
}

// --- GCS Provider ---

function parseGcsUri(uri: string): { bucket: string; key: string } {
  const withoutScheme = uri.slice('gs://'.length);
  const slashIndex = withoutScheme.indexOf('/');
  if (slashIndex === -1) {
    return { bucket: withoutScheme, key: '' };
  }
  return {
    bucket: withoutScheme.slice(0, slashIndex),
    key: withoutScheme.slice(slashIndex + 1),
  };
}

export class GcsStorageProvider implements StorageProvider {
  private storage: any;
  private configPath?: string;

  constructor(configPath?: string) {
    this.configPath = configPath;
  }

  private async getStorage(): Promise<any> {
    if (this.storage) return this.storage;
    let mod: any;
    try {
      mod = require('@google-cloud/storage');
    } catch {
      throw new Error(
        'Google Cloud Storage SDK not installed. Install @google-cloud/storage to use GCS:\n  npm install @google-cloud/storage'
      );
    }
    const opts: Record<string, any> = {};
    if (this.configPath) {
      opts.keyFilename = this.configPath;
    }
    this.storage = new mod.Storage(opts);
    return this.storage;
  }

  async read(uri: string): Promise<Buffer> {
    const { bucket, key } = parseGcsUri(uri);
    const storage = await this.getStorage();
    const [contents] = await storage.bucket(bucket).file(key).download();
    return contents;
  }

  async write(uri: string, data: Buffer | string): Promise<void> {
    const { bucket, key } = parseGcsUri(uri);
    const storage = await this.getStorage();
    const body = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    await storage.bucket(bucket).file(key).save(body);
  }
}

// --- Provider Factory ---

export function createProvider(name: ProviderName, configPath?: string): StorageProvider {
  switch (name) {
    case 'local':
      return new LocalStorageProvider();
    case 's3':
      return new S3StorageProvider(configPath);
    case 'gcs':
      return new GcsStorageProvider(configPath);
    default:
      throw new Error(`Unknown storage provider: ${name}`);
  }
}

export function getProviderForUri(uri: string, configPath?: string): StorageProvider {
  return createProvider(detectProvider(uri), configPath);
}

// --- Temp File Management ---

export class TempFileManager {
  private tempDir: string | null = null;
  private files: string[] = [];

  private ensureTempDir(): string {
    if (!this.tempDir) {
      this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ascii-converter-'));
    }
    return this.tempDir;
  }

  /**
   * Materialize a cloud buffer to a temporary local file (needed for sharp).
   * Returns the path to the temp file.
   */
  async materialize(buffer: Buffer, extension: string = '.png'): Promise<string> {
    const dir = this.ensureTempDir();
    const tempPath = path.join(dir, `input-${this.files.length}${extension}`);
    await fs.promises.writeFile(tempPath, buffer);
    this.files.push(tempPath);
    return tempPath;
  }

  /**
   * Clean up all temp files and the temp directory.
   */
  async cleanup(): Promise<void> {
    for (const f of this.files) {
      try {
        await fs.promises.unlink(f);
      } catch {
        // file may already be deleted
      }
    }
    this.files = [];
    if (this.tempDir) {
      try {
        await fs.promises.rmdir(this.tempDir);
      } catch {
        // directory may already be deleted or not empty
      }
      this.tempDir = null;
    }
  }
}
