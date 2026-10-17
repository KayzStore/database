import axios from "axios";

const BASE_URL = "https://snaptik.fi";

export async function snaptik(url) {
  if (!url || typeof url !== "string") {
    throw new Error("URL TikTok wajib diisi");
  }

  try {
    const { data } = await axios.post(
      `${BASE_URL}/api/tiktok`,
      { url },
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json",
          Origin: BASE_URL,
          Referer: `${BASE_URL}/`,
        },
        timeout: 30000,
      }
    );

    if (data.error) {
      throw new Error(data.error);
    }

    return {
      status: true,
      title: data.title || data.description || null,
      description: data.description || null,
      duration: data.duration || null,
      cover: data.cover || null,
      author: data.author
        ? {
            nickname: data.author.nickname,
            uniqueId: data.author.uniqueId,
            avatar: data.author.avatar,
            signature: data.author.signature,
          }
        : null,
      statistics: data.statistics || null,
      video: {
        no_watermark: data.download_link?.no_watermark || null,
        watermark: data.download_link?.watermark || null,
      },
      audio: {
        mp3: data.download_link?.mp3 || data.audio || null,
        original: data.audio || null,
      },
      raw: data,
    };
  } catch (err) {
    if (err.response?.data?.error) {
      throw new Error(err.response.data.error);
    }
    throw new Error(err.message || "Gagal mengambil data dari SnapTik");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const testUrl = process.argv[2];
  if (!testUrl) {
    console.log("Usage: node snaptik.js <tiktok-url>");
    process.exit(1);
  }

  snaptik(testUrl)
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
    })
    .catch((err) => {
      console.error("Error:", err.message);
    });
}
