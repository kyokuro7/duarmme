const { Markup } = require("telegraf");
const sessionManager = require("./sessionManager");
const channelForwarder = require("./channelForwarder");

function registerChannelForwarderHandlers(bot, userStates) {

  // ==================== MENU CHANNEL FORWARDER ====================
  bot.action("cf_menu", (ctx) => {
    const status = channelForwarder.getForwarderStatus();
    const sessions = sessionManager.getAllSessions();

    if (sessions.length === 0) {
      return ctx.editMessageText(
        "📡 *Channel Forwarder*\n\nBelum ada akun tersimpan.",
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("➕ Tambah Akun", "add_account")],
            [Markup.button.callback("◀️ Kembali", "main_menu")],
          ]),
        }
      );
    }

    return renderCFMenu(ctx, status);
  });

  function renderCFMenu(ctx, status) {
    const isActive = status.active;

    let text = "📡 *Channel Forwarder*\n\n";
    text += `Status: ${isActive ? "🟢 *AKTIF*" : "🔴 *MATI*"}\n\n`;

    if (isActive) {
      text += `📞 Akun: \`${status.phone}\`\n`;
      text += `📡 Channel: \`${status.channelId}\`\n`;
      text += `⏱ Interval cek: ${status.checkInterval / 1000}s\n`;
      text += `⏱ Jeda grup: ${status.grupDelay / 1000}s\n`;
      text += `📨 Total terforward: *${status.totalForwarded}* pesan\n`;
    } else {
      text += `_Forwarder belum aktif.\nTekan "⚙️ Konfigurasi & Nyalakan" untuk mulai._`;
    }

    const buttons = isActive
      ? [
          [Markup.button.callback("🔴 Matikan Forwarder", "cf_stop")],
          [Markup.button.callback("ℹ️ Refresh Status", "cf_menu")],
          [Markup.button.callback("◀️ Kembali", "main_menu")],
        ]
      : [
          [Markup.button.callback("⚙️ Konfigurasi & Nyalakan", "cf_setup")],
          [Markup.button.callback("◀️ Kembali", "main_menu")],
        ];

    return ctx.editMessageText(text, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons),
    });
  }

  // ==================== SETUP: PILIH AKUN ====================
  bot.action("cf_setup", (ctx) => {
    const sessions = sessionManager.getAllSessions();
    const buttons = sessions.map((s) => {
      const name = s.info.firstName
        ? `${s.info.firstName} ${s.info.lastName || ""}`.trim()
        : s.phone;
      return [Markup.button.callback(`📞 ${name} (${s.phone})`, `cf_pick_acc_${s.phone}`)];
    });
    buttons.push([Markup.button.callback("◀️ Kembali", "cf_menu")]);

    return ctx.editMessageText(
      "📡 *Channel Forwarder - Pilih Akun*\n\n" +
        "Pilih akun userbot yang akan digunakan untuk forward pesan:",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard(buttons),
      }
    );
  });

  // Setelah pilih akun → minta input channel
  bot.action(/^cf_pick_acc_(.+)$/, (ctx) => {
    const phone = ctx.match[1];
    userStates.set(ctx.from.id, { step: "cf_input_channel", cf_phone: phone });

    return ctx.editMessageText(
      `📡 *Channel Forwarder*\n\n` +
        `✅ Akun dipilih: \`${phone}\`\n\n` +
        `Sekarang masukkan *ID atau username channel* sumber:\n\n` +
        `Contoh:\n` +
        `• \`@namaChannel\`\n` +
        `• \`-1001234567890\` (ID channel)\n` +
        `• \`t.me/namaChannel\``,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("❌ Batal", "cf_menu")],
        ]),
      }
    );
  });

  // ==================== STOP FORWARDER ====================
  bot.action("cf_stop", async (ctx) => {
    await ctx.editMessageText("⏳ Menghentikan forwarder...", { parse_mode: "Markdown" });

    const result = await channelForwarder.stopForwarder();

    if (result.success) {
      return ctx.editMessageText(
        `✅ *Forwarder berhasil dihentikan!*\n\n` +
          `📨 Total pesan yang diforward: *${result.totalForwarded}*`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("◀️ Kembali ke Menu Forwarder", "cf_menu")],
          ]),
        }
      );
    } else {
      return ctx.editMessageText(`❌ Gagal menghentikan:\n\`${result.error}\``, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("◀️ Kembali", "cf_menu")],
        ]),
      });
    }
  });

  // ==================== TEXT HANDLER ====================
  function handleCFText(ctx, userId, state, text) {
    // Step 1: Input channel
    if (state.step === "cf_input_channel") {
      const channelInput = text.trim();

      // Validasi minimal
      if (channelInput.length < 3) {
        return ctx.reply("❌ Input tidak valid. Masukkan username atau ID channel yang benar:");
      }

      userStates.set(userId, {
        ...state,
        step: "cf_input_interval",
        cf_channel: channelInput,
      });

      return ctx.reply(
        `✅ Channel disimpan: \`${channelInput}\`\n\n` +
          `Masukkan *interval pengecekan pesan baru* (detik):\n` +
          `_Default: 30 | Min: 10 | Max: 3600_`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("✅ Pakai Default (30s)", "cf_use_default_interval")],
            [Markup.button.callback("❌ Batal", "cf_menu")],
          ]),
        }
      );
    }

    // Step 2: Input interval
    if (state.step === "cf_input_interval") {
      const sec = parseInt(text);
      if (isNaN(sec) || sec < 10 || sec > 3600) {
        return ctx.reply("❌ Harus angka antara 10-3600 detik. Coba lagi:");
      }

      userStates.set(userId, {
        ...state,
        step: "cf_input_delay",
        cf_interval: sec * 1000,
      });

      return ctx.reply(
        `✅ Interval: ${sec} detik\n\n` +
          `Masukkan *jeda antar grup* saat forward (detik):\n` +
          `_Default: 1 | Min: 0.5 | Max: 30_`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("✅ Pakai Default (1s)", "cf_use_default_delay")],
            [Markup.button.callback("❌ Batal", "cf_menu")],
          ]),
        }
      );
    }

    // Step 3: Input delay grup
    if (state.step === "cf_input_delay") {
      let sec = parseFloat(text);
      if (isNaN(sec) || sec < 0.5 || sec > 30) {
        return ctx.reply("❌ Harus angka antara 0.5-30 detik. Coba lagi:");
      }

      return startForwarderFromState(ctx, userId, { ...state, cf_delay: Math.round(sec * 1000) });
    }

    return null;
  }

  // Tombol pakai default interval
  bot.action("cf_use_default_interval", (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state) return;

    userStates.set(ctx.from.id, {
      ...state,
      step: "cf_input_delay",
      cf_interval: 30000,
    });

    return ctx.editMessageText(
      `✅ Interval: 30 detik (default)\n\n` +
        `Masukkan *jeda antar grup* saat forward (detik):\n` +
        `_Default: 1 | Min: 0.5 | Max: 30_`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✅ Pakai Default (1s)", "cf_use_default_delay")],
          [Markup.button.callback("❌ Batal", "cf_menu")],
        ]),
      }
    );
  });

  // Tombol pakai default delay grup
  bot.action("cf_use_default_delay", (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state) return;
    return startForwarderFromState(ctx, ctx.from.id, { ...state, cf_delay: 1000 });
  });

  // Eksekusi start forwarder
  async function startForwarderFromState(ctx, userId, state) {
    const { cf_phone, cf_channel, cf_interval, cf_delay } = state;

    // Tampilkan loading (edit atau reply)
    try {
      await ctx.editMessageText(
        `⏳ Memulai Channel Forwarder...\n\n` +
          `📞 Akun: \`${cf_phone}\`\n` +
          `📡 Channel: \`${cf_channel}\`\n` +
          `⏱ Interval: ${cf_interval / 1000}s\n` +
          `⏱ Jeda grup: ${cf_delay / 1000}s`,
        { parse_mode: "Markdown" }
      );
    } catch (e) {
      await ctx.reply(`⏳ Memulai Channel Forwarder...`, { parse_mode: "Markdown" });
    }

    userStates.delete(userId);

    const result = await channelForwarder.startForwarder(
      ctx.telegram ? { telegram: ctx.telegram } : ctx,
      cf_phone,
      cf_channel,
      cf_delay,
      cf_interval,
      ctx.chat.id
    );

    if (result.success) {
      try {
        return ctx.editMessageText(
          `✅ *Channel Forwarder Berhasil Dimulai!*\n\n` +
            `📞 Akun: \`${cf_phone}\`\n` +
            `📡 Channel: \`${cf_channel}\`\n` +
            `⏱ Cek setiap: ${cf_interval / 1000} detik\n` +
            `⏱ Jeda grup: ${cf_delay / 1000} detik\n\n` +
            `_Notifikasi akan dikirim saat ada pesan baru yang diforward._`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [Markup.button.callback("📡 Status Forwarder", "cf_menu")],
              [Markup.button.callback("◀️ Menu Utama", "main_menu")],
            ]),
          }
        );
      } catch (e) {
        return ctx.reply(
          `✅ Channel Forwarder aktif!\n\nCek status via Menu Utama → Channel Forwarder.`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([[Markup.button.callback("📡 Status", "cf_menu")]]),
          }
        );
      }
    } else {
      return ctx.reply(`❌ Gagal memulai forwarder:\n\`${result.error}\``, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔄 Coba Lagi", "cf_setup")],
          [Markup.button.callback("◀️ Kembali", "cf_menu")],
        ]),
      });
    }
  }

  return { handleCFText };
}

module.exports = { registerChannelForwarderHandlers };
