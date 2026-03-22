import { exec } from "child_process";
import { redis } from "./redis";

const CACHE_TTL = 3600; // 1 hour

// Render installs yt-dlp via pip into the venv or ~/.local/bin — try known paths
const YTDLP_CMD = [
    'yt-dlp',
    '/opt/render/project/src/.venv/bin/yt-dlp',
    '/home/render/.local/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
].find(cmd => {
    try {
        require('child_process').execSync(`${cmd} --version`, { timeout: 5000, stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}) || 'yt-dlp';

console.log(`🎵 yt-dlp resolved to: ${YTDLP_CMD}`);

export async function getAudioUrl(videoId: string): Promise<string | null> {
    // Check Redis cache first
    const cached = await redis.get(`audio:${videoId}`);
    if (cached) {
        console.log("⚡ Cache hit for:", videoId);
        return cached;
    }

    return new Promise((resolve) => {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const command = `${YTDLP_CMD} -f bestaudio -g "${url}"`;

        exec(command, async (error, stdout, stderr) => {
            if (error) {
                console.error("yt-dlp error:", error);
                return resolve(null);
            }

            if (stderr) {
                console.warn("yt-dlp stderr:", stderr);
            }

            const audioUrl = stdout.trim().split("\n")[0] || null;

            if (audioUrl) {
                // Cache for 1 hour
                await redis.setex(`audio:${videoId}`, CACHE_TTL, audioUrl);
                console.log("🎧 Extracted & cached audio URL for:", videoId);
            }

            resolve(audioUrl);
        });
    });
}

export interface YTSearchResult {
    id: string;
    title: string;
    artist: string;
    duration: number;   // seconds
    thumbnail: string;
}

/**
 * Search YouTube using yt-dlp and return top N results.
 * Uses Redis to cache search results for 30 minutes.
 */
export async function searchYouTube(query: string, limit = 10): Promise<YTSearchResult[]> {
    const cacheKey = `ytsearch:${query.toLowerCase().trim()}:${limit}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
        console.log("⚡ Search cache hit for:", query);
        return JSON.parse(cached);
    }

    return new Promise((resolve) => {
        // yt-dlp ytsearch: returns JSON metadata without downloading
        const command = `${YTDLP_CMD} "ytsearch${limit}:${query}" --dump-json --no-playlist --flat-playlist --no-warnings`;

        exec(command, async (error, stdout) => {
            if (error) {
                console.error("yt-dlp search error:", error);
                return resolve([]);
            }

            const results: YTSearchResult[] = [];

            // yt-dlp outputs one JSON object per line
            for (const line of stdout.trim().split("\n")) {
                if (!line.trim()) continue;
                try {
                    const v = JSON.parse(line);
                    results.push({
                        id: v.id,
                        title: v.title || "Unknown",
                        artist: v.uploader || v.channel || "Unknown Artist",
                        duration: v.duration || 0,
                        thumbnail: v.thumbnail || (v.thumbnails?.[0]?.url ?? ""),
                    });
                } catch {
                    // skip malformed lines
                }
            }

            if (results.length > 0) {
                // Cache search results for 30 minutes
                await redis.setex(cacheKey, 1800, JSON.stringify(results));
                console.log(`🔍 Cached ${results.length} results for: "${query}"`);
            }

            resolve(results);
        });
    });
}
