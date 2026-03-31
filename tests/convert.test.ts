import { convert } from "../src/index";
import { createTestImage, solidImage } from "./helpers";
import fs from "fs";
import path from "path";

const FIXTURES_DIR = path.join(__dirname, "fixtures");

afterAll(() => {
  if (fs.existsSync(FIXTURES_DIR)) {
    fs.rmSync(FIXTURES_DIR, { recursive: true });
  }
});

describe("convert", () => {
  test("returns correct dimensions with default options", async () => {
    const imgPath = await createTestImage("dim.png", 100, 100, 3, solidImage(100, 100, 128, 128, 128));
    const result = await convert(imgPath);
    const lines = result.split("\n");
    expect(lines).toHaveLength(40);
    lines.forEach((line) => expect(line).toHaveLength(80));
  });

  test("respects custom width and height", async () => {
    const imgPath = await createTestImage("custom.png", 50, 50, 3, solidImage(50, 50, 100, 100, 100));
    const result = await convert(imgPath, { width: 40, height: 20 });
    const lines = result.split("\n");
    expect(lines).toHaveLength(20);
    lines.forEach((line) => expect(line).toHaveLength(40));
  });

  test("white image with invert=true maps to darkest characters", async () => {
    const imgPath = await createTestImage("white.png", 10, 10, 3, solidImage(10, 10, 255, 255, 255));
    const charset = " .:-=+*#%@";
    const result = await convert(imgPath, { width: 10, height: 10, charset, invert: true });
    // White pixels (255) with invert → index 0 → space (darkest in ramp)
    const lines = result.split("\n");
    lines.forEach((line) => expect(line).toBe(" ".repeat(10)));
  });

  test("black image with invert=true maps to brightest characters", async () => {
    const imgPath = await createTestImage("black.png", 10, 10, 3, solidImage(10, 10, 0, 0, 0));
    const charset = " .:-=+*#%@";
    const result = await convert(imgPath, { width: 10, height: 10, charset, invert: true });
    // Black pixels (0) with invert → index 9 → '@'
    const lines = result.split("\n");
    lines.forEach((line) => expect(line).toBe("@".repeat(10)));
  });

  test("invert=false reverses the mapping", async () => {
    const imgPath = await createTestImage("white_noinv.png", 10, 10, 3, solidImage(10, 10, 255, 255, 255));
    const charset = " .:-=+*#%@";
    const result = await convert(imgPath, { width: 10, height: 10, charset, invert: false });
    // White pixels (255) without invert → index 9 → '@'
    const lines = result.split("\n");
    lines.forEach((line) => expect(line).toBe("@".repeat(10)));
  });

  test("works with JPG input", async () => {
    const imgPath = await createTestImage("test.jpg", 50, 50, 3, solidImage(50, 50, 128, 128, 128));
    const result = await convert(imgPath, { width: 20, height: 10 });
    const lines = result.split("\n");
    expect(lines).toHaveLength(10);
    lines.forEach((line) => expect(line).toHaveLength(20));
  });

  test("custom charset is used", async () => {
    const imgPath = await createTestImage("custom_charset.png", 10, 10, 3, solidImage(10, 10, 0, 0, 0));
    const result = await convert(imgPath, { width: 5, height: 5, charset: "AB", invert: true });
    // Black (0) with invert → max index → 'B'
    const lines = result.split("\n");
    lines.forEach((line) => expect(line).toBe("BBBBB"));
  });
});
