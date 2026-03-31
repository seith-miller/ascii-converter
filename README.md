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

## Development

```bash
npm install
npm run build
npm test
```
