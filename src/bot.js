const TelegramBot = require("node-telegram-bot-api");
const { getMediaInfo, SOCIAL_URL_REGEX } = require("./downloader");

const AD_LINKS = [process.env.AD_LINK_1, process.env.AD_LINK_2].filter(Boolean);
const AD_DELAY_SECONDS = parseInt(process.env.AD_DELAY_SECONDS || "10", 10);
const STAR_PRICE = parseInt(process.env.STAR_PRICE || "1", 10);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pickRandomAd = () => AD_LINKS[Math.floor(Math.random() * AD_LINKS.length)];

const sessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000;

function makeSessionId() {
  return Math.random().toString(36).slice(2, 10);
}

function saveSession(data) {
  const id = makeSessionId();
  sessions.set(id, { ...data, createdAt: Date.now() });
  return id;
}

function getSession(id) {
  const s = sessions.get(id);
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_TTL_MS) {
    sessions.delete(id);
    return null;
  }
  return s;
}

function cleanupSessions() {
  const now = Date.now();
  for (const [id, s] of sessions.entries()) {
    if (now - s.createdAt > SESSION_TTL_MS) sessions.delete(id);
  }
}
setInterval(cleanupSessions, 10 * 60 * 1000);

function createBot(token) {
  const bot = new TelegramBot(token, { polling: true });

  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      "👋 Send me a video link from TikTok, YouTube, Instagram, Facebook, or Pinterest.\n" +
        `Watch 1 short ad (${AD_DELAY_SECONDS}s) for a free download, or skip the ad instantly for ⭐ ${STAR_PRICE} Star.`
    );
  });

  bot.on("message", async (msg) => {
    const text = msg.text || "";
    if (text.startsWith("/")) return;
    if (msg.successful_payment) return;

    const match = text.match(SOCIAL_URL_REGEX);
    if (!match) {
      bot.sendMessage(
        msg.chat.id,
        "❌ Please send a valid TikTok, YouTube, Instagram, Facebook, or Pinterest link."
      );
      return;
    }

    const url = match[1];
    const chatId = msg.chat.id;

    const loadingMsg = await bot.sendMessage(chatId, "⏳ Fetching media info...");

    try {
      const info = await getMediaInfo(url);
      if (!info.videoUrl) {
        throw new Error("No downloadable media found for this link.");
      }

      const sessionId = saveSession({ url, info, chatId });

      const buttonRow = [{ text: "🎬 Get Video (Free, watch ad)", callback_data: `video_ad_${sessionId}` }];
      if (info.musicUrl) {
        buttonRow.push({ text: "🎵 Get Music (Free, watch ad)", callback_data: `music_ad_${sessionId}` });
      }

      const keyboard = {
        inline_keyboard: [
          buttonRow,
          [{ text: `⭐ Skip Ad — ${STAR_PRICE} Star`, callback_data: `premium_${sessionId}` }],
        ],
      };

      const caption = `🎬 ${info.title}\n👤 ${info.author}`;

      if (info.cover) {
        await bot.sendPhoto(chatId, info.cover, { caption, reply_markup: keyboard });
      } else {
        await bot.sendMessage(chatId, caption, { reply_markup: keyboard });
      }

      bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    } catch (err) {
      console.error("Fetch error:", err.message);
      bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
      bot.sendMessage(
        chatId,
        "⚠️ Sorry, I couldn't fetch that media. Make sure the link is correct and the post is public."
      );
    }
  });

  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data || "";

    bot.answerCallbackQuery(query.id).catch(() => {});

    if (data.startsWith("premium_")) {
      const sessionId = data.replace("premium_", "");
      const session = getSession(sessionId);
      if (!session) {
        return bot.sendMessage(chatId, "⚠️ This link expired. Please send the link again.");
      }

      await bot.sendInvoice(
        chatId,
        "Skip Ad — Instant Download",
        `Get "${session.info.title}" instantly, no ad.`,
        `premium_${sessionId}`,
        "",
        "XTR",
        [{ label: "Skip Ad", amount: STAR_PRICE }]
      );
      return;
    }

    const isVideo = data.startsWith("video_ad_");
    const isMusic = data.startsWith("music_ad_");
    if (!isVideo && !isMusic) return;

    const sessionId = data.replace(isVideo ? "video_ad_" : "music_ad_", "");
    const session = getSession(sessionId);
    if (!session) {
      return bot.sendMessage(chatId, "⚠️ This link expired. Please send the link again.");
    }

    await deliverAfterAd(bot, chatId, session, isVideo ? "video" : "music");
  });

  bot.on("pre_checkout_query", (query) => {
    bot.answerPreCheckoutQuery(query.id, true).catch((err) => {
      console.error("Pre-checkout error:", err.message);
    });
  });

  bot.on("message", async (msg) => {
    if (!msg.successful_payment) return;

    const chatId = msg.chat.id;
    const payload = msg.successful_payment.invoice_payload || "";
    const sessionId = payload.replace("premium_", "");
    const session = getSession(sessionId);

    if (!session) {
      return bot.sendMessage(chatId, "⚠️ Payment received, but the link expired. Please send the link again.");
    }

    await bot.sendMessage(chatId, "✅ Payment received! Sending your file now...");
    await deliverFile(bot, chatId, session.info, "video");
  });

  bot.on("polling_error", (err) => {
    console.error("Polling error:", err.message);
  });

  return bot;
}

async function deliverAfterAd(bot, chatId, session, kind) {
  try {
    const ad = pickRandomAd();
    if (ad) {
      await bot.sendMessage(
        chatId,
        `📢 Please tap the ad link below and stay on the page:\n${ad}\n\n⏳ Your ${kind} unlocks in ${AD_DELAY_SECONDS} seconds — this wait is required even if you already tapped the link.`,
        { disable_web_page_preview: true }
      );
    }
    await sleep(AD_DELAY_SECONDS * 1000);

    await deliverFile(bot, chatId, session.info, kind);
  } catch (err) {
    console.error("Delivery error:", err.message);
    bot.sendMessage(chatId, "⚠️ Something went wrong while sending your file. Please try again.");
  }
}

async function deliverFile(bot, chatId, info, kind) {
  const loadingMsg = await bot.sendMessage(chatId, "⏳ Preparing your file...");
  await sleep(1000);

  try {
    if (kind === "music") {
      if (!info.musicUrl) throw new Error("No music found for this link.");
      await bot.sendAudio(chatId, info.musicUrl, {
        title: info.title,
        performer: info.author,
      });
    } else {
      if (!info.videoUrl) throw new Error("No downloadable video found.");
      await bot.sendVideo(chatId, info.videoUrl, {
        caption: `🎬 ${info.title}\n👤 ${info.author}`,
      });
    }
  } finally {
    bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
  }
}

module.exports = { createBot };
