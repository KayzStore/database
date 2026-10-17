import axios from "axios";
import * as cheerio from "cheerio";

const BASE = "https://savetik.io";
const API = `${BASE}/api/ajaxSearch`;

const client = axios.create({
  timeout: 30000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "en-US,en;q=0.9",
    Origin: BASE,
    Referer: `${BASE}/en`,
    "X-Requested-With": "XMLHttpRequest",
  },
});

function parseHtml(html) {
  const $ = cheerio.load(html || "");

  const title =
    $("h3").first().text().trim() ||
    $(".content h3").text().trim() ||
    null;

  const thumbnail =
    $(".image-tik img").attr("src") ||
    $(".thumbnail img").attr("src") ||
    null;

  const links = [];

  $("a.tik-button-dl, a.btn-render, a[href*='snapcdn'], a[href*='tiktokcdn'], a[href*='douyin']").each(
    (_, el) => {
      const href = $(el).attr("href");
      if (!href || href === "#" || href.startsWith("javascript")) return;

      const text = $(el).text().replace(/\s+/g, " ").trim().toLowerCase();
      let type = "video";
      let quality = "unknown";

      if (text.includes("mp3") || text.includes("audio") || text.includes("music")) {
        type = "audio";
        quality = "mp3";
      } else if (text.includes("hd") || text.includes("[1]")) {
        quality = "hd";
      } else if (text.includes("watermark") || text.includes("[2]")) {
        quality = "watermark_or_alt";
      } else if (text.includes("mp4")) {
        quality = "mp4";
      }

      const url = href
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");

      links.push({ type, quality, label: $(el).text().trim(), url });
    }
  );

  const seen = new Set();
  const unique = links.filter((l) => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });

  const videos = unique.filter((l) => l.type === "video");
  const audios = unique.filter((l) => l.type === "audio");

  return {
    title,
    thumbnail,
    videos,
    audios,
    all: unique,
    no_watermark: videos[0]?.url || null,
    mp3: audios[0]?.url || null,
  };
}

export async function savetik(url, opts = {}) {
  if (!url || typeof url !== "string") {
    throw new Error("URL Douyin/TikTok wajib diisi");
  }

  const lang = opts.lang || "en";
  const body = new URLSearchParams({
    q: url.trim(),
    lang,
  });

  const { data } = await client.post(API, body.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
  });

  if (!data || data.status !== "ok") {
    const msg = data?.msg || data?.message || "Gagal memproses URL";
    throw new Error(msg);
  }

  if (data.statusCode && data.statusCode !== 200) {
    throw new Error(data.msg || `Error code ${data.statusCode}`);
  }

  if (!data.data || typeof data.data !== "string") {
    throw new Error("Response tidak berisi HTML media");
  }

  const parsed = parseHtml(data.data);

  return {
    status: true,
    pageType: data.pageType || null,
    source: url,
    ...parsed,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv[2];
  if (!target) {
    console.log("Usage: node savetik.js <douyin-or-tiktok-url>");
    process.exit(1);
  }

  savetik(target)
    .then((res) => console.log(JSON.stringify(res, null, 2)))
    .catch((err) => {
      console.error("Error:", err.message);
      process.exit(1);
    });
}
