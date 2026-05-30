require("dotenv").config();

module.exports = {
  // Bot Token dari @BotFather
  BOT_TOKEN: process.env.BOT_TOKEN,

  // Telegram API credentials dari https://my.telegram.org
  API_ID: parseInt(process.env.API_ID),
  API_HASH: process.env.API_HASH,

  // Owner ID - hanya user ini yang bisa menggunakan bot
  OWNER_ID: parseInt(process.env.OWNER_ID),

  // Channel ID untuk notifikasi pembelian & deposit
  NOTIFICATION_CHANNEL_ID: process.env.NOTIFICATION_CHANNEL_ID || null,

  // Bot username (tanpa @) untuk link button di channel notif
  BOT_USERNAME: process.env.BOT_USERNAME || null,

  // Direktori untuk menyimpan file sesi
  SESSIONS_DIR: "./sessions",
};
