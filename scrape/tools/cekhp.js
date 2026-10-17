import axios from "axios";
import * as cheerio from "cheerio";

const DESKTOP = "https://www.gsmarena.com";
const MOBILE = "https://m.gsmarena.com";

const client = axios.create({
  timeout: 30000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  },
});

async function getHtml(url) {
  const { data, status } = await client.get(url, { validateStatus: () => true });
  if (status === 404) throw new Error(`Not found: ${url}`);
  if (status >= 400) throw new Error(`HTTP ${status}: ${url}`);
  return data;
}

function absUrl(href, base = DESKTOP) {
  if (!href) return null;
  if (href.startsWith("http")) return href;
  return `${base}/${href.replace(/^\//, "")}`;
}

export function parseBrandSlug(input) {
  const s = String(input).trim();
  const m =
    s.match(/([a-z0-9_+-]+-phones-\d+)(?:\.php)?/i) ||
    s.match(/([a-z0-9_+-]+-\d+)(?:\.php)?$/i);
  if (!m) throw new Error("Brand slug tidak valid, contoh: hp-phones-41");
  return m[1].replace(/\.php$/i, "");
}

export function parsePhoneSlug(input) {
  const s = String(input).trim();
  const m = s.match(/([a-z0-9_()+\-]+-\d+)(?:\.php)?/i);
  if (!m) throw new Error("Phone slug tidak valid");
  return m[1].replace(/\.php$/i, "");
}

export async function getBrands() {
  const html = await getHtml(`${DESKTOP}/makers.php3`);
  const $ = cheerio.load(html);
  const brands = [];

  $("table td a[href*='-phones-']").each((_, el) => {
    const href = $(el).attr("href") || "";
    const name = $(el).clone().children().remove().end().text().trim() \vert{}\vert{}$(el).text().replace(/\d+\s*devices?/i, "").trim();
    const countText = $(el).find("span").text() \vert{}\vert{} $(el).text();
    const count = Number((countText.match(/(\d+)/) || [])[1]) || null;
    const slug = href.replace(/\.php$/i, "");
    if (!slug.includes("-phones-")) return;
    brands.push({
      name: name || slug.split("-phones-")[0],
      slug,
      brandId: Number(slug.split("-").pop()) || null,
      deviceCount: count,
      url: absUrl(href.endsWith(".php") ? href : `${href}.php`),
    });
  });

  const seen = new Set();
  return brands.filter((b) => {
    if (seen.has(b.slug)) return false;
    seen.add(b.slug);
    return true;
  });
}

export async function getBrandPhones(brandSlugOrUrl, opts = {}) {
  const slug = parseBrandSlug(brandSlugOrUrl);
  const page = opts.page ?? 1;
  const base = opts.source === "desktop" ? DESKTOP : MOBILE;

  let path =
    page <= 1
      ? `${slug}.php`
      : `${slug.replace(/-phones-(\d+)$/, "-phones-f-$1-0-p" + page)}.php`;

  if (page > 1) {
    const id = slug.match(/-(\d+)$/)?.[1];
    const name = slug.replace(/-phones-\d+$/, "");
    path = `${name}-phones-f-${id}-0-p${page}.php`;
  }

  const url = `${base}/${path}`;
  let html;
  try {
    html = await getHtml(url);
  } catch (e) {
    if (page > 1) {
      html = await getHtml(`${base}/${slug}.php`);
    } else throw e;
  }

  const $ = cheerio.load(html);
  const title =
    $("h1").first().text().trim() ||
    $("title").text().replace(/\s*-\s*GSMArena.*$/i, "").trim() ||
    slug;

  const phones = [];
  const seen = new Set();

  const selectors = [
    "ul.general-menu li a[href$='.php']",
    "#review-body li a[href$='.php']",
    ".makers ul li a[href$='.php']",
    "div.makers li a[href$='.php']",
  ];

  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const href = ($(el).attr("href") || "").split("?")[0];
      if (!href || href.includes("-phones-") || href.includes("makers")) return;
      if (!/-\d+\.php$/i.test(href)) return;

      const phoneSlug = href.replace(/^\//, "").replace(/\.php$/i, "");
      if (seen.has(phoneSlug)) return;
      seen.add(phoneSlug);

      const name =
        $(el).find("strong").text().trim() ||
        $(el).find("span").text().trim() ||
        $(el).text().trim();
      const img =
        $(el).find("img").attr("src") ||
        $(el).find("img").attr("data-src") ||
        null;

      const idMatch = phoneSlug.match(/-(\d+)$/);
      phones.push({
        id: idMatch ? Number(idMatch[1]) : null,
        name: name || phoneSlug,
        slug: phoneSlug,
        url: absUrl(href.endsWith(".php") ? href : `${href}.php`),
        image: img,
      });
    });
    if (phones.length) break;
  }

  const nextHref =
    $("a.pages-next, a[title='Next page'], .nav-pages a")
      .filter((_, el) => /next|›|»/i.test($(el).text()) \vert{}\vert{}$(el).hasClass("pages-next"))
      .first()
      .attr("href") || null;

  return {
    status: true,
    brand: {
      slug,
      name: title.replace(/\s*phones\s*$/i, "").trim() || slug.split("-")[0],
      title,
      url: absUrl(`${slug}.php`),
    },
    page,
    count: phones.length,
    phones,
    nextPage: nextHref ? absUrl(nextHref, base) : null,
  };
}

export async function getPhoneSpecs(phoneSlugOrUrl) {
  const slug = parsePhoneSlug(phoneSlugOrUrl);
  const url = `${DESKTOP}/${slug}.php`;
  const html = await getHtml(url);
  const $ = cheerio.load(html);

  const name =
    $('h1[data-spec="modelname"]').text().trim() ||
    $("h1").first().text().trim() ||
    $("title").text().split("-")[0].trim();

  const image =
    $(".specs-photo-main img").attr("src") ||
    $("div.specs-photo-main img").attr("src") ||
    null;

  const quick = {};
  $("ul#specs-brief li, .specs-brief li").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t) quick[t] = true;
  });

  $("[data-spec]").each((_, el) => {
    const key = $(el).attr("data-spec");
    if (!key || key === "modelname") return;
    const val = $(el).text().replace(/\s+/g, " ").trim();
    if (val) quick[key] = val;
  });

  const specs = {};
  $("#specs-list table, .specs-list table").each((_, table) => {
    let category = $(table).find("th").first().text().trim() || "General";
    if (!specs[category]) specs[category] = {};
    $(table)
      .find("tr")
      .each((__, tr) => {
        const ttl = $(tr).find("td.ttl").text().replace(/\s+/g, " ").trim();
        const nfo = $(tr).find("td.nfo").text().replace(/\s+/g, " ").trim();
        if (ttl && nfo) specs[category][ttl] = nfo;
      });
  });

  return {
    status: true,
    id: Number(slug.match(/-(\d+)$/)?.[1]) || null,
    name,
    slug,
    url,
    image,
    quick,
    specs,
  };
}

export async function getHpPhones(opts = {}) {
  return getBrandPhones("hp-phones-41", opts);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] || "brand";
  const arg = process.argv[3] || "hp-phones-41";

  (async () => {
    if (cmd === "brands") {
      console.log(JSON.stringify(await getBrands(), null, 2));
    } else if (cmd === "phone" || cmd === "specs") {
      console.log(JSON.stringify(await getPhoneSpecs(arg), null, 2));
    } else {
      console.log(JSON.stringify(await getBrandPhones(arg), null, 2));
    }
  })().catch((e) => {
    console.error("Error:", e.message);
    process.exit(1);
  });
          }
