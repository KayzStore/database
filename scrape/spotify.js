import axios from "axios";

const BASE = "https://spotdown.org";

const client = axios.create({
  baseURL: BASE,
  timeout: 60000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    Origin: BASE,
    Referer: `${BASE}/en2`,
  },
});

let sessionToken = null;

export async function issueNonce(cfToken) {
  if (!cfToken) throw new Error("cfToken (Turnstile) wajib diisi");

  const { data } = await client.post(
    "/apinew/issue-nonce",
    { cfToken },
    { headers: { "Content-Type": "application/json" } }
  );

  if (!data?.token) {
    throw new Error(data?.message || "Gagal mendapatkan session token");
  }

  sessionToken = data.token;
  return data.token;
}

export async function songDetails(spotifyUrl, token = sessionToken) {
  if (!token) throw new Error("Belum ada X-Session-Token. Panggil issueNonce() dulu.");

  const { data } = await client.get("/apinew/song-details", {
    params: { url: spotifyUrl },
    headers: { "X-Session-Token": token },
  });

  if (data?.success === false) {
    throw new Error(data.message || "Gagal mengambil detail lagu");
  }

  return data;
}

export async function downloadTrack(trackUrl, token = sessionToken) {
  if (!token) throw new Error("Belum ada X-Session-Token. Panggil issueNonce() dulu.");

  const { data } = await client.post(
    "/apinew/download",
    { url: trackUrl },
    {
      headers: {
        "Content-Type": "application/json",
        "X-Session-Token": token,
      },
    }
  );

  if (!data?.downloadUrl) {
    throw new Error(data?.message || "Download gagal / tidak ada downloadUrl");
  }

  return {
    downloadUrl: data.downloadUrl,
    raw: data,
  };
}

export async function spotdown(spotifyUrl, opts = {}) {
  if (!spotifyUrl) throw new Error("URL Spotify wajib diisi");
  if (!opts.cfToken && !sessionToken) {
    throw new Error(
      "Butuh opts.cfToken (Cloudflare Turnstile). Tanpa itu API menolak request."
    );
  }

  if (opts.cfToken) {
    await issueNonce(opts.cfToken);
  }

  const details = await songDetails(spotifyUrl);
  const songs = Array.isArray(details.songs) ? details.songs : [];

  const result = {
    status: true,
    contentType: details.contentType || null,
    isValidSpotifyUrl: details.isValidSpotifyUrl ?? true,
    songs: songs.map((s) => ({
      title: s.title || s.name || null,
      artist: s.artist || s.artists || null,
      album: s.album || null,
      duration: s.duration || null,
      cover: s.cover || s.image || s.thumbnail || null,
      url: s.url || s.spotifyUrl || s.link || null,
      id: s.id || null,
    })),
    downloads: [],
  };

  if (opts.downloadAll) {
    for (const song of result.songs) {
      const target = song.url || song.id;
      if (!target) continue;
      try {
        const dl = await downloadTrack(target);
        result.downloads.push({
          ...song,
          mp3: dl.downloadUrl,
        });
      } catch (err) {
        result.downloads.push({
          ...song,
          mp3: null,
          error: err.message,
        });
      }
    }
  } else if (result.songs.length === 1) {
    const song = result.songs[0];
    const target = song.url || song.id || spotifyUrl;
    const dl = await downloadTrack(target);
    result.mp3 = dl.downloadUrl;
    result.downloads.push({ ...song, mp3: dl.downloadUrl });
  }

  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2];
  const cf = process.argv[3];
  if (!url) {
    console.log("Usage: node spotdown.js <spotify-url> <cf-turnstile-token>");
    process.exit(1);
  }
  spotdown(url, { cfToken: cf, downloadAll: true })
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error("Error:", e.message);
      process.exit(1);
    });
}
