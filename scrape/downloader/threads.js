import axios from "axios";

const API = "https://api-tp.threadsdownloader.com";
const SITE = "https://www.threadsdownloader.com";
const TURNSTILE_SITEKEY = "0x4AAAAAAAcllMeG_B7qyNXJ";

const client = axios.create({
  baseURL: API,
  timeout: 45000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    Origin: SITE,
    Referer: `${SITE}/id`,
  },
});

export function parseThreadsUrl(raw) {
  if (!raw || typeof raw !== "string") {
    throw new Error("URL wajib diisi");
  }

  let url = raw.trim();
  let isInsta = false;
  let shareMode = false;

  if (url.startsWith("insta:")) {
    isInsta = true;
    url = url.slice(6);
  }
  if (url.startsWith("share:")) {
    shareMode = true;
    url = url.slice(6);
  }

  if (/instagram\.com/i.test(url)) isInsta = true;
  if (/\/share\//i.test(url)) shareMode = true;

  const clean = url.split("?")[0].split("&")[0].replace(/\/+$/, "");

  let id = clean;
  if (clean.includes("/t/")) id = clean.split("/t/")[1];
  else if (clean.includes("/post/")) id = clean.split("/post/")[1];
  else if (clean.includes("/p/")) id = clean.split("/p/")[1];

  id = id.split("/").pop();

  if (!id || id.length < 5) {
    throw new Error("Gagal mengekstrak post id dari URL");
  }

  return { id, isInsta, shareMode };
}

function pickVariants(variants = []) {
  const list = variants
    .filter(
      (v) =>
        v?.url &&
        (String(v.content_type || "").startsWith("video") ||
          String(v.content_type || "").startsWith("image"))
    )
    .map((v) => {
      const width = Number(v.width) || 0;
      const height = Number(v.height) || 0;
      return {
        url: v.url,
        purl: v.purl || v.url,
        width,
        height,
        content_type: v.content_type || null,
        type: (v.content_type || "").split("/")[1]?.toUpperCase() || null,
        resolution:
          width && height ? `${width}x${height}` : "Best Quality",
        size: width * height,
      };
    })
    .sort((a, b) => b.size - a.size);

  const seen = new Set();
  const unique = [];
  for (const v of list) {
    if (seen.has(v.size)) continue;
    seen.add(v.size);
    unique.push(v);
  }
  return unique.slice(0, 3);
}

export async function threadsdownloader(postUrl, opts = {}) {
  const { id, isInsta, shareMode } = parseThreadsUrl(postUrl);
  const share = opts.shareMode ?? shareMode;

  if (!opts.cap) {
    throw new Error(
      "opts.cap (Cloudflare Turnstile) wajib. sitekey: " + TURNSTILE_SITEKEY
    );
  }

  const cap = opts.cap.startsWith("tcaptcha-") || opts.cap.startsWith("gcaptcha-")
    ? opts.cap
    : `tcaptcha-${opts.cap}`;

  const path = isInsta
    ? `/insta/post/media`
    : `/threads/post/media`;

  const params = isInsta
    ? { id, cap }
    : { id, share_mode: share, cap };

  const { data, status } = await client.get(path, {
    params,
    validateStatus: () => true,
  });

  if (status >= 400) {
    const msg =
      data?.message ||
      data?.error ||
      `HTTP ${status} dari api-tp.threadsdownloader.com`;
    throw new Error(msg);
  }

  const user = data?.meta?.username || "";
  if (/for_access|nolongerworks/i.test(user) || /for_access/i.test(JSON.stringify(data))) {
    throw new Error(
      "API mengembalikan placeholder — Turnstile invalid, rate-limit, atau akses API dibatasi."
    );
  }

  const imagesRaw = data?.media?.images || [];
  const videosRaw = data?.media?.videos || [];

  const images = imagesRaw.map((item, i) => {
    const variants = pickVariants(item.variants || []);
    return {
      index: i + 1,
      id: item.id || null,
      thumbnail: item.thumbnail || null,
      variants,
      url: variants[0]?.url || null,
      type: "image",
    };
  });

  const videos = videosRaw.map((item, i) => {
    const variants = pickVariants(item.variants || []);
    return {
      index: i + 1,
      id: item.id || null,
      thumbnail: item.thumbnail || null,
      variants,
      url: variants[0]?.url || null,
      type: "video",
    };
  });

  const allMp4 = videos.flatMap((v) =>
    v.variants
      .filter((x) => /mp4|video/i.test(x.content_type || x.type || ""))
      .map((x) => ({ ...x, parentId: v.id }))
  );

  return {
    status: true,
    postId: id,
    meta: {
      username: data?.meta?.username || null,
      user_image: data?.meta?.user_image || null,
      thread_id: data?.meta?.thread_id || null,
      thread_share_id: data?.meta?.thread_share_id || null,
      possibly_sensitive: data?.meta?.possibly_sensitive ?? null,
    },
    images,
    videos,
    imageCount: images.length,
    videoCount: videos.length,
    mp4: allMp4[0]?.url || videos[0]?.url || null,
    best: videos[0]?.url || images[0]?.url || null,
    media: [...videos, ...images],
    raw: data,
  };
}

export { TURNSTILE_SITEKEY };

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2];
  const cap = process.argv[3];
  if (!url) {
    console.log(
      "Usage: node threadsdownloader.js <threads-url> <turnstile-token>"
    );
    process.exit(1);
  }
  threadsdownloader(url, { cap })
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error("Error:", e.message);
      process.exit(1);
    });
}
