import axios from "axios";

const ENDPOINT = "https://graphql.anilist.co";

const client = axios.create({
  baseURL: ENDPOINT,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent":
      "Mozilla/5.0 (compatible; AniListClient/1.0; +https://anilist.co)",
  },
});

const SEARCH_ANIME_QUERY = `
query (
  $search: String
  $page: Int = 1
  $perPage: Int = 20
  $sort: [MediaSort] = [POPULARITY_DESC, SCORE_DESC]
  $format: MediaFormat
  $status: MediaStatus
  $season: MediaSeason
  $seasonYear: Int
  $genre: String
  $genres: [String]
  $isAdult: Boolean
) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      total
      currentPage
      lastPage
      hasNextPage
      perPage
    }
    media(
      search: $search
      type: ANIME
      sort: $sort
      format: $format
      status: $status
      season: $season
      seasonYear: $seasonYear
      genre: $genre
      genre_in: $genres
      isAdult: $isAdult
    ) {
      id
      idMal
      title {
        romaji
        english
        native
        userPreferred
      }
      coverImage {
        large
        medium
        color
      }
      bannerImage
      description(asHtml: false)
      format
      status
      episodes
      duration
      season
      seasonYear
      averageScore
      meanScore
      popularity
      favourites
      genres
      studios(isMain: true) {
        nodes {
          id
          name
        }
      }
      siteUrl
      isAdult
      startDate { year month day }
      endDate { year month day }
    }
  }
}
`;

const MEDIA_BY_ID_QUERY = `
query ($id: Int!) {
  Media(id: $id, type: ANIME) {
    id
    idMal
    title { romaji english native userPreferred }
    coverImage { large medium color }
    bannerImage
    description(asHtml: false)
    format
    status
    episodes
    duration
    season
    seasonYear
    averageScore
    meanScore
    popularity
    favourites
    genres
    tags { name rank isMediaSpoiler }
    studios { nodes { id name isAnimationStudio } }
    relations {
      edges {
        relationType
        node {
          id
          type
          title { userPreferred }
          format
          siteUrl
        }
      }
    }
    characters(perPage: 10, sort: [ROLE, RELEVANCE, ID]) {
      edges {
        role
        node {
          id
          name { full native }
          image { large }
        }
      }
    }
    siteUrl
    trailer { id site thumbnail }
    isAdult
  }
}
`;

const TRENDING_QUERY = `
query ($page: Int = 1, $perPage: Int = 20) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage hasNextPage }
    media(type: ANIME, sort: TRENDING_DESC) {
      id
      title { romaji english userPreferred }
      coverImage { large medium }
      format
      status
      episodes
      averageScore
      genres
      seasonYear
      siteUrl
    }
  }
}
`;

export async function anilistQuery(query, variables = {}) {
  const { data, status } = await client.post(
    "",
    { query, variables },
    { validateStatus: () => true }
  );

  if (status === 429) {
    throw new Error("Rate limited oleh AniList. Coba lagi nanti.");
  }
  if (status >= 400) {
    throw new Error(
      data?.errors?.[0]?.message || `HTTP ${status} dari graphql.anilist.co`
    );
  }
  if (data?.errors?.length) {
    throw new Error(data.errors.map((e) => e.message).join("; "));
  }

  return data.data;
}

