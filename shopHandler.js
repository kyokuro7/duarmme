const { Markup } = require("telegraf");
const db = require("./db");
const sessionManager = require("./sessionManager");
const config = require("./config");

/**
 * Register all shop handlers for user-facing auto order
 */
function registerShopHandlers(bot, userStates) {

  // ==================== BELANJA MENU ====================
  bot.action("shop_menu", (ctx) => {
    return ctx.editMessageText(
      "🛍 *Belanja Noktel*\n\nPilih jenis pembelian:",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("📦 Satuan", "shop_satuan")],
          [Markup.button.callback("📦📦 Bulk", "shop_bulk")],
          [Markup.button.callback("◀️ Kembali", "user_main_menu")],
        ]),
      }
    );
  });


  // ==================== SATUAN ====================
  bot.action("shop_satuan", (ctx) => {
    userStates.set(ctx.from.id, { step: "shop_flow", mode: "satuan" });
    return ctx.editMessageText(
      "📦 *Beli Satuan*\n\nPilih status akun yang diinginkan:",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("Aman ✅", "shop_filter_safe")],
          [Markup.button.callback("Limit 🚫", "shop_filter_limit")],
          [Markup.button.callback("◀️ Kembali", "shop_menu")],
        ]),
      }
    );
  });

  // ==================== BULK ====================
  bot.action("shop_bulk", (ctx) => {
    userStates.set(ctx.from.id, { step: "shop_flow", mode: "bulk", selectedPhones: [] });
    return ctx.editMessageText(
      "📦📦 *Beli Bulk*\n\nPilih status akun yang diinginkan:",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("Aman ✅", "shop_filter_safe")],
          [Markup.button.callback("Limit 🚫", "shop_filter_limit")],
          [Markup.button.callback("◀️ Kembali", "shop_menu")],
        ]),
      }
    );
  });


  // ==================== FILTER LIMIT/AMAN ====================
  bot.action("shop_filter_safe", (ctx) => {
    const state = userStates.get(ctx.from.id) || {};
    userStates.set(ctx.from.id, { ...state, isLimited: false });
    return showPrefixSelection(ctx, false);
  });

  bot.action("shop_filter_limit", (ctx) => {
    const state = userStates.get(ctx.from.id) || {};
    userStates.set(ctx.from.id, { ...state, isLimited: true });
    return showPrefixSelection(ctx, true);
  });

  function showPrefixSelection(ctx, isLimited) {
    const prefixes = db.getAvailablePrefixes(isLimited);
    if (prefixes.length === 0) {
      return ctx.editMessageText(
        "❌ Tidak ada akun tersedia untuk kategori ini.",
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("◀️ Kembali", "shop_menu")],
          ]),
        }
      );
    }

    const prices = db.getPrices();
    const buttons = prefixes.map((p) => {
      const count = db.getAccountsByPrefix(p, isLimited).length;
      const priceData = prices[p] || { limit: 2500, aman: 4000 };
      const price = isLimited ? (priceData.limit || 0) : (priceData.aman || 0);
      return [Markup.button.callback(
        `🆔 ID ${p} (${count} akun) - Rp ${price.toLocaleString("id-ID")}`,
        `shop_prefix_${p}`
      )];
    });
    buttons.push([Markup.button.callback("◀️ Kembali", "shop_menu")]);

    const statusText = isLimited ? "Limit 🚫" : "Aman ✅";
    return ctx.editMessageText(
      `📦 *Pilih Awalan ID*\n\nStatus: ${statusText}\n\nPilih awalan ID akun:`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard(buttons),
      }
    );
  }


  // ==================== PILIH PREFIX → TAMPILKAN AKUN ====================
  bot.action(/^shop_prefix_(\d)$/, (ctx) => {
    const prefix = ctx.match[1];
    const state = userStates.get(ctx.from.id) || {};
    userStates.set(ctx.from.id, { ...state, selectedPrefix: prefix });

    const accounts = db.getAccountsByPrefix(prefix, state.isLimited);
    if (accounts.length === 0) {
      return ctx.editMessageText("❌ Tidak ada akun tersedia.", {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("◀️ Kembali", "shop_menu")],
        ]),
      });
    }

    // Untuk mode bulk, tampilkan multi-select
    if (state.mode === "bulk") {
      return renderBulkSelect(ctx, state, accounts);
    }

    // Mode satuan - tampilkan list akun
    const buttons = accounts.slice(0, 20).map((a) => {
      const id = a.info.id || a.phone;
      return [Markup.button.callback(`📱 ${id}`, `shop_pick_${a.phone}`)];
    });
    buttons.push([Markup.button.callback("◀️ Kembali", "shop_menu")]);

    return ctx.editMessageText(
      `📦 *Pilih Akun*\n\nAwalan ID: ${prefix}\nTersedia: ${accounts.length} akun\n\nPilih akun:`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard(buttons),
      }
    );
  });


  // ==================== BULK SELECT ====================
  function renderBulkSelect(ctx, state, accounts) {
    const selected = state.selectedPhones || [];
    const buttons = accounts.slice(0, 20).map((a) => {
      const id = a.info.id || a.phone;
      const sel = selected.includes(a.phone) ? "✅" : "⬜";
      return [Markup.button.callback(`${sel} ${id}`, `shop_bulk_toggle_${a.phone}`)];
    });
    buttons.push([Markup.button.callback("➡️ Lanjut", "shop_bulk_done")]);
    buttons.push([Markup.button.callback("◀️ Kembali", "shop_menu")]);

    return ctx.editMessageText(
      `📦📦 *Beli Bulk - Pilih Akun*\n\nDipilih: *${selected.length}* akun\n\nCentang akun yang ingin dibeli:`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard(buttons),
      }
    );
  }

  bot.action(/^shop_bulk_toggle_(.+)$/, (ctx) => {
    const phone = ctx.match[1];
    const state = userStates.get(ctx.from.id) || {};
    if (!state.selectedPhones) state.selectedPhones = [];
    const idx = state.selectedPhones.indexOf(phone);
    if (idx > -1) state.selectedPhones.splice(idx, 1);
    else state.selectedPhones.push(phone);
    userStates.set(ctx.from.id, state);

    const accounts = db.getAccountsByPrefix(state.selectedPrefix, state.isLimited);
    return renderBulkSelect(ctx, state, accounts);
  });

  bot.action("shop_bulk_done", (ctx) => {
    const state = userStates.get(ctx.from.id) || {};
    if (!state.selectedPhones || state.selectedPhones.length === 0) {
      return ctx.answerCbQuery("⚠️ Pilih minimal 1 akun!", { show_alert: true });
    }
    // Show TOS for all selected
    return showTOS(ctx, state);
  });


  // ==================== PILIH AKUN SATUAN → TOS ====================
  bot.action(/^shop_pick_(.+)$/, (ctx) => {
    const phone = ctx.match[1];
    const state = userStates.get(ctx.from.id) || {};
    userStates.set(ctx.from.id, { ...state, selectedPhones: [phone] });
    return showTOS(ctx, { ...state, selectedPhones: [phone] });
  });

  // ==================== TAMPILKAN S&K ====================
  function showTOS(ctx, state) {
    const tos = db.getTOS();
    const phones = state.selectedPhones || [];
    const prices = db.getPrices();
    const isLimited = state.isLimited;
    let totalPrice = 0;

    phones.forEach((phone) => {
      const acc = db.getShopAccount(phone);
      if (acc) {
        const id = acc.info.id || "";
        const prefix = id.charAt(0) || "8";
        const priceData = prices[prefix] || { limit: 2500, aman: 4000 };
        const price = isLimited ? (priceData.limit || 2500) : (priceData.aman || 4000);
        totalPrice += price;
      }
    });

    const statusText = isLimited ? "Limit" : "Aman";
    let text = `${tos}\n\n`;
    text += `━━━━━━━━━━━━━━━━━━\n`;
    text += `📦 Jumlah: ${phones.length} akun\n`;
    text += `📋 Tipe: ${statusText}\n`;
    text += `💰 Total: *Rp ${totalPrice.toLocaleString("id-ID")}*\n`;

    userStates.set(ctx.from.id, { ...state, totalPrice });

    return ctx.editMessageText(text, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("✅ Konfirmasi", "shop_confirm_purchase")],
        [Markup.button.callback("❌ Batal", "shop_menu")],
      ]),
    });
  }


  // ==================== KONFIRMASI PEMBELIAN → CEK SALDO ====================
  bot.action("shop_confirm_purchase", (ctx) => {
    const state = userStates.get(ctx.from.id) || {};
    const userId = ctx.from.id;
    const balance = db.getUserBalance(userId);
    const totalPrice = state.totalPrice || 0;

    if (balance >= totalPrice) {
      // Saldo cukup, lanjut beli
      return ctx.editMessageText(
        `💰 *Konfirmasi Pembelian*\n\n` +
        `💳 Saldo Anda: *Rp ${balance.toLocaleString("id-ID")}*\n` +
        `💰 Total Harga: *Rp ${totalPrice.toLocaleString("id-ID")}*\n` +
        `💳 Sisa Saldo: *Rp ${(balance - totalPrice).toLocaleString("id-ID")}*\n\n` +
        `Lanjutkan pembelian?`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("✅ Beli Sekarang", "shop_execute_purchase")],
            [Markup.button.callback("❌ Batal", "shop_menu")],
          ]),
        }
      );
    } else {
      // Saldo tidak cukup
      const kurang = totalPrice - balance;
      return ctx.editMessageText(
        `💰 *Saldo Tidak Cukup*\n\n` +
        `💳 Saldo Anda: *Rp ${balance.toLocaleString("id-ID")}*\n` +
        `💰 Total Harga: *Rp ${totalPrice.toLocaleString("id-ID")}*\n` +
        `❌ Kurang: *Rp ${kurang.toLocaleString("id-ID")}*\n\n` +
        `Silakan deposit terlebih dahulu.`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("💳 Deposit", "shop_deposit")],
            [Markup.button.callback("❌ Batal", "shop_menu")],
          ]),
        }
      );
    }
  });


  // ==================== DEPOSIT ====================
  bot.action("shop_deposit", (ctx) => {
    const state = userStates.get(ctx.from.id) || {};
    userStates.set(ctx.from.id, { ...state, step: "shop_deposit_amount" });
    return ctx.editMessageText(
      `💳 *Deposit Saldo*\n\n` +
      `Masukkan nominal deposit (minimal Rp 1.000):\n\n` +
      `_Contoh: 10000_`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("❌ Batal", "shop_menu")],
        ]),
      }
    );
  });

  // ==================== EKSEKUSI PEMBELIAN ====================
  bot.action("shop_execute_purchase", async (ctx) => {
    const state = userStates.get(ctx.from.id) || {};
    const userId = ctx.from.id;
    const phones = state.selectedPhones || [];
    const totalPrice = state.totalPrice || 0;

    // Deduct balance
    const deductResult = db.deductBalance(userId, totalPrice);
    if (!deductResult.success) {
      return ctx.editMessageText(`❌ ${deductResult.error}`, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("◀️ Kembali", "shop_menu")],
        ]),
      });
    }

    // Process each account
    const results = [];
    for (const phone of phones) {
      const markResult = db.markAccountSold(phone, userId);
      if (markResult.success) {
        results.push(markResult.account);
        db.addPurchaseHistory(userId, { phone, type: "purchase" });
        db.addTransaction({
          userId: userId.toString(),
          type: "purchase",
          phone,
          amount: totalPrice / phones.length,
        });
      }
    }

    if (results.length === 0) {
      // Refund
      db.addBalance(userId, totalPrice);
      return ctx.editMessageText("❌ Gagal membeli akun. Saldo dikembalikan.", {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("◀️ Kembali", "shop_menu")],
        ]),
      });
    }

    // Kirim notifikasi ke channel
    if (config.NOTIFICATION_CHANNEL_ID) {
      try {
        const username = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || userId);
        const isLimited = state.isLimited;
        const tipeAkun = isLimited ? "Limit" : "Aman";
        const firstAcc = results[0];
        const accId = firstAcc.info.id || firstAcc.phone;
        const prefix = (accId + "").charAt(0) || "?";

        // Waktu WIB (UTC+7)
        const now = new Date();
        const wib = new Date(now.getTime() + (7 * 60 * 60 * 1000));
        const timeStr = `${wib.getDate().toString().padStart(2, "0")}/${(wib.getMonth() + 1).toString().padStart(2, "0")}/${wib.getFullYear()} ${wib.getHours().toString().padStart(2, "0")}.${wib.getMinutes().toString().padStart(2, "0")}.${wib.getSeconds().toString().padStart(2, "0")} WIB`;

        const notifText =
          `ORDER NOKTEL SUCCES ✅\n` +
          `──────────────────────\n` +
          `👤 Buyer    : ${username}\n` +
          `📦 Item      : ID ${prefix}\n` +
          `🔢 Amount : ${results.length} account\n` +
          `💰 Total      : Rp ${totalPrice.toLocaleString("id-ID")} (${tipeAkun})\n` +
          `🕒 Time      : ${timeStr}\n` +
          `──────────────────────`;

        await ctx.telegram.sendMessage(config.NOTIFICATION_CHANNEL_ID, notifText);
      } catch (e) {
        // Gagal kirim notifikasi channel, lanjut saja
      }
    }

    // Tampilkan detail akun pertama (satuan) atau semua (bulk)
    if (state.mode === "bulk") {
      return showBulkPurchaseResult(ctx, results, state);
    } else {
      return showSinglePurchaseResult(ctx, results[0], state);
    }
  });


  // ==================== HASIL BELI SATUAN ====================
  function showSinglePurchaseResult(ctx, account, state) {
    const info = account.info || {};
    const limitStatus = info.isLimited ? "Yes" : "No";
    const emailStatus = info.email ? "On ✅" : "Off 🚫";

    const text =
      `📦 *DETAIL AKUN ANDA* 📦\n\n` +
      `👤 Nomor : \`${account.phone}\`\n` +
      `🔑 Password : \`${info.password || "-"}\`\n` +
      `📧 Surel : ${emailStatus}\n` +
      `⚠️ Limit : ${limitStatus}\n\n` +
      `_Gunakan button di bawah untuk mendapatkan OTP login._`;

    userStates.set(ctx.from.id, {
      ...state,
      step: "shop_purchased",
      purchasedPhone: account.phone,
    });

    return ctx.editMessageText(text, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("📩 Get OTP", `shop_get_otp_${account.phone}`)],
        [Markup.button.callback("◀️ Selesai", "user_main_menu")],
      ]),
    });
  }

  // ==================== HASIL BELI BULK ====================
  function showBulkPurchaseResult(ctx, accounts, state) {
    let text = `📦📦 *AKUN ANDA (${accounts.length})* 📦📦\n\n`;
    accounts.forEach((acc, i) => {
      const info = acc.info || {};
      const limitStatus = info.isLimited ? "Yes" : "No";
      const emailStatus = info.email ? "On ✅" : "Off 🚫";
      text += `${i + 1}. \`${acc.phone}\` | 🔑 \`${info.password || "-"}\` | Limit: ${limitStatus} | Surel: ${emailStatus}\n`;
    });
    text += `\n_Pilih akun untuk Get OTP:_`;

    const buttons = accounts.map((acc) => {
      const id = acc.info.id || acc.phone;
      return [Markup.button.callback(`📩 OTP - ${id}`, `shop_get_otp_${acc.phone}`)];
    });
    buttons.push([Markup.button.callback("◀️ Selesai", "user_main_menu")]);

    return ctx.editMessageText(text, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons),
    });
  }


  // ==================== GET OTP (untuk buyer) ====================
  bot.action(/^shop_get_otp_(.+)$/, async (ctx) => {
    const phone = ctx.match[1];
    const state = userStates.get(ctx.from.id) || {};
    userStates.set(ctx.from.id, { ...state, purchasedPhone: phone });

    await ctx.editMessageText(
      `⏳ Mengambil kode OTP dari akun \`${phone}\`...`,
      { parse_mode: "Markdown" }
    );

    const result = await sessionManager.getOTPCode(phone);

    if (result.success) {
      const now = Math.floor(Date.now() / 1000);
      const diffSec = result.msgDate ? now - result.msgDate : null;
      let ageText = "";
      if (diffSec !== null) {
        if (diffSec < 60) ageText = `${diffSec} detik lalu`;
        else if (diffSec < 3600) ageText = `${Math.floor(diffSec / 60)} menit lalu`;
        else ageText = `${Math.floor(diffSec / 3600)} jam lalu`;
      }

      return ctx.editMessageText(
        `📩 *Kode OTP Ditemukan!*\n\n` +
        `📞 Akun: \`${phone}\`\n` +
        `🔑 Kode: \`${result.code}\`\n` +
        (ageText ? `🕐 Diterima: ${ageText}\n` : "") +
        `\n📝 Isi pesan:\n_${result.msgPreview}_`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("🔄 Resend OTP", `shop_get_otp_${phone}`)],
            [Markup.button.callback("✅ Berhasil Login", `shop_login_success_${phone}`)],
            [Markup.button.callback("◀️ Kembali", "user_main_menu")],
          ]),
        }
      );
    } else {
      return ctx.editMessageText(
        `❌ OTP tidak ditemukan:\n\`${result.error}\`\n\n` +
        `_Pastikan sudah request OTP di app Telegram._`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("🔄 Resend OTP", `shop_get_otp_${phone}`)],
            [Markup.button.callback("◀️ Kembali", "user_main_menu")],
          ]),
        }
      );
    }
  });


  // ==================== LOGIN SUCCESS → LOGOUT SESSION BOT ====================
  bot.action(/^shop_login_success_(.+)$/, (ctx) => {
    const phone = ctx.match[1];
    return ctx.editMessageText(
      `✅ *Apakah Anda berhasil login?*\n\n` +
      `📞 Akun: \`${phone}\`\n\n` +
      `• Tekan *"Konfirmasi"* untuk logout session bot (session bot dihapus, Anda tetap login).\n` +
      `• Tekan *"Kembali"* untuk menyimpan session bot (jika ingin login kembali nanti).`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✅ Konfirmasi (Logout Bot)", `shop_logout_bot_${phone}`)],
          [Markup.button.callback("◀️ Kembali (Simpan Session)", "user_main_menu")],
        ]),
      }
    );
  });

  bot.action(/^shop_logout_bot_(.+)$/, async (ctx) => {
    const phone = ctx.match[1];

    await ctx.editMessageText(`⏳ Logout session bot dari \`${phone}\`...`, {
      parse_mode: "Markdown",
    });

    const result = await sessionManager.logoutSession(phone);

    if (result.success) {
      // Hapus juga dari shop accounts (sudah terjual dan selesai)
      userStates.delete(ctx.from.id);
      return ctx.editMessageText(
        `✅ *Selesai!*\n\n` +
        `Session bot untuk \`${phone}\` telah di-logout.\n` +
        `Anda tetap login di device Anda.\n\n` +
        `Terima kasih telah berbelanja! 🎉`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("◀️ Menu Utama", "user_main_menu")],
          ]),
        }
      );
    } else {
      return ctx.editMessageText(
        `❌ Gagal logout bot:\n\`${result.error}\``,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("◀️ Menu Utama", "user_main_menu")],
          ]),
        }
      );
    }
  });


  // ==================== DEPOSIT TEXT HANDLER ====================
  function handleShopText(ctx, userId, state, text) {
    // Deposit amount input
    if (state.step === "shop_deposit_amount") {
      const amount = parseInt(text.replace(/[.,\s]/g, ""));
      if (isNaN(amount) || amount < 1000) {
        return ctx.reply("❌ Minimal deposit Rp 1.000. Masukkan nominal yang valid:");
      }

      const paymentConfig = db.getPaymentConfig();
      const deposit = db.createDeposit(userId, amount, ctx.chat.id);

      userStates.set(userId, { ...state, step: "shop_deposit_proof", depositId: deposit.id, depositAmount: amount });

      let payText = `💳 *Detail Pembayaran*\n\n`;
      payText += `💰 Nominal: *Rp ${amount.toLocaleString("id-ID")}*\n`;
      payText += `🆔 ID Deposit: \`${deposit.id}\`\n\n`;
      payText += `━━━━━━━━━━━━━━━━━━\n`;
      payText += `📱 *Metode Pembayaran:*\n\n`;
      payText += `${paymentConfig.qris}\n`;
      payText += `${paymentConfig.dana}\n`;
      payText += `${paymentConfig.gopay}\n`;
      payText += `━━━━━━━━━━━━━━━━━━\n\n`;
      payText += `⚠️ Transfer sesuai nominal di atas.\n`;
      payText += `📸 Setelah transfer, kirim *screenshot bukti transfer* ke sini.`;

      return ctx.reply(payText, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("❌ Batal", "shop_menu")],
        ]),
      });
    }

    return null;
  }


  // ==================== DEPOSIT PROOF (PHOTO HANDLER) ====================
  function handleShopPhoto(ctx, userId, state) {
    if (state.step !== "shop_deposit_proof") return null;

    const depositId = state.depositId;
    const amount = state.depositAmount;

    // Forward screenshot ke owner
    const ownerChatId = config.OWNER_ID;

    ctx.telegram.sendMessage(
      ownerChatId,
      `💳 *DEPOSIT MASUK*\n\n` +
      `👤 User ID: \`${userId}\`\n` +
      `👤 Nama: ${ctx.from.first_name || ""} ${ctx.from.last_name || ""}\n` +
      `💰 Nominal: *Rp ${amount.toLocaleString("id-ID")}*\n` +
      `🆔 Deposit ID: \`${depositId}\`\n\n` +
      `_Bukti transfer di bawah:_`,
      { parse_mode: "Markdown" }
    );

    // Forward foto
    const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    ctx.telegram.sendPhoto(ownerChatId, photoId, {
      caption: `Bukti deposit dari User ${userId} - Rp ${amount.toLocaleString("id-ID")}`,
      ...Markup.inlineKeyboard([
        [Markup.button.callback("✅ Konfirmasi", `owner_deposit_confirm_${depositId}`)],
        [Markup.button.callback("❌ Gagal/Tolak", `owner_deposit_reject_${depositId}`)],
      ]),
    });

    userStates.set(userId, { ...state, step: "shop_deposit_waiting" });

    return ctx.reply(
      `✅ *Bukti transfer diterima!*\n\n` +
      `Sedang menunggu konfirmasi dari admin.\n` +
      `Anda akan mendapat notifikasi setelah dikonfirmasi.\n\n` +
      `🆔 Deposit ID: \`${depositId}\``,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("◀️ Menu Utama", "user_main_menu")],
        ]),
      }
    );
  }


  // ==================== OWNER: KONFIRMASI/REJECT DEPOSIT ====================
  bot.action(/^owner_deposit_confirm_(.+)$/, async (ctx) => {
    if (ctx.from.id !== config.OWNER_ID) return;
    const depositId = ctx.match[1];
    const result = db.confirmDeposit(depositId);

    if (!result.success) {
      return ctx.answerCbQuery(`❌ ${result.error}`, { show_alert: true });
    }

    const deposit = result.deposit;

    // Notify owner
    await ctx.editMessageCaption(
      `✅ *DEPOSIT DIKONFIRMASI*\n\n` +
      `👤 User: ${deposit.userId}\n` +
      `💰 Nominal: Rp ${deposit.amount.toLocaleString("id-ID")}\n` +
      `💳 Saldo baru user: Rp ${result.newBalance.toLocaleString("id-ID")}`,
      { parse_mode: "Markdown" }
    );

    // Kirim notifikasi deposit ke channel
    if (config.NOTIFICATION_CHANNEL_ID) {
      try {
        let buyerUsername = deposit.userId;
        try {
          const chatMember = await ctx.telegram.getChat(deposit.userId);
          if (chatMember.username) buyerUsername = `@${chatMember.username}`;
          else if (chatMember.first_name) buyerUsername = chatMember.first_name;
        } catch (e) {}

        // Waktu WIB (UTC+7)
        const now = new Date();
        const wib = new Date(now.getTime() + (7 * 60 * 60 * 1000));
        const timeStr = `${wib.getDate().toString().padStart(2, "0")}/${(wib.getMonth() + 1).toString().padStart(2, "0")}/${wib.getFullYear()} ${wib.getHours().toString().padStart(2, "0")}.${wib.getMinutes().toString().padStart(2, "0")}.${wib.getSeconds().toString().padStart(2, "0")} WIB`;

        const notifText =
          `DEPOSIT SALDO SUCCES ✅\n` +
          `──────────────────────\n` +
          `👤 Buyer     : ${buyerUsername}\n` +
          `💰 Deposit : Rp ${deposit.amount.toLocaleString("id-ID")}\n` +
          `🕒 Time      : ${timeStr}\n` +
          `──────────────────────`;

        await ctx.telegram.sendMessage(config.NOTIFICATION_CHANNEL_ID, notifText);
      } catch (e) {
        // Gagal kirim notifikasi channel, lanjut saja
      }
    }

    // Notify user
    try {
      await ctx.telegram.sendMessage(
        deposit.userId,
        `✅ *Deposit Dikonfirmasi!*\n\n` +
        `💰 Nominal: *Rp ${deposit.amount.toLocaleString("id-ID")}*\n` +
        `💳 Saldo Anda sekarang: *Rp ${result.newBalance.toLocaleString("id-ID")}*\n\n` +
        `Silakan lanjutkan belanja! 🛍`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("🛍 Belanja", "shop_menu")],
          ]),
        }
      );
    } catch (e) {}
  });

  bot.action(/^owner_deposit_reject_(.+)$/, async (ctx) => {
    if (ctx.from.id !== config.OWNER_ID) return;
    const depositId = ctx.match[1];
    const result = db.rejectDeposit(depositId);

    if (!result.success) {
      return ctx.answerCbQuery(`❌ ${result.error}`, { show_alert: true });
    }

    const deposit = result.deposit;

    await ctx.editMessageCaption(
      `❌ *DEPOSIT DITOLAK*\n\n` +
      `👤 User: ${deposit.userId}\n` +
      `💰 Nominal: Rp ${deposit.amount.toLocaleString("id-ID")}\n` +
      `_Nominal tidak sesuai dengan transfer._`,
      { parse_mode: "Markdown" }
    );

    // Notify user
    try {
      await ctx.telegram.sendMessage(
        deposit.userId,
        `❌ *Deposit Ditolak*\n\n` +
        `💰 Nominal: *Rp ${deposit.amount.toLocaleString("id-ID")}*\n\n` +
        `Alasan: Nominal yang di-input tidak sesuai dengan yang ditransfer.\n` +
        `Silakan coba deposit ulang dengan nominal yang benar.`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("💳 Deposit Ulang", "shop_deposit")],
          ]),
        }
      );
    } catch (e) {}
  });


  // ==================== USER MAIN MENU ====================
  bot.action("user_main_menu", (ctx) => {
    userStates.delete(ctx.from.id);
    const userId = ctx.from.id;
    const balance = db.getUserBalance(userId);
    const username = ctx.from.username || ctx.from.first_name || "User";

    const now = new Date();
    const dateStr = now.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    return ctx.editMessageText(
      `👋 Ola, *${username}* [OPEN NOKTEL]!\n` +
      `📅 ${dateStr}\n\n` +
      `> 🪪 *MEMBER INFORMATION*\n` +
      `> ━━━━━━━━━━━━━━━━━━\n` +
      `> 🆔 User ID : \`${userId}\`\n` +
      `> 💰 Saldo  : Rp ${balance.toLocaleString("id-ID")}\n` +
      `> 📡 Status : 🟢\n` +
      `> ━━━━━━━━━━━━━━━━━━\n\n` +
      `_Silahkan Pilih Tombol Dibawah:_`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🛍 Belanja", "shop_menu")],
          [
            Markup.button.callback("👤 Profile", "user_profile"),
            Markup.button.callback("📦 Riwayat", "user_history"),
          ],
          [Markup.button.callback("📊 Stok Live", "user_stock")],
        ]),
      }
    );
  });


  // ==================== PROFILE ====================
  bot.action("user_profile", (ctx) => {
    const userId = ctx.from.id;
    const balance = db.getUserBalance(userId);
    const user = db.getUser(userId);
    const totalPurchases = (user.purchases || []).length;

    return ctx.editMessageText(
      `👤 *Profile Anda*\n\n` +
      `🆔 User ID: \`${userId}\`\n` +
      `👤 Nama: ${ctx.from.first_name || ""} ${ctx.from.last_name || ""}\n` +
      `💰 Saldo: *Rp ${balance.toLocaleString("id-ID")}*\n` +
      `📦 Total Pembelian: ${totalPurchases}\n`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("💳 Deposit", "shop_deposit")],
          [Markup.button.callback("◀️ Kembali", "user_main_menu")],
        ]),
      }
    );
  });

  // ==================== RIWAYAT ====================
  bot.action("user_history", (ctx) => {
    const userId = ctx.from.id;
    const transactions = db.getTransactionsByUser(userId);

    if (transactions.length === 0) {
      return ctx.editMessageText("📦 *Riwayat*\n\nBelum ada transaksi.", {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("◀️ Kembali", "user_main_menu")],
        ]),
      });
    }

    let text = "📦 *Riwayat Transaksi*\n\n";
    transactions.slice(-10).reverse().forEach((t, i) => {
      const date = new Date(t.date).toLocaleDateString("id-ID", {
        day: "2-digit", month: "short", year: "numeric"
      });
      const type = t.type === "purchase" ? "🛍 Beli" : "💳 Deposit";
      text += `${i + 1}. ${type} | Rp ${(t.amount || 0).toLocaleString("id-ID")} | ${date}\n`;
    });

    return ctx.editMessageText(text, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("◀️ Kembali", "user_main_menu")],
      ]),
    });
  });

  // ==================== STOK LIVE ====================
  bot.action("user_stock", (ctx) => {
    const available = db.getAvailableAccounts();
    const prices = db.getPrices();
    const prefixes = db.getAvailablePrefixes();

    let text = "📊 *Stok Live*\n\n";
    if (prefixes.length === 0) {
      text += "_Belum ada stok tersedia._";
    } else {
      prefixes.forEach((p) => {
        const safeCount = db.getAccountsByPrefix(p, false).length;
        const limitCount = db.getAccountsByPrefix(p, true).length;
        const priceData = prices[p] || { limit: 2500, aman: 4000 };
        const limitPrice = (typeof priceData === "object") ? priceData.limit : priceData;
        const amanPrice = (typeof priceData === "object") ? priceData.aman : priceData;
        text += `🆔 ID ${p}\n`;
        text += `   ✅ Aman: ${safeCount} akun - Rp ${amanPrice.toLocaleString("id-ID")}\n`;
        text += `   🚫 Limit: ${limitCount} akun - Rp ${limitPrice.toLocaleString("id-ID")}\n\n`;
      });
      text += `📦 Total stok: ${available.length} akun`;
    }

    return ctx.editMessageText(text, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🛍 Belanja", "shop_menu")],
        [Markup.button.callback("◀️ Kembali", "user_main_menu")],
      ]),
    });
  });

  return { handleShopText, handleShopPhoto };
}

module.exports = { registerShopHandlers };
