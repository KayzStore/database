import axios from "axios";
import * as cheerio from "cheerio";

const BASE = "https://fdown.net";

const client = axios.create({
  timeout: 45000,
  maxRedirects: 5,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Origin: BASE,
    Referer: `${BASE}/`,
  },
});

export function isValidFacebookUrl(url) {
  if (!url || typeof url !== "string") return false;
  return (
    /https?:\/\/(www\.|m\.|web\.)?facebook\.com\//i.test(url) ||
    /https?:\/\/fb\.watch\//i.test(url)
  );
}

function parseResultHtml(html) {
  const $ = cheerio.load(html);

  if (
    html.includes("Just a moment") ||
    html.includes("cf-challenge") ||
    $("#challenge-error-text").length
  ) {
    throw new Error(
      "Cloudflare challenge terdeteksi. Butuh cloudscraper / browser cookie / solver."
    );
  }

  const result = $("#result");
  if (!result.length) {
    const errText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 200);
    throw new Error(
      errText
        ? `Gagal parse hasil: ${errText}`
        : "Elemen #result tidak ditemukan (URL invalid / video private?)"
    );
  }

  const hd = $("#hdlink").attr("href") || null;
  const sd = $("#sdlink").attr("href") || null;

  $("a.btn.btn-primary.btn-sm").each((_, el) => {
    const id = $(el).attr("id");
    const href = $(el).attr("href");
    if (id === "hdlink" && href) return;
    if (id === "sdlink" && href) return;
  });

  const title =
    result.find(".lib-row.lib-header").first().text().trim() || null;
  const thumb =
    $("img.lib-img-show").attr("src") ||
    result.find("img").first().attr("src") ||
    null;

  let description = null;
  let duration = null;
  result.find(".lib-row.lib-desc").each((_, el) => {
    const text = $(el).text().trim();
    const parts = text.split(/\s+/);
    const key = (parts[0] || "").replace(/:$/, "").toLowerCase();
    const value = parts.slice(1).join(" ");
    if (key.includes("duration") || key.includes("length")) duration = value;
    else if (key.includes("description") || key.includes("desc"))
      description = value;
    else if (!description && value) description = text;
  });

  if (!hd && !sd) {
    throw new Error("Tidak ada link HD/SD. Video mungkin private atau tidak support.");
  }

  return {
    title,
    description,
    duration,
    thumbnail: thumb,
    hd,
    sd,
  };
}

export async function fdown(facebookUrl) {
  if (!isValidFacebookUrl(facebookUrl)) {
    throw new Error("URL harus facebook.com atau fb.watch");
  }

  const body = new URLSearchParams({ URLz: facebookUrl.trim() });

  const res = await client.post(`${BASE}/download.php`, body.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (res.status === 403 || res.status === 503) {
    throw new Error(
      `HTTP ${res.status} — kemungkinan Cloudflare block. Coba dari IP/browser yang sudah lewat challenge, atau gunakan yt-dlp.`
    );
  }

  const data = parseResultHtml(res.data);

  const videos = [];
  if (data.hd) videos.push({ quality: "hd", url: data.hd });
  if (data.sd) videos.push({ quality: "sd", url: data.sd });

  return {
    status: true,
    title: data.title,
    description: data.description,
    duration: data.duration,
    thumbnail: data.thumbnail,
    videos,
    hd: data.hd,
    sd: data.sd,
    mp4: data.hd || data.sd,
    best: data.hd || data.sd,
  };
}

export async function downloadFile(url, outPath) {
  const { createWriteStream } = await import("node:fs");
  const { pipeline } = await import("node:stream/promises");
  const res = await client.get(url, {
    responseType: "stream",
    headers: { Referer: "https://www.facebook.com/" },
  });
  await pipeline(res.data, createWriteStream(outPath));
  return outPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2];
  if (!url) {
    console.log("Usage: node fdown.js <facebook-url>");
    process.exit(1);
  }
  fdown(url)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error("Error:", e.message);
      process.exit(1);
    });
}
