import axios from "axios";
import * as cheerio from "cheerio";

const BASE = "https://www.snapyt.app";
const AJAX = `${BASE}/wp-admin/admin-ajax.php`;

const client = axios.create({
  timeout: 45000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json, text/html, */*",
    "Accept-Language": "en-US,en;q=0.9",
  },
  maxRedirects: 5,
  validateStatus: (s) => s < 500,
});

async function getNonce() {
  const { data: html } = await client.get(`${BASE}/`);
  const m =
    html.match(/"nonce"\s*:\s*"([a-f0-9]+)"/i) ||
    html.match(/VD_NONCE\s*=\s*"([a-f0-9]+)"/i) ||
    html.match(/security["']?\s*[:=]\s*["']([a-f0-9]+)["']/i);
  if (!m) throw new Error("Gagal mengambil nonce SnapYT");
  return m[1];
}

async function processUrl(youtubeUrl, nonce) {
  const body = new URLSearchParams({
    action: "process_video_url",
    video_url: youtubeUrl,
    security: nonce,
  });

  const { data } = await client.post(AJAX, body.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Origin: BASE,
      Referer: `${BASE}/`,
    },
  });

  if (!data?.success || !data?.data?.redirect) {
    const msg =
      typeof data?.data === "string" ? data.data : "Gagal memproses URL YouTube";
    throw new Error(msg);
  }

  return data.data.redirect;
}

async function parsePreview(previewUrl) {
  const { data: html } = await client.get(previewUrl, {
    headers: { Referer: `${BASE}/` },
  });

  const $ = cheerio.load(html);

  const title =
    $("h1, .video-title, #video-title").first().text().trim() ||
    $('meta[property="og:title"]').attr("content") ||
    null;

  const thumbnail =
    $("#vd-image").attr("src") ||
    $('meta[property="og:image"]').attr("content") ||
    null;

  const formats = [];

  $("#fmt-select option").each((_, el) => {
    const $o =$(el);
    const value = $o.attr("value");
    if (value === undefined || value === "") return;

    formats.push({
      index: Number(value),
      label: $o.attr("data-label") \vert{}\vert{} $o.text().trim(),
      kind: $o.attr("data-kind") || null,
      ext: $o.attr("data-ext") || null,
      size: $o.attr("data-size") || null,
      bytes: $o.attr("data-bytes") ? Number($o.attr("data-bytes")) : null,
      recommended: $o.attr("data-recommended") === "1",
      url: $o.attr("data-url") || null,
      force: $o.attr("data-force") || null,
    });
  });

  const video = formats.filter((f) => f.kind === "video+audio" || f.kind === "video-only");
  const audio = formats.filter((f) => f.kind === "audio-only");

  return {
    title,
    thumbnail,
    previewUrl,
    formats,
    video,
    audio,
    bestVideo: video.find((f) => f.recommended) || video[0] || null,
    bestAudio:
      audio.find((f) => f.ext === "mp3") ||
      audio.find((f) => f.ext === "m4a") ||
      audio[0] ||
      null,
  };
}

export async function snapyt(youtubeUrl) {
  if (!youtubeUrl || typeof youtubeUrl !== "string") {
    throw new Error("URL YouTube wajib diisi");
  }

  const nonce = await getNonce();
  const previewUrl = await processUrl(youtubeUrl.trim(), nonce);
  const result = await parsePreview(previewUrl);

  return {
    status: true,
    ...result,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2];
  if (!url) {
    console.log("Usage: node snapyt.js <youtube-url>");
    process.exit(1);
  }

  snapyt(url)
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
    })
    .catch((err) => {
      console.error("Error:", err.message);
      process.exit(1);
    });
      }
