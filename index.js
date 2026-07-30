require("dotenv").config();
const express = require("express");
const path = require("path");
const { createBot } = require("./src/bot");
const apiRoutes = require("./src/routes");

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN is missing. Set it in your .env file.");
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/", apiRoutes);

app.listen(PORT, () => {
  console.log(`✅ Web server running on port ${PORT}`);
});

createBot(BOT_TOKEN);
console.log("✅ Telegram bot started (polling mode)");
