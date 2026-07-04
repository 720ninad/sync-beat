import CryptoJS from "crypto-js";
import { redis } from "./redis";

// JioSaavn's internal API returns media URLs encrypted with DES-ECB using this
// well-known key. We decrypt them locally to get direct, playable CDN URLs.
const DES_KEY = "38346591";
const SEARCH_TTL = 1800; // 30 minutes
const JIOSAAVN_SEARCH_URL = "https://www.jiosaavn.com/api.php";

export interface JioSaavnTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // seconds
  image: string;
  url: string | null; // direct playable / downloadable CDN URL
}

// Decode HTML entities (JioSaavn double-encodes some titles, so run two passes)
function decodeEntities(input: string): string {
  if (!input) return input;
  let str = input;
  for (let i = 0; i < 2; i++) {
    str = str
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }
  return str;
}

// DES-ECB decrypt the encrypted_media_url into a plain CDN URL
function decryptUrl(encrypted: string): string | null {
  try {
    const key = CryptoJS.enc.Utf8.parse(DES_KEY);
    const decrypted = CryptoJS.DES.decrypt(
      {
        ciphertext: CryptoJS.enc.Base64.parse(encrypted),
      } as CryptoJS.lib.CipherParams,
      key,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 },
    );
    const url = decrypted.toString(CryptoJS.enc.Utf8);
    return url || null;
  } catch {
    return null;
  }
}

// Upgrade the decrypted URL (defaults to _96) to the best available bitrate
function bestQualityUrl(encrypted: string, has320: boolean): string | null {
  const base = decryptUrl(encrypted);
  if (!base) return null;
  const quality = has320 ? "_320.mp4" : "_160.mp4";
  return base.replace(/_96\.mp4$/, quality);
}

export async function searchJioSaavn(
  query: string,
  limit = 20,
): Promise<JioSaavnTrack[]> {
  const cacheKey = `jiosaavn:search:${query.toLowerCase().trim()}:${limit}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log("⚡ JioSaavn search cache hit for:", query);
      return JSON.parse(cached);
    }
  } catch {
    // Redis unavailable — continue without cache
  }

  const params = new URLSearchParams({
    __call: "search.getResults",
    q: query,
    _format: "json",
    _marker: "0",
    api_version: "4",
    ctx: "web6dot0",
    n: String(limit),
    p: "1",
  });

  try {
    const res = await fetch(`${JIOSAAVN_SEARCH_URL}?${params.toString()}`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
    });

    const text = await res.text();
    const data = JSON.parse(text);
    const results: any[] = Array.isArray(data?.results) ? data.results : [];

    const tracks: JioSaavnTrack[] = results
      .map((song: any): JioSaavnTrack => {
        const info = song.more_info || {};
        const has320 = info["320kbps"] === "true" || info["320kbps"] === true;
        const url = info.encrypted_media_url
          ? bestQualityUrl(info.encrypted_media_url, has320)
          : null;

        const primaryArtists: string | undefined =
          info?.artistMap?.primary_artists
            ?.map((a: any) => a.name)
            .filter(Boolean)
            .join(", ");

        return {
          id: song.id,
          title: decodeEntities(song.title || "Unknown"),
          artist: decodeEntities(
            primaryArtists || info.music || song.subtitle || "Unknown Artist",
          ),
          album: decodeEntities(info.album || ""),
          duration: parseInt(info.duration, 10) || 0,
          image: (song.image || "").replace("150x150", "500x500"),
          url,
        };
      })
      .filter((t: JioSaavnTrack) => !!t.url);

    try {
      if (tracks.length > 0) {
        await redis.setex(cacheKey, SEARCH_TTL, JSON.stringify(tracks));
        console.log(
          `🔍 Cached ${tracks.length} JioSaavn results for: "${query}"`,
        );
      }
    } catch {
      // ignore cache write failures
    }

    return tracks;
  } catch (error) {
    console.error("JioSaavn search error:", error);
    return [];
  }
}
