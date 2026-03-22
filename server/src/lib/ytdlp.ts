import { exec, execSync } from "child_process";
import { redis } from "./redis";
import * as fs from "fs";
import * as path from "path";

const CACHE_TTL = 3600; // 1 hour

// Render's artifact upload strips execute permissions from binaries.
// Re-apply chmod at runtime so the bundled yt-dlp binary is executable.
const BUNDLED_YTDLP = path.join(process.cwd(), 'yt-dlp');
if (fs.existsSync(BUNDLED_YTDLP)) {
    try {
        fs.chmodSync(BUNDLED_YTDLP, 0o755);
        console.log('✅ chmod +x applied to bundled yt-dlp');
    } catch (e) {
        console.warn('⚠️ Could not chmod yt-dlp:', e);
    }
}

const YTDLP_CMD = [
    BUNDLED_YTDLP,
    'yt-dlp',
    '/home/render/.local/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
].find(cmd => {
    try {
        execSync(`${cmd} --version`, { timeout: 5000, stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}) || 'yt-dlp';

console.log(`🎵 yt-dlp resolved to: ${YTDLP_CMD}`);

// Returns --cookies flag if a cookies file is configured via env
function getCookiesArg(): string {
    // Option 1: direct file path
    const cookiesPath = process.env.YTDLP_COOKIES_FILE;
    if (cookiesPath && fs.existsSync(cookiesPath)) {
        return `--cookies "${cookiesPath}"`;
    }
    // Option 2: cookies content in env var — write to temp file once
    const cookiesContent = process.env.YTDLP_COOKIES_CONTENT;
    if (cookiesContent) {
        const tmpPath = path.join('/tmp', 'yt-cookies.txt');
        if (!fs.existsSync(tmpPath)) {
            fs.writeFileSync(tmpPath, cookiesContent, 'utf8');
            console.log('🍪 Wrote YouTube cookies to', tmpPath);
        }
        return `--cookies "${tmpPath}"`;
    }
    return '';
}

export async function getAudioUrl(videoId: string): Promise<string | null> {
    const cached = await redis.get(`audio:${videoId}`);
    if (cached) {
        console.log("⚡ Cache hit for:", videoId);
        return cached;
    }

    return new Promise((resolve) => {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const cookiesArg = getCookiesArg();
        const command = `${YTDLP_CMD} -f bestaudio -g ${cookiesArg} --extractor-args "youtube:player_client=web" "${url}"`;

        exec(command, { timeout: 30000 }, async (error, stdout, stderr) => {
            if (error) {
                console.error("yt-dlp error:", error.killed ? "Process timed out" : error.message);
                return resolve(null);
            }
            if (stderr) console.warn("yt-dlp stderr:", stderr);

            const audioUrl = stdout.trim().split("\n")[0] || null;
            if (audioUrl) {
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
    duration: number;
    thumbnail: string;
}

export async function searchYouTube(query: string, limit = 10): Promise<YTSearchResult[]> {
    const cacheKey = `ytsearch:${query.toLowerCase().trim()}:${limit}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
        console.log("⚡ Search cache hit for:", query);
        return JSON.parse(cached);
    }

    return new Promise((resolve) => {
        const command = `${YTDLP_CMD} "ytsearch${limit}:${query}" --dump-json --no-playlist --flat-playlist --no-warnings ${getCookiesArg()}`;

        exec(command, { timeout: 25000 }, async (error, stdout) => {
            if (error) {
                console.error("yt-dlp search error:", error.killed ? "Process timed out" : error.message);
                return resolve([]);
            }

            const results: YTSearchResult[] = [];
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
                await redis.setex(cacheKey, 1800, JSON.stringify(results));
                console.log(`🔍 Cached ${results.length} results for: "${query}"`);
            }

            resolve(results);
        });
    });
}
