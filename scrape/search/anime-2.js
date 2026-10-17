import axios from "axios";
import * as cheerio from "cheerio";

const BASE = "https://myanimelist.net";

const client = axios.create({
  timeout: 30000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: `${BASE}/`,
  },
});

export function parseStackId(input) {
  if (typeof input === "number") return input;
  const s = String(input).trim();
  const m = s.match(/\/stacks\/(\d+)/) || s.match(/^(\d+)$/);
  if (!m) throw new Error("Stack id / URL tidak valid");
  return Number(m[1]);
}

export async function getStack(stackIdOrUrl) {
  const id = parseStackId(stackIdOrUrl);
  const url = `${BASE}/stacks/${id}`;

  const { data: html, status } = await client.get(url, {
    validateStatus: () => true,
  });

  if (status === 404) throw new Error(`Stack ${id} tidak ditemukan`);
  if (status >= 400) throw new Error(`HTTP ${status} dari MAL`);

  const $ = cheerio.load(html);

  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("h1 .h1-title, h1").first().text().replace(/Interest Stacks/i, "").trim() ||
    null;

  const ogDesc = $('meta[property="og:description"]').attr("content") || "";
  const metaDesc = $('meta[name="description"]').attr("content") || "";

  let entriesCount = null;
  let restacks = null;
  const counts = ogDesc.match(/(\d+)\s*Entries?.*?(\d+)\s*Restacks?/i);
  if (counts) {
    entriesCount = Number(counts[1]);
    restacks = Number(counts[2]);
  }

  let description =
    metaDesc.replace(/&#039;/g, "'").replace(/&amp;/g, "&") || null;

  const authorLink = $('a[href*="/profile/"]').filter((_, el) => {
    const href = $(el).attr("href") || "";
    return /\/profile\/[^/]+\/?$/.test(href) &&$(el).text().trim().length > 0;
  }).first();
  const author =
    authorLink.text().trim() ||
    ($('a[href*="/profile/"]').first().attr("href") || "").split("/profile/")[1]?.split("/")[0] ||
      null;
  const authorUrl = author ? `${BASE}/profile/${author}` : null;

  const dateText =
    $(".content-left .di-ib, .content-left .fn-grey2, .content-left")
      .text()
      .match(
        /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}[^\n]*/i
      )?.[0]
      ?.trim() || null;

  const mediaType =
    $(".content-left .media-type, .content-left span")
      .filter((_, el) => /^(Anime|Manga)$/i.test($(el).text().trim()))
      .first()
      .text()
      .trim() || "Anime";

  const entries = [];
  const seen = new Set();

  $(".tile-anime-list .seasonal-anime, .tile-anime-list [class*='seasonal-anime']").each(
    (_, el) => {
      const $el =$(el);
      const link =
        $el.find('a[href*="/anime/"]').first().attr("href") ||
        $el.find('a[href*="/manga/"]').first().attr("href") ||
        "";
      const idMatch = link.match(/\/(anime|manga)\/(\d+)/);
      if (!idMatch) return;

      const type = idMatch[1];
      const malId = Number(idMatch[2]);
      if (seen.has(`${type}:${malId}`)) return;
      seen.add(`${type}:${malId}`);

      const titleText =
        $el.find(".title a, .title").first().text().trim() ||
        $el.find("img").attr("alt")?.trim() ||
        null;

      const category = $el.find(".category").text().trim();
      let format = null;
      let year = null;
      if (category) {
        const parts = category.split(",").map((s) => s.trim());
        format = parts[0] || null;
        const y = parts.find((p) => /^\d{4}$/.test(p));
        year = y ? Number(y) : null;
      }

      const scoreRaw =
        $el.find(".js-score").text().trim() ||
        $el.find(".stars").text().replace(/[^\d.]/g, "").trim();
      const membersRaw =
        $el.find(".js-members").text().trim() ||
        $el.find(".users").text().replace(/[^\d]/g, "").trim();

      const img =
        $el.find("img").attr("data-src") ||
        $el.find("img").attr("src") ||
        null;

      const genres = ($el.attr("data-genre") || "")
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean)
        .map(Number);

      const startDate = $el.find(".js-start_date").text().trim() || null;

      entries.push({
        malId,
        type,
        title: titleText,
        url: link.startsWith("http") ? link : `${BASE}${link}`,
        image: img?.replace(/\/r\/\d+x\d+\//, "/") || img,
        format,
        year,
        category,
        score: scoreRaw ? Number(scoreRaw) : null,
        members: membersRaw ? Number(membersRaw) : null,
        genreIds: genres,
        startDate,
      });
    }
  );

  if (!entries.length) {
    $('a[href*="/anime/"]').each((_, el) => {
      const href = $(el).attr("href") || "";
      const m = href.match(/\/anime\/(\d+)/);
      if (!m) return;
      const malId = Number(m[1]);
      if (seen.has(`anime:${malId}`)) return;
      seen.add(`anime:${malId}`);
      const t = $(el).text().trim() \vert{}\vert{}$(el).find("img").attr("alt") || null;
      if (!t) return;
      entries.push({
        malId,
        type: "anime",
        title: t,
        url: href.startsWith("http") ? href : `${BASE}${href}`,
        image: null,
        format: null,
        year: null,
        category: null,
        score: null,
        members: null,
        genreIds: [],
        startDate: null,
      });
    });
  }

  return {
    status: true,
    id,
    url,
    title,
    description,
    mediaType,
    author,
    authorUrl,
    date: dateText,
    entriesCount: entriesCount ?? entries.length,
    restacks,
    entries,
  };
}

export async function getAnimeJikan(malId) {
  const { data, status } = await axios.get(
    `https://api.jikan.moe/v4/anime/${malId}/full`,
    { timeout: 20000, validateStatus: () => true }
  );
  if (status === 429) throw new Error("Jikan rate limit — tunggu ~1s");
  if (status >= 400) throw new Error(data?.message || `Jikan HTTP ${status}`);
  return data.data;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2] || "26276";
  getStack(arg)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error("Error:", e.message);
      process.exit(1);
    });
                                 }
