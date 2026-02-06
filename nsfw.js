/*!-======[ Module Imports ]======-!*/
const fs = "fs".import()
const { default: ms } = await "ms".import()

/*!-======[ Default Export Function ]======-!*/
export default async function on({ cht, Exp, store, ev, is }) {
    const { id, sender } = cht

/*!-======[ Helper Function ]======-!*/
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function fetchJson(url) {
  const response = await fetch(url);
  return await response.json();
}

/*!-======[ Fitur NSFW Image ]======-!*/
const animeCommands = {
  'ahegao': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/ahegao.json',
  'ass': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/ass.json',
  'bdsm': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/bdsm.json',
  'blowjob': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/blowjob.json',
  'cuckold': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/cuckold.json',
  'cum': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/cum.json',
  'eba': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/eba.json',
  'ero': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/ero.json',
  'femdom': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/femdom.json',
  'foot': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/foot.json',
  'gangbang': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/gangbang.json',
  'gifs': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/gifs.json',
  'glasses': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/glasses.json',
  'hentai': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/hentai.json',
  'jahy': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/jahy.json',
  'manga': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/manga.json',
  'manstrubation': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/manstrubation.json',
  'milf': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/milf.json',
  'orgy': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/orgy.json',
  'panties': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/panties.json',
  'pussy': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/pussy.json',
  'tentacles': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/tentacles.json',
  'thighs': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/thighs.json',
  'yuri': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/yuri.json',
  'zettai': 'https://raw.githubusercontent.com/KazukoGans/database/main/nsfw/zettai.json'
};

// Register semua command anime
Object.keys(animeCommands).forEach(command => {
  ev.on({
    cmd: [command],
    listmenu: [command],
    tag: 'nsfw',
    energy: 5,
  }, async ({ cht }) => {
    try {
      const link = animeCommands[command];
      const animek = await fetchJson(link);
      const dl_url = pickRandom(animek);

      await Exp.sendMessage(cht.id, {
        image: { url: dl_url },
        caption: `*Random nsfw ${command}*`,
        contextInfo: {
          externalAdReply: {
            title: `Menampilkan *${command.toUpperCase()}*`,
            body: 'ᴾᵒʷᵉʳᵉᵈ ᴮʸ ʸᵃᵉ ᵐⁱᵏᵒ ᴬᴵ ⁻ ᴹᴰ',
            thumbnail: fs.readFileSync(fol[3] + 'bell.jpg'),
            mediaType: 1,
            showAdAttribution: false,
          }
        }
      }, { quoted: cht });
    } catch (e) {
      console.error(`Gagal mengambil gambar ${command}:`, e);
      cht.reply(`Gagal mengambil gambar ${command}. Cek koneksi atau API.`);
    }
  });
});
}