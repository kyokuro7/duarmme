const { Markup } = require("telegraf");
const db = require("./db");
const sessionManager = require("./sessionManager");
const config = require("./config");

/**
 * Register owner shop management handlers (sell noktel, setting harga)
 */
function registerOwnerShopHandlers(bot, userStates) {

  // ==================== SELL NOKTEL MENU ====================
  bot.action("owner_sell_noktel", (ctx) => {
    if (ctx.from.id !== config.OWNER_ID) return;
    const sessions = sessionManager.getAllSessions();

    if (sessions.length === 0) {
      return ctx.editMessageText(
        "🏪 *Sell Noktel*\n\nBelum ada akun tersimpan.",
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("◀️ Kembali", "main_menu")],
          ]),
        }
      );
    }


    // Group by ID prefix
    const prefixMap = {};
    sessions.forEach((s) => {
      const id = s.info.id || "";
      if (id.length > 0) {
        const prefix = id.charAt(0);
        if (!prefixMap[prefix]) prefixMap[prefix] = [];
        prefixMap[prefix].push(s);
      }
    });

    const prefixes = Object.keys(prefixMap).sort();
    if (prefixes.length === 0) {
      return ctx.editMessageText(
        "🏪 *Sell Noktel*\n\nTidak ada akun dengan ID valid.",
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("◀️ Kembali", "main_menu")],
          ]),
        }
      );
    }

    const buttons = prefixes.map((p) => {
      const count = prefixMap[p].length;
      return [Markup.button.callback(`🆔 ID ${p} (${count} akun)`, `sell_prefix_${p}`)];
    });
    buttons.push([Markup.button.callback("🗑 Kelola Daftar Jual", "sell_manage_list")]);
    buttons.push([Markup.button.callback("◀️ Kembali", "main_menu")]);

    return ctx.editMessageText(
      "🏪 *Sell Noktel*\n\nPilih awalan ID akun yang ingin dijual:\n\n_Atau kelola daftar akun yang sudah dijual._",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard(buttons),
      }
    );
  });

  // ==================== KELOLA DAFTAR JUAL (HAPUS DARI DAFTAR) ====================
  bot.action("sell_manage_list", (ctx) => {
    if (ctx.from.id !== config.OWNER_ID) return;

    const available = db.getAvailableAccounts();
    if (available.length === 0) {
      return ctx.editMessageText(
        "🗑 *Kelola Daftar Jual*\n\nBelum ada akun di daftar jual.",
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("◀️ Kembali", "owner_sell_noktel")],
          ]),
        }
      );
    }

    const buttons = available.slice(0, 20).map((a) => {
      const id = a.info.id || a.phone;
      const limitStatus = a.info.isLimited ? "🚫" : "✅";
      return [Markup.button.callback(`${limitStatus} ${id}`, `sell_manage_detail_${a.phone}`)];
    });
    buttons.push([Markup.button.callback("◀️ Kembali", "owner_sell_noktel")]);

    return ctx.editMessageText(
      `🗑 *Kelola Daftar Jual*\n\n` +
      `Total: ${available.length} akun di daftar jual\n\n` +
      `Pilih akun untuk mengelola (hapus dari daftar/ubah status):`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard(buttons),
      }
    );
  });

  // ==================== DETAIL AKUN DI DAFTAR JUAL ====================
  bot.action(/^sell_manage_detail_(.+)$/, (ctx) => {
    if (ctx.from.id !== config.OWNER_ID) return;
    const phone = ctx.match[1];
    const account = db.getShopAccount(phone);

    if (!account) {
      return ctx.answerCbQuery("❌ Akun tidak ditemukan di daftar jual.", { show_alert: true });
    }

    const info = account.info || {};
    const id = info.id || phone;
    const limitStatus = info.isLimited ? "Limit 🚫" : "Aman ✅";

    return ctx.editMessageText(
      `⚙️ *Kelola Akun di Daftar Jual*\n\n` +
      `🆔 ID: \`${id}\`\n` +
      `📞 Nomor: \`${phone}\`\n` +
      `⚠️ Status: ${limitStatus}\n\n` +
      `Pilih aksi:`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✅ Set Aman", `sell_set_aman_${phone}`)],
          [Markup.button.callback("🚫 Set Limit", `sell_set_limit_${phone}`)],
          [Markup.button.callback("🗑 Hapus dari Daftar Jual", `sell_remove_confirm_${phone}`)],
          [Markup.button.callback("◀️ Kembali", "sell_manage_list")],
        ]),
      }
    );
  });

  // ==================== SET STATUS MANUAL: AMAN ====================
  bot.action(/^sell_set_aman_(.+)$/, (ctx) => {
    if (ctx.from.id !== config.OWNER_ID) return;
    const phone = ctx.match[1];

    db.updateShopAccountStatus(phone, false);
    // Update juga di session manager
    sessionManager.updateSessionInfo(phone, { isLimited: false });

    return ctx.editMessageText(
      `✅ Status akun \`${phone}\` diubah menjadi *Aman ✅*`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("◀️ Kembali ke Daftar", "sell_manage_list")],
          [Markup.button.callback("◀️ Menu Utama", "main_menu")],
        ]),
      }
    );
  });

  // ==================== SET STATUS MANUAL: LIMIT ====================
  bot.action(/^sell_set_limit_(.+)$/, (ctx) => {
    if (ctx.from.id !== config.OWNER_ID) return;
    const phone = ctx.match[1];

    db.updateShopAccountStatus(phone, true);
    // Update juga di session manager
    sessionManager.updateSessionInfo(phone, { isLimited: true });

    return ctx.editMessageText(
      `🚫 Status akun \`${phone}\` diubah menjadi *Limit 🚫*`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("◀️ Kembali ke Daftar", "sell_manage_list")],
          [Markup.button.callback("◀️ Menu Utama", "main_menu")],
        ]),
      }
    );
  });

  // ==================== HAPUS DARI DAFTAR JUAL - KONFIRMASI ====================
  bot.action(/^sell_remove_confirm_(.+)$/, (ctx) => {
    if (ctx.from.id !== config.OWNER_ID) return;
    const phone = ctx.match[1];
    const account = db.getShopAccount(phone);
    const id = (account && account.info.id) || phone;

    return ctx.editMessageText(
      `⚠️ *Konfirmasi Hapus dari Daftar Jual*\n\n` +
      `🆔 ID: \`${id}\`\n` +
      `📞 Nomor: \`${phone}\`\n\n` +
      `Akun ini akan dihapus dari daftar jual (tidak bisa dibeli buyer).\n` +
      `Akun *TIDAK* dihapus dari database session.\n\n` +
      `Yakin?`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✅ Ya, Hapus dari Daftar", `sell_remove_exec_${phone}`)],
          [Markup.button.callback("❌ Batal", `sell_manage_detail_${phone}`)],
        ]),
      }
    );
  });

  // ==================== EKSEKUSI HAPUS DARI DAFTAR JUAL ====================
  bot.action(/^sell_remove_exec_(.+)$/, (ctx) => {
    if (ctx.from.id !== config.OWNER_ID) return;
    const phone = ctx.match[1];

    const removed = db.removeShopAccount(phone);

    if (removed) {
      return ctx.editMessageText(
        `✅ Akun \`${phone}\` berhasil dihapus dari daftar jual.`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("🗑 Kelola Daftar Lain", "sell_manage_list")],
            [Markup.button.callback("◀️ Menu Utama", "main_menu")],
          ]),
        }
      );
    } else {
      return ctx.editMessageText(
        `❌ Gagal menghapus akun dari daftar jual.`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("◀️ Kembali", "sell_manage_list")],
          ]),
        }
      );
    }
  });


  // ==================== PILIH PREFIX → TAMPILKAN AKUN ====================
  bot.action(/^sell_prefix_(\d)$/, (ctx) => {
    if (ctx.from.id !== config.OWNER_ID) return;
    const prefix = ctx.match[1];
    const sessions = sessionManager.getAllSessions();

    // Filter akun yang berawalan prefix ini
    const filtered = sessions.filter((s) => {
      const id = s.info.id || "";
      return id.startsWith(prefix);
    });

    if (filtered.length === 0) {
      return ctx.editMessageText("❌ Tidak ada akun dengan awalan ID ini.", {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("◀️ Kembali", "owner_sell_noktel")],
        ]),
      });
    }

    // Cek mana yang sudah dijual
    const buttons = filtered.map((s) => {
      const id = s.info.id || s.phone;
      const existing = db.getShopAccount(s.phone);
      const status = existing ? " ✅ (sudah)" : "";
      return [Markup.button.callback(
        `📱 ${id}${status}`,
        `sell_pick_${s.phone}`
      )];
    });
    buttons.push([Markup.button.callback("◀️ Kembali", "owner_sell_noktel")]);

    return ctx.editMessageText(
      `🏪 *Sell Noktel - ID ${prefix}*\n\nPilih akun yang ingin dijual:`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard(buttons),
      }
    );
  });


  // ==================== KONFIRMASI JUAL AKUN ====================
  bot.action(/^sell_pick_(.+)$/, (ctx) => {
    if (ctx.from.id !== config.OWNER_ID) return;
    const phone = ctx.match[1];

    // Cek apakah sudah ada di daftar jual
    const existing = db.getShopAccount(phone);
    if (existing) {
      return ctx.answerCbQuery("⚠️ Akun ini sudah ada di daftar jual!", { show_alert: true });
    }

    const sessions = sessionManager.getAllSessions();
    const account = sessions.find((s) => s.phone === phone);
    if (!account) {
      return ctx.answerCbQuery("❌ Akun tidak ditemukan.", { show_alert: true });
    }

    const name = account.info.firstName || "Unknown";
    const id = account.info.id || phone;
    const limitStatus = account.info.isLimited === true
      ? "Limit 🚫"
      : account.info.isLimited === false
      ? "Aman ✅"
      : "Belum diset";

    return ctx.editMessageText(
      `🏪 *Konfirmasi Jual Akun*\n\n` +
      `🆔 ID: \`${id}\`\n` +
      `👤 Nama: ${name}\n` +
      `📞 Nomor: \`${phone}\`\n` +
      `⚠️ Status: ${limitStatus}\n\n` +
      `Set status akun sebelum dijual, lalu konfirmasi:`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("✅ Set Aman", `sell_setstatus_aman_${phone}`),
            Markup.button.callback("🚫 Set Limit", `sell_setstatus_limit_${phone}`),
          ],
          [Markup.button.callback("✅ Konfirmasi Jual", `sell_confirm_${phone}`)],
          [Markup.button.callback("❌ Batal", "owner_sell_noktel")],
        ]),
      }
    );
  });

  // ==================== SET STATUS SEBELUM JUAL ====================
  bot.action(/^sell_setstatus_aman_(.+)$/, (ctx) => {
    if (ctx.from.id !== config.OWNER_ID) return;
    const phone = ctx.match[1];
    sessionManager.updateSessionInfo(phone, { isLimited: false });
    ctx.answerCbQuery("✅ Status diset: Aman", { show_alert: false });

    // Re-render konfirmasi
    const sessions = sessionManager.getAllSessions();
    const account = sessions.find((s) => s.phone === phone);
    if (!account) return;

    const name = account.info.firstName || "Unknown";
    const id = account.info.id || phone;

    return ctx.editMessageText(
      `🏪 *Konfirmasi Jual Akun*\n\n` +
      `🆔 ID: \`${id}\`\n` +
      `👤 Nama: ${name}\n` +
      `📞 Nomor: \`${phone}\`\n` +
      `⚠️ Status: Aman ✅\n\n` +
      `Set status akun sebelum dijual, lalu konfirmasi:`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("✅ Set Aman", `sell_setstatus_aman_${phone}`),
            Markup.button.callback("🚫 Set Limit", `sell_setstatus_limit_${phone}`),
          ],
          [Markup.button.callback("✅ Konfirmasi Jual", `sell_confirm_${phone}`)],
          [Markup.button.callback("❌ Batal", "owner_sell_noktel")],
        ]),
      }
    );
  });

  bot.action(/^sell_setstatus_limit_(.+)$/, (ctx) => {
    if (ctx.from.id !== config.OWNER_ID) return;
    const phone = ctx.match[1];
    sessionManager.updateSessionInfo(phone, { isLimited: true });
    ctx.answerCbQuery("🚫 Status diset: Limit", { show_alert: false });

    // Re-render konfirmasi
    const sessions = sessionManager.getAllSessions();
    const account = sessions.find((s) => s.phone === phone);
    if (!account) return;

    const name = account.info.firstName || "Unknown";
    const id = account.info.id || phone;

    return ctx.editMessageText(
      `🏪 *Konfirmasi Jual Akun*\n\n` +
      `🆔 ID: \`${id}\`\n` +
      `👤 Nama: ${name}\n` +
      `📞 Nomor: \`${phone}\`\n` +
      `⚠️ Status: Limit 🚫\n\n` +
      `Set status akun sebelum dijual, lalu konfirmasi:`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("✅ Set Aman", `sell_setstatus_aman_${phone}`),
            Markup.button.callback("🚫 Set Limit", `sell_setstatus_limit_${phone}`),
          ],
          [Markup.button.callback("✅ Konfirmasi Jual", `sell_confirm_${phone}`)],
          [Markup.button.callback("❌ Batal", "owner_sell_noktel")],
        ]),
      }
    );
  });

  bot.action(/^sell_confirm_(.+)$/, (ctx) => {
    if (ctx.from.id !== config.OWNER_ID) return;
    const phone = ctx.match[1];

    const sessions = sessionManager.getAllSessions();
    const account = sessions.find((s) => s.phone === phone);
    if (!account) {
      return ctx.editMessageText("❌ Akun tidak ditemukan.", {
        ...Markup.inlineKeyboard([
          [Markup.button.callback("◀️ Kembali", "owner_sell_noktel")],
        ]),
      });
    }

    const result = db.addShopAccount(phone, account.info || {});

    if (result.success) {
      return ctx.editMessageText(
        `✅ *Akun berhasil ditambahkan ke daftar jual!*\n\n` +
        `📞 \`${phone}\`\n` +
        `🆔 ID: \`${account.info.id || "-"}\``,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("🏪 Jual Akun Lain", "owner_sell_noktel")],
            [Markup.button.callback("◀️ Menu Utama", "main_menu")],
          ]),
        }
      );
    } else {
      return ctx.editMessageText(`❌ Gagal: ${result.error}`, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("◀️ Kembali", "owner_sell_noktel")],
        ]),
      });
    }
  });


  // ==================== SETTING HARGA MENU ====================
  bot.action("owner_setting_harga", (ctx) => {
    if (ctx.from.id !== config.OWNER_ID) return;
    const prices = db.getPrices();

    // Tampilkan prefix yang ada
    const allPrefixes = Object.keys(prices).sort();
    const buttons = allPrefixes.map((p) => {
      const priceData = prices[p];
      const limitPrice = (typeof priceData === "object") ? priceData.limit : priceData;
      const amanPrice = (typeof priceData === "object") ? priceData.aman : priceData;
      return [Markup.button.callback(
        `🆔 ID ${p} - L: Rp ${limitPrice.toLocaleString("id-ID")} | A: Rp ${amanPrice.toLocaleString("id-ID")}`,
        `price_view_${p}`
      )];
    });
    buttons.push([Markup.button.callback("◀️ Kembali", "main_menu")]);

    return ctx.editMessageText(
      "💰 *Setting Harga*\n\n" +
      "_L = Limit | A = Aman_\n\n" +
      "Pilih ID untuk melihat/mengubah harga:",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard(buttons),
      }
    );
  });

  // ==================== VIEW HARGA PER PREFIX ====================
  bot.action(/^price_view_(\d)$/, (ctx) => {
    if (ctx.from.id !== config.OWNER_ID) return;
    const prefix = ctx.match[1];
    const prices = db.getPrices();
    const priceData = prices[prefix] || { limit: 0, aman: 0 };
    const limitPrice = (typeof priceData === "object") ? priceData.limit : priceData;
    const amanPrice = (typeof priceData === "object") ? priceData.aman : priceData;

    const defaultData = db.DEFAULT_PRICES[prefix] || { limit: 0, aman: 0 };
    const defLimit = (typeof defaultData === "object") ? defaultData.limit : defaultData;
    const defAman = (typeof defaultData === "object") ? defaultData.aman : defaultData;

    return ctx.editMessageText(
      `💰 *Harga ID ${prefix}*\n\n` +
      `🚫 *Limit:*\n` +
      `   Saat ini: *Rp ${limitPrice.toLocaleString("id-ID")}*\n` +
      `   Default: Rp ${defLimit.toLocaleString("id-ID")}\n\n` +
      `✅ *Aman:*\n` +
      `   Saat ini: *Rp ${amanPrice.toLocaleString("id-ID")}*\n` +
      `   Default: Rp ${defAman.toLocaleString("id-ID")}`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✏️ Ubah Harga", `price_change_${prefix}`)],
          [Markup.button.callback("◀️ Kembali", "owner_setting_harga")],
        ]),
      }
    );
  });


  // ==================== UBAH HARGA - PILIH TIPE ====================
  bot.action(/^price_change_(\d)$/, (ctx) => {
    if (ctx.from.id !== config.OWNER_ID) return;
    const prefix = ctx.match[1];

    return ctx.editMessageText(
      `✏️ *Ubah Harga ID ${prefix}*\n\n` +
      `Pilih tipe harga yang ingin diubah:`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🚫 Harga Limit", `price_set_limit_${prefix}`)],
          [Markup.button.callback("✅ Harga Aman", `price_set_aman_${prefix}`)],
          [Markup.button.callback("◀️ Kembali", `price_view_${prefix}`)],
        ]),
      }
    );
  });

  // ==================== INPUT HARGA LIMIT ====================
  bot.action(/^price_set_limit_(\d)$/, (ctx) => {
    if (ctx.from.id !== config.OWNER_ID) return;
    const prefix = ctx.match[1];
    userStates.set(ctx.from.id, { step: "owner_price_input", pricePrefix: prefix, priceType: "limit" });

    const prices = db.getPrices();
    const priceData = prices[prefix] || { limit: 0, aman: 0 };
    const currentPrice = (typeof priceData === "object") ? priceData.limit : priceData;

    return ctx.editMessageText(
      `✏️ *Ubah Harga Limit - ID ${prefix}*\n\n` +
      `Harga saat ini: *Rp ${currentPrice.toLocaleString("id-ID")}*\n\n` +
      `Masukkan harga baru (angka saja):\n` +
      `_Contoh: 5000_`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("❌ Batal", `price_change_${prefix}`)],
        ]),
      }
    );
  });

  // ==================== INPUT HARGA AMAN ====================
  bot.action(/^price_set_aman_(\d)$/, (ctx) => {
    if (ctx.from.id !== config.OWNER_ID) return;
    const prefix = ctx.match[1];
    userStates.set(ctx.from.id, { step: "owner_price_input", pricePrefix: prefix, priceType: "aman" });

    const prices = db.getPrices();
    const priceData = prices[prefix] || { limit: 0, aman: 0 };
    const currentPrice = (typeof priceData === "object") ? priceData.aman : priceData;

    return ctx.editMessageText(
      `✏️ *Ubah Harga Aman - ID ${prefix}*\n\n` +
      `Harga saat ini: *Rp ${currentPrice.toLocaleString("id-ID")}*\n\n` +
      `Masukkan harga baru (angka saja):\n` +
      `_Contoh: 7500_`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("❌ Batal", `price_change_${prefix}`)],
        ]),
      }
    );
  });

  // ==================== TEXT HANDLER UNTUK OWNER SHOP ====================
  function handleOwnerShopText(ctx, userId, state, text) {
    if (state.step === "owner_price_input") {
      const price = parseInt(text.replace(/[.,\s]/g, ""));
      if (isNaN(price) || price < 100) {
        return ctx.reply("❌ Harga tidak valid. Masukkan angka minimal 100:");
      }

      const prefix = state.pricePrefix;
      const priceType = state.priceType || "aman";
      db.setPrice(prefix, price, priceType);
      userStates.delete(userId);

      const typeLabel = priceType === "limit" ? "Limit 🚫" : "Aman ✅";

      return ctx.reply(
        `✅ *Harga berhasil diubah!*\n\n` +
        `🆔 ID ${prefix} (${typeLabel}): *Rp ${price.toLocaleString("id-ID")}*`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("💰 Setting Harga", "owner_setting_harga")],
            [Markup.button.callback("◀️ Menu Utama", "main_menu")],
          ]),
        }
      );
    }

    return null;
  }

  return { handleOwnerShopText };
}

module.exports = { registerOwnerShopHandlers };
