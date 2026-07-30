const ytdlp = require("yt-dlp-exec");
const { getTikTokInfo } = require("./tiktok");

const PLATFORM_PATTERNS = {
  tiktok: /tiktok\.com/i,
  youtube: /(youtube\.com|youtu\.be)/i,
  instagram: /instagram\.com/i,
  facebook: /(facebook\.com|fb\.watch)/i,
  pinterest: /(pinterest\.com|pin\.it)/i,
};

function detectPlatform(url) {
  for (const [platform, pattern] of Object.entries(PLATFORM_PATTERNS)) {
    if (pattern.test(url)) return platform;
  }
  return null;
}

const SOCIAL_URL_REGEX = new RegExp(
  "(https?://\\S*(" +
    Object.values(PLATFORM_PATTERNS)
      .map((p) => p.source)
      .join("|") +
    ")\\S*)",
  "i"
);

async function getMediaInfo(url) {
  const platform = detectPlatform(url);
  if (!platform) {
    throw new Error(
      "Unsupported link. Send a TikTok, YouTube, Instagram, Facebook, or Pinterest link."
    );
  }

  if (platform === "tiktok") {
    const info = await getTikTokInfo(url);
    return {
      platform,
      title: info.title,
      author: info.author,
      cover: info.cover,
      videoUrl: info.noWatermarkUrl,
      musicUrl: info.musicUrl,
    };
  }

  const data = await ytdlp(url, {
    dumpSingleJson: true,
    noWarnings: true,
    noCheckCertificates: true,
    format: "best",
  });

  const videoUrl =
    data.url ||
    (Array.isArray(data.formats) && data.formats.length
      ? data.formats[data.formats.length - 1].url
      : null);

  if (!videoUrl) {
    throw new Error("No downloadable media found for this link.");
  }

  return {
    platform,
    title: data.title || "Media",
    author: data.uploader || data.channel || data.uploader_id || "Unknown",
    cover: data.thumbnail || null,
    videoUrl,
    musicUrl: null,
  };
}

module.exports = { getMediaInfo, detectPlatform, SOCIAL_URL_REGEX };
