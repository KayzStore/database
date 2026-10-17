import axios from "axios";
import * as cheerio from "cheerio";

const BASE = "https://ssstwitter.com";

const client = axios.create({
  timeout: 45000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
    Origin: BASE,
    Referer: `${BASE}/id`,
  },
});

export async function getTokens(locale = "id") {
  const { data: html } = await client.get(`${BASE}/${locale}`);
  const $ = cheerio.load(html);

  const includeVals =
    $("form[include-vals]").attr("include-vals") ||
    $("form[data-include-vals]").attr("data-include-vals") ||
    "";

  const ttMatch = includeVals.match(/tt:'([a-f0-9]+)'/i);
  const tsMatch = includeVals.match(/ts:(\d+)/);

  const tt =
    ttMatch?.[1] ||
    html.match(/tt:'([a-f0-9]+)'/i)?.[1] ||
    null;
  const ts =
    tsMatch?.[1] ||
    html.match(/ts:(\d+)/)?.[1] ||
    String(Math.floor(Date.now() / 1000));

  if (!tt) throw new Error("Gagal mengambil token tt dari ssstwitter.com");

  return { tt, ts, locale };
}

function parseResult(html) {
  const $ = cheerio.load(html);
  const result = $("#result");

  if (!result.length) {
    throw new Error("Elemen #result tidak ditemukan");
  }

  const text = result.text().replace(/\s+/g, " ").trim();

  if (
    /doesn't have a video|not able to serve|Try later|check your link|tidak memiliki video/i.test(
      text
    )
  ) {
    throw new Error(
      text.slice(0, 180) || "Tweet tidak punya video / server gagal memproses"
    );
  }

  const videos = [];

  result.find("a.download-btn, a[data-directurl]").each((_, el) => {
    const $el =$(el);
    const url =
      $el.attr("data-directurl") ||
      $el.attr("href") ||
      null;
    if (!url || url.startsWith("#") || url.startsWith("/")) return;

    const label = $el.text().replace(/\s+/g, " ").trim() || null;
    let quality = null;
    const m = label?.match(/(\d{3,4}\s*p|HD|SD|high|medium|low)/i);
    if (m) quality = m[1].replace(/\s+/g, "").toLowerCase();
    if ($el.hasClass("quality-best")) quality = quality || "best";

    videos.push({
      url,
      quality,
      label,
    });
  });

  if (!videos.length) {
    result.find("a[href*='twimg'], a[href*='video']").each((_, el) => {
      const href = $(el).attr("href");
      if (href && /^https?:\/\//i.test(href)) {
        videos.push({
          url: href,
          quality: null,
          label: $(el).text().trim() || null,
        });
      }
    });
  }

  const title =
    result.find("h2, h3, .result-title, .tweet-title").first().text().trim() ||
    null;
  const thumb =
    result.find("img").first().attr("src") ||
    result.find("video").attr("poster") ||
    null;

  if (!videos.length) {
    throw new Error(
      "Tidak ada link download. Tweet mungkin tanpa video, private, atau token kadaluarsa."
    );
  }

  videos.sort((a, b) => {
    const score = (v) => {
      if (!v.quality) return 0;
      if (/best|hd|1080|720/i.test(v.quality)) return 100;
      const n = parseInt(v.quality, 10);
      return Number.isFinite(n) ? n : 1;
    };
    return score(b) - score(a);
  });

  return { title, thumbnail: thumb, videos };
}

export async function ssstwitter(tweetUrl, opts = {}) {
  if (!tweetUrl || typeof tweetUrl !== "string") {
    throw new Error("URL tweet wajib diisi");
  }
  if (!/twitter\.com|x\.com/i.test(tweetUrl)) {
    throw new Error("URL harus dari twitter.com atau x.com");
  }

  const locale = opts.locale || "id";
  const { tt, ts } = await getTokens(locale);

  const body = new URLSearchParams({
    id: tweetUrl.trim(),
    locale,
    tt,
    ts,
    source: "form",
  });

  const { data: html, status } = await client.post(
    `${BASE}/${locale}`,
    body.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "HX-Request": "true",
        "HX-Target": "target",
        "HX-Current-URL": `${BASE}/${locale}`,
        Referer: `${BASE}/${locale}`,
      },
    }
  );

  if (status >= 400) {
    throw new Error(`HTTP ${status} dari ssstwitter.com`);
  }

  const parsed = parseResult(html);

  return {
    status: true,
    title: parsed.title,
    thumbnail: parsed.thumbnail,
    videos: parsed.videos,
    mp4: parsed.videos[0]?.url || null,
    hd: parsed.videos.find((v) => /hd|720|1080|best/i.test(v.quality || ""))?.url
      || parsed.videos[0]?.url
      || null,
    sd: parsed.videos.find((v) => /sd|360|270|low/i.test(v.quality || ""))?.url
      || null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2];
  if (!url) {
    console.log("Usage: node ssstwitter.js <tweet-url>");
    process.exit(1);
  }
  ssstwitter(url)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error("Error:", e.message);
      process.exit(1);
    });
}
