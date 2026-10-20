import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import { pathToFileURL } from "url";
import path from "path";

const ANSWERS_ID = ["Ya", "Tidak", "Tidak tahu", "Mungkin", "Mungkin tidak"];

export const Answer = {
  Yes: 0,
  No: 1,
  DontKnow: 2,
  Probably: 3,
  ProbablyNot: 4,
};

export function createAkinator(opts = {}) {
  const region = opts.region || "id";
  const baseURL = `https://${region}.akinator.com`;
  const childMode = !!opts.childMode;
  const theme = opts.theme ?? 1;

  let jar = null;
  let client;

  try {
    jar = new CookieJar();
    client = wrapper(
      axios.create({
        baseURL,
        jar,
        withCredentials: true,
        timeout: 30000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": region === "id" ? "id-ID,id;q=0.9,en;q=0.8" : "en-US,en;q=0.9",
          Origin: baseURL,
          Referer: `${baseURL}/`,
        },
        validateStatus: (s) => s < 500,
      })
    );
  } catch {
    client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        Origin: baseURL,
        Referer: `${baseURL}/`,
      },
      validateStatus: (s) => s < 500,
    });
  }

  const state = {
    session: null,
    signature: null,
    identifiant: null,
    step: 0,
    progression: 0,
    question: null,
    won: false,
    guess: null,
  };

  function form(extra = {}) {
    const data = new URLSearchParams();
    const body = {
      step: state.step,
      progression: state.progression,
      sid: theme,
      cm: childMode ? "true" : "false",
      session: state.session,
      signature: state.signature,
      ...extra,
    };
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined && v !== null) data.set(k, String(v));
    }
    return data;
  }

  function parseStartHtml(html) {
    const text = String(html);
    const session =
      text.match(/localStorage\.setItem\('session',\s*'([^']+)'\)/)?.[1] ||
      text.match(/#session'\)\.val\('([^']+)'\)/)?.[1];
    const signature =
      text.match(/#signature'\)\.val\('([^']+)'\)/)?.[1] ||
      text.match(/localStorage\.setItem\('signature',\s*'([^']+)'\)/)?.[1];
    const identifiant =
      text.match(/localStorage\.setItem\('identifiant',\s*'([^']+)'\)/)?.[1] ||
      text.match(/#identifiant'\)\.val\('([^']+)'\)/)?.[1];
    const question =
      text.match(/id="question-label"[^>]*>([^<]+)/)?.[1] ||
      text.match(/class="question-text"[^>]*>([^<]+)/)?.[1];

    if (!session) {
      if (/just a moment|cf-browser-verification|turnstile/i.test(text)) {
        throw new Error(
          "Cloudflare memblokir request. Pakai package silent-akinator-pro / akinator-client, atau buka di browser dulu."
        );
      }
      throw new Error("Gagal parse session dari /game");
    }

    state.session = session;
    state.signature = signature || null;
    state.identifiant = identifiant || null;
    state.step = 0;
    state.progression = 0;
    state.question = question ? decodeHtml(question.trim()) : null;
    state.won = false;
    state.guess = null;
  }

  function applyAnswerJson(data) {
    if (data.id_proposition || data.name_proposition) {
      state.won = true;
      state.guess = {
        id: data.id_proposition,
        name: data.name_proposition,
        description: data.description_proposition,
        photo: data.photo,
      };
      state.question = data.question || state.question;
      return;
    }
    state.step = parseInt(data.step ?? state.step, 10);
    state.progression = parseFloat(data.progression ?? state.progression);
    state.question = data.question || state.question;
    state.won = false;
    state.guess = null;
  }

  function snapshot() {
    return {
      status: true,
      region,
      question: state.question,
      answers: ANSWERS_ID,
      step: state.step,
      progress: state.progression,
      won: state.won,
      guess: state.guess,
      session: state.session,
    };
  }

  async function start() {
    await client.get("/").catch(() => {});

    const res = await client.post(
      "/game",
      form({
        sid: theme,
        cm: childMode ? "true" : "false",
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        responseType: "text",
        transformResponse: [(d) => d],
      }
    );

    const body = res.data;
    if (typeof body === "object" && body?.question) {
      state.session = body.session;
      state.signature = body.signature;
      state.step = 0;
      state.progression = 0;
      state.question = body.question;
      state.won = false;
      state.guess = null;
    } else {
      parseStartHtml(body);
    }
    return snapshot();
  }

  async function answer(answer) {
    if (!state.session) throw new Error("Game belum start()");
    const a = normalizeAnswer(answer);

    const res = await client.post(
      "/answer",
      form({
        answer: a,
        step_last_proposition: "",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    if (typeof res.data === "string" && /just a moment/i.test(res.data)) {
      throw new Error("Cloudflare memblokir /answer");
    }
    applyAnswerJson(res.data);
    return snapshot();
  }

  async function back() {
    if (!state.session) throw new Error("Game belum start()");
    const res = await client.post("/cancel_answer", form(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    applyAnswerJson(res.data);
    state.won = false;
    state.guess = null;
    return snapshot();
  }

  async function exclude() {
    if (!state.session) throw new Error("Game belum start()");
    const res = await client.post("/exclude", form(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    applyAnswerJson(res.data);
    return snapshot();
  }

  return { start, answer, back, exclude, getState: snapshot, Answer };
}

function normalizeAnswer(a) {
  if (typeof a === "number" && a >= 0 && a <= 4) return a;
  const map = {
    y: 0,
    yes: 0,
    ya: 0,
    n: 1,
    no: 1,
    tidak: 1,
    idk: 2,
    i: 2,
    "tidak tahu": 2,
    p: 3,
    probably: 3,
    mungkin: 3,
    pn: 4,
    "probably not": 4,
    "mungkin tidak": 4,
  };
  const k = String(a).toLowerCase().trim();
  if (k in map) return map[k];
  throw new Error(`Jawaban invalid: ${a}. Pakai 0-4 atau ya/tidak/idk/p/pn`);
}

function decodeHtml(s) {
  return s
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
  import("readline").then(async ({ createInterface }) => {
    const aki = createAkinator({ region: "id", childMode: false });
    try {
      let s = await aki.start();
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q) => new Promise((r) => rl.question(q, r));

      while (!s.won) {
        console.log(`\n[${s.step}] (${s.progress.toFixed?.(1) ?? s.progress}%) ${s.question}`);
        console.log("0=Ya 1=Tidak 2=Tidak tahu 3=Mungkin 4=Mungkin tidak | b=back");
        const inp = (await ask("> ")).trim().toLowerCase();
        if (inp === "b") s = await aki.back();
        else s = await aki.answer(inp);
      }
      console.log("\nTebakan:", s.guess);
      rl.close();
    } catch (e) {
      console.error("Error:", e.message);
      console.error("Saran: npm i silent-akinator-pro  (lebih tahan Cloudflare)");
      process.exit(1);
    }
  });
        }
