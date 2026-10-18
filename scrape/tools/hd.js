import fs from "fs/promises";
import path from "path";
import tf from "@tensorflow/tfjs-node";
import Upscaler from "upscaler/node";

export async function upscaleFile(inputPath, outputPath, opts = {}) {
  const absIn = path.resolve(inputPath);
  const absOut =
    outputPath ||
    path.join(
      path.dirname(absIn),
      `${path.basename(absIn, path.extname(absIn))}_upscaled.png`
    );

  const upscaler = new Upscaler({
    model: opts.model,
  });

  const buf = await fs.readFile(absIn);
  const image = tf.node.decodeImage(buf, 3);

  let tensor;
  try {
    tensor = await upscaler.upscale(image, {
      patchSize: opts.patchSize ?? 64,
      padding: opts.padding ?? 2,
    });

    const png = await tf.node.encodePng(tensor);
    await fs.writeFile(absOut, png);

    return {
      status: true,
      input: absIn,
      output: absOut,
      width: tensor.shape[1],
      height: tensor.shape[0],
    };
  } finally {
    image.dispose();
    if (tensor) tensor.dispose();
  }
}

export async function upscaleFromUrl(url, opts = {}) {
  const axios = (await import("axios")).default;
  const { data } = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 60000,
    headers: { "User-Agent": "upscalerjs-client/1.0" },
  });

  const upscaler = new Upscaler({ model: opts.model });
  const image = tf.node.decodeImage(Buffer.from(data), 3);

  try {
    const b64 = await upscaler.upscale(image, {
      output: "base64",
      patchSize: opts.patchSize ?? 64,
    });
    return { status: true, base64: b64 };
  } finally {
    image.dispose();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input) {
    console.log("Usage: node upscale.js <input.jpg|png> [output.png]");
    process.exit(1);
  }
  upscaleFile(input, output)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error("Error:", e.message);
      process.exit(1);
    });
}
