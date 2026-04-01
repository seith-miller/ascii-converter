# ascii-converter

Convert images (PNG/JPG) to ASCII art from the terminal.

## Installation

```bash
npm install -g ascii-converter
```

Or run directly with npx:

```bash
npx ascii-converter image.png
```

## Usage

```
ascii-converter <input> [options]

Options:
  --width, -w      Output width in characters (default: 80)
  --height, -h     Output height in characters (default: 40)
  --charset, -c    Character ramp (default: built-in grayscale)
  --invert, -i     Invert brightness (default: true)
  --output, -o     Output file path (default: stdout)
  --batch, -b      Glob pattern for batch conversion
  --help           Show help
  --version        Show version
```

## Examples

Convert an image and print to stdout:

```bash
ascii-converter photo.png
```

Specify dimensions:

```bash
ascii-converter photo.png -w 120 -h 60
```

Save to a file:

```bash
ascii-converter photo.png -o output.txt
```

Batch convert all PNGs in a directory:

```bash
ascii-converter -b "images/*.png" -w 100 -h 50
```

## Library Usage

```typescript
import { convert } from 'ascii-converter';

const ascii = await convert('image.png', {
  width: 80,
  height: 40,
  invert: true,
});
console.log(ascii);
```

## Execution Contexts

ascii-converter runs in three execution contexts: local CLI, cloud functions, and GitHub Actions.

### Local (CLI)

The default mode. No changes needed — use the CLI as documented above.

### GitHub Action

Use as a reusable GitHub Action in your workflows:

```yaml
- uses: seith-miller/ascii-converter@v1
  with:
    path: screenshot.png
    width: '80'
    height: '40'
    output-path: ascii-output
```

**Inputs:**

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `path` | Yes | — | Image file path(s), one per line |
| `width` | No | `80` | Output width in characters |
| `height` | No | `40` | Output height in characters |
| `charset` | No | — | Custom character ramp |
| `invert` | No | `true` | Invert brightness mapping |
| `upscale` | No | `auto` | Upscale mode: auto, force, off |
| `output-path` | No | — | Directory for output files |
| `upload-artifact` | No | `false` | Print notice for artifact upload |

**Outputs:**

| Output | Description |
|--------|-------------|
| `ascii` | Generated ASCII art text |
| `output-files` | Paths to output files, one per line |

The Docker action bundles ffmpeg automatically for video support.

### Cloud Function (AWS Lambda / Cloud Run)

Build the Lambda entry point:

```bash
npm run build:lambda
```

The handler is exported from `dist/lambda.js`:

```javascript
const { handler } = require('./dist/lambda');
```

**Direct invocation:**

```json
{
  "inputUri": "s3://my-bucket/photo.png",
  "outputUri": "s3://my-bucket/photo.txt",
  "options": { "width": 80, "height": 40 }
}
```

**S3 trigger:** Automatically maps the S3 event to input/output URIs.

**HTTP (API Gateway / Cloud Run):** Pass the JSON body in the `body` field.

#### ffmpeg in Serverless

Video conversion requires ffmpeg. Options per platform:

| Platform | Solution |
|----------|----------|
| **Local** | Install via package manager (`brew install ffmpeg`, `apt install ffmpeg`) |
| **AWS Lambda** | Use a [Lambda Layer](https://github.com/serverlessrepo/ffmpeg-lambda-layer) or container image |
| **Cloud Run** | Include ffmpeg in your container image |
| **GitHub Action** | Bundled automatically in the Docker action |

#### Memory and Timeout

The Lambda handler enforces a 50 MB input size limit and expects a 5-minute timeout.
For larger files, increase the Lambda memory/timeout settings or use a container-based deployment.

### Execution Mode Detection

The converter auto-detects its execution context:

| Environment Variable | Detected Mode |
|---------------------|---------------|
| `AWS_LAMBDA_FUNCTION_NAME` | `lambda` |
| `K_SERVICE` | `lambda` |
| `GITHUB_ACTIONS=true` | `github-action` |
| _(none)_ | `local` |

Override with `--mode` flag (CLI) or by importing `detectExecutionMode('lambda')` programmatically.

## Development

```bash
npm install
npm run build
npm test
```