export async function searchAnime(search, opts = {}) {
  const variables = {
    search: search || undefined,
    page: opts.page ?? 1,
    perPage: Math.min(opts.perPage ?? 20, 50),
    sort: opts.sort
      ? Array.isArray(opts.sort)
        ? opts.sort
        : [opts.sort]
      : ["POPULARITY_DESC", "SCORE_DESC"],
    format: opts.format || undefined,
    status: opts.status || undefined,
    season: opts.season || undefined,
    seasonYear: opts.seasonYear || undefined,
    genre: opts.genre || undefined,
    genres: opts.genres || undefined,
    isAdult: opts.isAdult ?? false,
  };

  const data = await anilistQuery(SEARCH_ANIME_QUERY, variables);
  const page = data.Page;

  const results = (page.media || []).map((m) => ({
    id: m.id,
    idMal: m.idMal,
    title: m.title?.userPreferred || m.title?.romaji || m.title?.english,
    titles: m.title,
    cover: m.coverImage?.large || m.coverImage?.medium,
    coverColor: m.coverImage?.color,
    banner: m.bannerImage,
    description: m.description,
    format: m.format,
    status: m.status,
    episodes: m.episodes,
    duration: m.duration,
    season: m.season,
    seasonYear: m.seasonYear,
    score: m.averageScore,
    meanScore: m.meanScore,
    popularity: m.popularity,
    favourites: m.favourites,
    genres: m.genres || [],
    studios: (m.studios?.nodes || []).map((s) => s.name),
    siteUrl: m.siteUrl || `https://anilist.co/anime/${m.id}`,
    isAdult: m.isAdult,
    startDate: m.startDate,
    endDate: m.endDate,
  }));

  return {
    status: true,
    pageInfo: page.pageInfo,
    results,
    first: results[0] || null,
  };
}

export async function getAnimeById(id) {
  const data = await anilistQuery(MEDIA_BY_ID_QUERY, { id: Number(id) });
  const m = data.Media;
  if (!m) throw new Error(`Anime id ${id} tidak ditemukan`);

  return {
    status: true,
    id: m.id,
    idMal: m.idMal,
    title: m.title?.userPreferred || m.title?.romaji,
    titles: m.title,
    cover: m.coverImage?.large,
    banner: m.bannerImage,
    description: m.description,
    format: m.format,
    status: m.status,
    episodes: m.episodes,
    duration: m.duration,
    season: m.season,
    seasonYear: m.seasonYear,
    score: m.averageScore,
    genres: m.genres || [],
    tags: (m.tags || []).filter((t) => !t.isMediaSpoiler).map((t) => t.name),
    studios: (m.studios?.nodes || []).map((s) => s.name),
    relations: (m.relations?.edges || []).map((e) => ({
      type: e.relationType,
      id: e.node?.id,
      title: e.node?.title?.userPreferred,
      format: e.node?.format,
      mediaType: e.node?.type,
      siteUrl: e.node?.siteUrl,
    })),
    characters: (m.characters?.edges || []).map((e) => ({
      role: e.role,
      id: e.node?.id,
      name: e.node?.name?.full,
      image: e.node?.image?.large,
    })),
    trailer: m.trailer,
    siteUrl: m.siteUrl,
    isAdult: m.isAdult,
    raw: m,
  };
}

export async function trendingAnime(opts = {}) {
  const data = await anilistQuery(TRENDING_QUERY, {
    page: opts.page ?? 1,
    perPage: Math.min(opts.perPage ?? 20, 50),
  });
  const page = data.Page;
  return {
    status: true,
    pageInfo: page.pageInfo,
    results: (page.media || []).map((m) => ({
      id: m.id,
      title: m.title?.userPreferred || m.title?.romaji,
      titles: m.title,
      cover: m.coverImage?.large || m.coverImage?.medium,
      format: m.format,
      status: m.status,
      episodes: m.episodes,
      score: m.averageScore,
      genres: m.genres || [],
      seasonYear: m.seasonYear,
      siteUrl: m.siteUrl,
    })),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] || "search";
  const arg = process.argv[3];

  (async () => {
    if (cmd === "trending") {
      console.log(JSON.stringify(await trendingAnime(), null, 2));
    } else if (cmd === "id" && arg) {
      console.log(JSON.stringify(await getAnimeById(arg), null, 2));
    } else if (arg) {
      console.log(JSON.stringify(await searchAnime(arg), null, 2));
    } else {
      console.log(`Usage:
  node anilist.js search <query>
  node anilist.js trending
  node anilist.js id <anilist-id>`);
      process.exit(1);
    }
  })().catch((e) => {
    console.error("Error:", e.message);
    process.exit(1);
  });
}
