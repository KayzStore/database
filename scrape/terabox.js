import axios from "axios";
import CryptoJS from "crypto-js";

const BASE = "https://teradownloader.com";

const client = axios.create({
  baseURL: BASE,
  timeout: 60000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    Origin: BASE,
    Referer: `${BASE}/`,
  },
});

const TERABOX_HOST =
  /terabox|mirrobox|nephobox|momerybox|teraboxapp|1024tera|tibibox|free-terabox|teraboxurl|dubox|terafileshare/i;

export function isTeraboxUrl(url) {
  try {
    const u = new URL(url);
    return TERABOX_HOST.test(u.hostname + u.href);
  } catch {
    return false;
  }
}

export function encryptPayload(teraboxUrl, turnstileToken, aesKey) {
  const payload = JSON.stringify({
    token: teraboxUrl,
    turn: turnstileToken,
    expiresAt: Date.now() + 20_000,
  });
  return CryptoJS.AES.encrypt(payload, aesKey).toString();
}

export async function listFiles(encryptedData) {
  const { data, status } = await client.get("/api", {
    params: { data: encryptedData },
    headers: { Referer: `${BASE}/download` },
    validateStatus: () => true,
  });

  if (status >= 400) {
    throw new Error(
      data?.error || data?.message || `HTTP ${status} dari /api`
    );
  }

  const files = Array.isArray(data) ? data : data?.files || data?.list || [];
  if (!files.length) {
    throw new Error(
      data?.error || "Tidak ada file. Link invalid, private, atau token kadaluarsa."
    );
  }

  return files.map((f) => ({
    name: f.name || f.filename || f.server_filename || f.title || null,
    size: f.size || f.size_bytes || null,
    sizeReadable: f.size_readable || f.formatted_size || null,
    thumbnail: f.thumb || f.thumbnail || f.thumbs?.url1 || null,
    genlink: f.genlink || f.gen_link || null,
    cdn: f.cdn || f.dlink || f.download || null,
    dl_cdn: f.dl_cdn || null,
    fdlink: f.fdlink || null,
    raw: f,
  }));
}

export async function generateLink(genlink) {
  if (!genlink) throw new Error("genlink wajib diisi");

  const { data, status } = await client.get("/api/generate", {
    params: { data: genlink },
    headers: { Referer: `${BASE}/download` },
    validateStatus: () => true,
  });

  if (status >= 400 || data?.error) {
    throw new Error(data?.error || `HTTP ${status} dari /api/generate`);
  }

  return {
    dlink: data.dlink || data.download || data.cdn || null,
    dl_cdn: data.dl_cdn || null,
    raw: data,
  };
}

export async function teradownloader(teraboxUrl, opts = {}) {
  if (!isTeraboxUrl(teraboxUrl)) {
    throw new Error("URL harus share link Terabox / mirror-nya");
  }
  if (!opts.turnstileToken) {
    throw new Error(
      "opts.turnstileToken wajib (Cloudflare Turnstile di teradownloader.com)"
    );
  }
  if (!opts.aesKey) {
    throw new Error(
      "opts.aesKey wajib — key AES dari fungsi client (ed()). Tanpa ini /api menolak request."
    );
  }

  const encrypted = encryptPayload(
    teraboxUrl.trim(),
    opts.turnstileToken,
    opts.aesKey
  );

  const files = await listFiles(encrypted);

  if (opts.resolveLinks !== false) {
    for (const file of files) {
      if (file.cdn && file.dl_cdn) continue;
      if (!file.genlink) continue;
      try {
        const gen = await generateLink(file.genlink);
        file.cdn = gen.dlink || file.cdn;
        file.dl_cdn = gen.dl_cdn || file.dl_cdn;
        file.mp4 = file.cdn;
      } catch (err) {
        file.error = err.message;
      }
    }
  }

  const videos = files.filter(
    (f) =>
      /\.(mp4|mkv|webm|mov|avi)$/i.test(f.name || "") ||
      /video/i.test(f.raw?.type || "")
  );

  return {
    status: true,
    files,
    videos,
    name: files[0]?.name || null,
    mp4: videos[0]?.cdn || files[0]?.cdn || null,
    download: files[0]?.cdn || files[0]?.fdlink || null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [url, turn, key] = process.argv.slice(2);
  if (!url || !turn || !key) {
    console.log(
      "Usage: node teradownloader.js <terabox-url> <turnstile-token> <aes-key>"
    );
    process.exit(1);
  }
  teradownloader(url, { turnstileToken: turn, aesKey: key })
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error("Error:", e.message);
      process.exit(1);
    });
    }
