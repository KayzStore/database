import axios from "axios";
import { pathToFileURL } from "url";
import path from "path";

export function createWiki(opts = {}) {
  const lang = opts.lang || "id";
  const base = `https://${lang}.wikipedia.org`;
  const ua =
    opts.userAgent ||
    "WikiClient/1.0 (Node.js educational; contact: local-dev)";

  const http = axios.create({
    timeout: 30000,
    headers: {
      "User-Agent": ua,
      Accept: "application/json",
    },
  });

  async function api(params) {
    const { data } = await http.get(`${base}/w/api.php`, {
      params: {
        format: "json",
        formatversion: 2,
        ...params,
      },
    });
    if (data?.error) {
      throw new Error(data.error.info || data.error.code || "API error");
    }
    return data;
  }

  async function search(query, limit = 10) {
    const data = await api({
      action: "query",
      list: "search",
      srsearch: query,
      srlimit: limit,
      srprop: "snippet|titlesnippet|size|wordcount|timestamp",
    });
    const items = data?.query?.search ?? [];
    return {
      status: true,
      lang,
      query,
      totalhits: data?.query?.searchinfo?.totalhits ?? items.length,
      results: items.map((r) => ({
        title: r.title,
        pageid: r.pageid,
        snippet: stripHtml(r.snippet || ""),
        size: r.size,
        wordcount: r.wordcount,
        url: `${base}/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
      })),
    };
  }

  async function openSearch(query, limit = 10) {
    const data = await api({
      action: "opensearch",
      search: query,
      limit,
      namespace: 0,
    });
    const titles = data[1] || [];
    const descs = data[2] || [];
    const urls = data[3] || [];
    return {
      status: true,
      lang,
      query,
      results: titles.map((t, i) => ({
        title: t,
        description: descs[i],
        url: urls[i],
      })),
    };
  }

  async function summary(title) {
    try {
      const { data } = await http.get(
        `${base}/api/rest_v1/page/summary/${encodeURIComponent(title)}`
      );
      return {
        status: true,
        lang,
        title: data.title,
        pageid: data.pageid,
        description: data.description ?? null,
        extract: data.extract ?? null,
        thumbnail: data.thumbnail?.source ?? data.originalimage?.source ?? null,
        url: data.content_urls?.desktop?.page ?? `${base}/wiki/${encodeURIComponent(title)}`,
        langlinks: null,
        source: "rest",
      };
    } catch {
      const data = await api({
        action: "query",
        prop: "extracts|pageimages|info",
        exintro: true,
        explaintext: true,
        piprop: "thumbnail",
        pithumbsize: 400,
        inprop: "url",
        titles: title,
        redirects: true,
      });
      const page = data?.query?.pages?.[0];
      if (!page || page.missing) {
        return { status: false, error: "Halaman tidak ditemukan", title };
      }
      return {
        status: true,
        lang,
        title: page.title,
        pageid: page.pageid,
        description: null,
        extract: page.extract ?? null,
        thumbnail: page.thumbnail?.source ?? null,
        url: page.fullurl || `${base}/wiki/${encodeURIComponent(page.title)}`,
        source: "action",
      };
    }
  }

  async function page(title, { introOnly = false } = {}) {
    const data = await api({
      action: "query",
      prop: "extracts|info",
      explaintext: true,
      ...(introOnly ? { exintro: true } : {}),
      inprop: "url",
      titles: title,
      redirects: true,
    });
    const p = data?.query?.pages?.[0];
    if (!p || p.missing) {
      return { status: false, error: "Halaman tidak ditemukan", title };
    }
    return {
      status: true,
      lang,
      title: p.title,
      pageid: p.pageid,
      extract: p.extract ?? "",
      url: p.fullurl || `${base}/wiki/${encodeURIComponent(p.title)}`,
    };
  }

  async function random() {
    const data = await api({
      action: "query",
      list: "random",
      rnnamespace: 0,
      rnlimit: 1,
    });
    const r = data?.query?.random?.[0];
    if (!r) return { status: false, error: "Gagal random" };
    return summary(r.title);
  }

  return { search, openSearch, summary, page, random, lang, base };
}

function stripHtml(s) {
  return String(s)
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  const q = rest.join(" ");
  const wiki = createWiki({ lang: process.env.WIKI_LANG || "id" });

  (async () => {
    let out;
    switch (cmd) {
      case "search":
        if (!q) throw new Error("query kosong");
        out = await wiki.search(q);
        break;
      case "opensearch":
        out = await wiki.openSearch(q);
        break;
      case "summary":
        out = await wiki.summary(q);
        break;
      case "page":
        out = await wiki.page(q);
        break;
      case "random":
        out = await wiki.random();
        break;
      default:
        console.log(`Usage:
  node wikipedia.js search <query>
  node wikipedia.js summary <title>
  node wikipedia.js page <title>
  node wikipedia.js random

Env: WIKI_LANG=id|en|...
`);
        process.exit(1);
    }
    console.log(JSON.stringify(out, null, 2));
  })().catch((e) => {
    console.error("Error:", e.message);
    process.exit(1);
  });
}
