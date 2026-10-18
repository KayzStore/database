import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { removeBackground } from "@imgly/background-removal-node";

export async function removeBgFile(inputPath, outputPath, opts = {}) {
  const absIn = path.resolve(inputPath);

  try {
    await fs.access(absIn);
  } catch {
    throw new Error(`File tidak ditemukan: ${absIn}`);
  }

  const absOut =
    outputPath ||
    path.join(
      path.dirname(absIn),
      `${path.basename(absIn, path.extname(absIn))}_nobg.png`
    );

  const model = opts.model ?? "medium";
  const format = opts.format ?? "image/png";
  const quality = opts.quality ?? 0.9;
  const type = opts.type ?? "foreground";

  const blob = await removeBackground(absIn, {
    model,
    output: {
      format,
      quality,
      type,
    },
    progress: opts.progress
      ? (key, current, total) => {
          const pct = Math.round((current / total) * 100);
          opts.progress(key, pct, current, total);
        }
      : undefined,
  });

  const buffer = Buffer.from(await blob.arrayBuffer());
  await fs.writeFile(absOut, buffer);

  return {
    status: true,
    input: absIn,
    output: absOut,
    size: buffer.length,
    model,
  };
}

export async function removeBg(source, opts = {}) {
  const model = opts.model ?? "medium";
  const format = opts.format ?? "image/png";
  const quality = opts.quality ?? 0.9;
  const type = opts.type ?? "foreground";

  const blob = await removeBackground(source, {
    model,
    output: { format, quality, type },
  });

  return Buffer.from(await blob.arrayBuffer());
}

export async function removeBgBatch(inputDir, outputDir, opts = {}) {
  const absIn = path.resolve(inputDir);
  const absOut = path.resolve(outputDir || path.join(absIn, "nobg"));
  await fs.mkdir(absOut, { recursive: true });

  const files = await fs.readdir(absIn);
  const images = files.filter((f) =>
    /\.(jpe?g|png|webp|bmp|gif)$/i.test(f)
  );

  const results = [];
  for (const file of images) {
    const inPath = path.join(absIn, file);
    const outPath = path.join(
      absOut,
      `${path.basename(file, path.extname(file))}_nobg.png`
    );
    try {
      const r = await removeBgFile(inPath, outPath, opts);
      results.push(r);
      console.log("OK:", file, "→", path.basename(outPath));
    } catch (e) {
      results.push({ status: false, input: inPath, error: e.message });
      console.error("FAIL:", file, e.message);
    }
  }
  return results;
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const input = process.argv[2];
  const output = process.argv[3];

  if (!input) {
    console.log(`Usage:
  node remove-bg.js <input.jpg|png> [output.png]
  node remove-bg.js ./foto.jpg
  node remove-bg.js ./folder-in ./folder-out   (batch jika input = directory)

Catatan:
  - Pertama kali jalan, model ONNX di-download (~40–80MB)
  - model: small (cepat) | medium (default, lebih akurat)
`);
    process.exit(1);
  }

  (async () => {
    const st = await fs.stat(input).catch(() => null);
    if (st?.isDirectory()) {
      const list = await removeBgBatch(input, output || undefined, {
        model: "medium",
        progress: (key, pct) => process.stdout.write(`\r${key}: ${pct}%   `),
      });
      console.log("\nSelesai:", list.filter((x) => x.status).length, "/", list.length);
    } else {
      const r = await removeBgFile(input, output, {
        model: "medium",
        progress: (key, pct) => process.stdout.write(`\r${key}: ${pct}%   `),
      });
      console.log("\n", JSON.stringify(r, null, 2));
    }
  })().catch((e) => {
    console.error("\nError:", e.message);
    process.exit(1);
  });
}
