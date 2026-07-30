# TikTok Downloader Bot (No Watermark)

Telegram bot + Express web server in one Node.js project.

## Setup

```bash
npm install
cp .env.example .env
# edit .env and add your BOT_TOKEN from @BotFather
npm start
```

## How it works

- Send any TikTok video link to the bot in Telegram → it replies with the video, no watermark, at the best quality TikTok provides for that video.
- Note: TikTok source videos are not always true 4K — the bot always fetches the **highest quality available (`hd`)** for that specific video, which is the best possible outcome without official TikTok API access.
- Express server runs alongside the bot (needed for Render/Railway health checks) and exposes:
  - `GET /` → simple landing page
  - `GET /health` → health check
  - `GET /api/download?url=<tiktok_url>` → JSON API returning direct video links

## Deploy on Render / Railway

1. Push this project to a GitHub repo.
2. Create a new Web Service (Render) or Project (Railway) from that repo.
3. Set environment variable `BOT_TOKEN` (and optionally `PORT`, Render/Railway set this automatically).
4. Build command: `npm install`
5. Start command: `npm start`

That's it — both the bot and the website run from the same process.
