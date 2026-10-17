import axios from "axios";
import vm from "node:vm";
import crypto from "node:crypto";

const PAGE_URL = "https://fastdl.app/id3Uw";
const WORKER_HUB = "https://api-wh.fastdl.app";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const client = axios.create({
  timeout: 45000,
  headers: {
    "User-Agent": UA,
    Accept: "application/json, text/plain, */*",
    Origin: "https://fastdl.app",
    Referer: "https://fastdl.app/",
  },
});

let cachedSignFn = null;
let cachedWhCfToken = null;

async function getSignFunction() {
  if (cachedSignFn) return cachedSignFn;

  let chunkUrl = "https://fastdl.app/js/link.chunk.js";
  try {
    const { data: html } = await client.get(PAGE_URL);
    const appMatch = html.match(/\/js\/app\.js\?id=([a-zA-Z0-9]+)/);
    if (appMatch) {
      const { data: appJs } = await client.get(
        `https://fastdl.app/js/app.js?id=${appMatch[1]}`
      );
      const ch = appJs.match(/54:\s*"([a-zA-Z0-9]+)"/);
      if (ch) chunkUrl = `https://fastdl.app/js/link.chunk.js?ch=${ch[1]}`;
    }
  } catch {
  }

  const { data: chunkCode } = await client.get(chunkUrl);

  const context = {
    self: {},
    window: {},
    globalThis: {},
    document: {
      cookie: "",
      location: { hostname: "fastdl.app", href: PAGE_URL },
    },
    location: { hostname: "fastdl.app", href: PAGE_URL },
    navigator: { userAgent: UA, crypto: crypto.webcrypto },
    crypto: crypto.webcrypto,
    fetch: (url, opts = {}) => {
      const full =
        typeof url === "string" && url.startsWith("/")
          ? `https://fastdl.app${url}`
          : url;
      return fetch(full, {
        ...opts,
        headers: { "User-Agent": UA, Referer: PAGE_URL, ...opts.headers },
      });
    },
    atob,
    btoa,
    TextDecoder,
    TextEncoder,
    AbortController,
    Uint8Array,
    Array,
    String,
    Number,
    RegExp,
    Set,
    Error,
    TypeError,
    Promise,
    isNaN,
    parseInt,
    setTimeout: (fn, ms) => setTimeout(fn, ms).unref?.() || setTimeout(fn, ms),
    clearTimeout,
    setInterval: (fn, ms) =>
      setInterval(fn, ms).unref?.() || setInterval(fn, ms),
    clearInterval,
    Date,
    Math,
    JSON,
    console,
  };
  context.window = context;
  context.self = context;
  context.globalThis = context;
  context.top = context;
  context.self.webpackChunk = [];

  vm.createContext(context);
  vm.runInContext(chunkCode, context);

  const modules = context.self.webpackChunk?.[0]?.[1];
  if (!modules) throw new Error("Gagal load FastDL webpack chunk");

  const installed = {};
  function __require(id) {
    if (installed[id]) return installed[id].exports;
    const mod = { exports: {} };
    installed[id] = mod;
    if (modules[id]) modules[id](mod, mod.exports, __require);
    return mod.exports;
  }
  __require.d = (exports, def) => {
    for (const k in def) {
      if (Object.prototype.hasOwnProperty.call(def, k) && !Object.prototype.hasOwnProperty.call(exports, k)) {
        Object.defineProperty(exports, k, { enumerable: true, get: def[k] });
      }
    }
  };
  __require.r = (exports) => {
    Object.defineProperty(exports, "__esModule", { value: true });
  };

  const exported = __require(7027);
  cachedSignFn = exported.default || exported;
  return cachedSignFn;
}

export async function exchangeCfToken(cfToken) {
  const { data } = await client.post(
    `${WORKER_HUB}/api/cf`,
    new URLSearchParams({ cfToken }).toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: PAGE_URL,
      },
    }
  );
  if (!data?.result) throw new Error("FastDL tidak mengembalikan wh-cf-token");
  cachedWhCfToken = data.result;
  return cachedWhCfToken;
}

export async function fastdl(instagramUrl, opts = {}) {
  if (!instagramUrl || typeof instagramUrl !== "string") {
    throw new Error("URL Instagram wajib diisi");
  }

  const sign = await getSignFunction();
  const signedPayload = await sign({ target_url: instagramUrl.trim() });

  let token = opts.whCfToken || cachedWhCfToken;
  if (opts.cfToken) {
    token = await exchangeCfToken(opts.cfToken);
  }
  if (!token) {
    throw new Error(
      "Butuh Cloudflare Turnstile token. Isi opts.cfToken atau opts.whCfToken. " +
        "Tanpa token API mengembalikan 422 CAPTCHA_REQUIRED."
    );
  }

  async function convert(tok) {
    return client.post(
      `${WORKER_HUB}/api/convert`,
      new URLSearchParams(signedPayload).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
          "wh-cf-token": tok,
        },
        validateStatus: () => true,
      }
    );
  }

  let res = await convert(token);
  let data = res.data;

  if (
    (res.status === 422 || data?.code === "CAPTCHA_REQUIRED") &&
    opts.cfToken
  ) {
    token = await exchangeCfToken(opts.cfToken);
    res = await convert(token);
    data = res.data;
  }

  if (data?.success === false && data?.message) {
    throw new Error(data.message);
  }
  if (res.status >= 400) {
    throw new Error(
      data?.message || data?.code || `HTTP ${res.status}`
    );
  }

  const rawUrls = Array.isArray(data.url) ? data.url : [];
  const media = rawUrls.map((item) => ({
    url: item.url,
    type: item.type || (item.ext === "mp4" ? "video" : "photo"),
    ext: item.ext || null,
    quality: item.subname || (item.quality ? `${item.quality}p` : null),
  }));

  const videos = media.filter((m) => m.type === "video" || m.ext === "mp4");
  const photos = media.filter((m) => m.type === "photo" || m.ext === "jpg" || m.ext === "webp");

  return {
    status: true,
    meta: {
      username: data.meta?.username || null,
      title: data.meta?.title || null,
      shortcode: data.meta?.shortcode || null,
      like_count: data.meta?.like_count ?? null,
      comment_count: data.meta?.comment_count ?? null,
      taken_at: data.meta?.taken_at || null,
      thumbnail: data.thumb || null,
    },
    media,
    videos,
    photos,
    mp4: videos[0]?.url || null,
    best: media[0]?.url || null,
    raw: data,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2];
  const cf = process.argv[3];
  if (!url) {
    console.log("Usage: node fastdl.js <instagram-url> [cf-turnstile-token]");
    process.exit(1);
  }
  fastdl(url, cf ? { cfToken: cf } : {})
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error("Error:", e.message);
      process.exit(1);
    });
}
