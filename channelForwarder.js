const sessionManager = require("./sessionManager");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Api } = require("telegram");
const config = require("./config");

// State forwarder
let forwarderState = {
  active: false,
  phone: null,
  channelId: null,
  checkInterval: 30000,
  grupDelay: 1000,
  totalForwarded: 0,
  intervalId: null,
  lastMessageId: null,
  client: null,
  bot: null,
  chatId: null,
};

/**
 * Get current forwarder status
 */
function getForwarderStatus() {
  return {
    active: forwarderState.active,
    phone: forwarderState.phone,
    channelId: forwarderState.channelId,
    checkInterval: forwarderState.checkInterval,
    grupDelay: forwarderState.grupDelay,
    totalForwarded: forwarderState.totalForwarded,
  };
}

/**
 * Start the channel forwarder
 * @param {object} bot - Bot instance (with telegram property)
 * @param {string} phone - Phone number of the account to use
 * @param {string} channelId - Channel ID or username to monitor
 * @param {number} grupDelay - Delay between groups (ms)
 * @param {number} checkInterval - Check interval (ms)
 * @param {number} chatId - Chat ID to send notifications
 */
async function startForwarder(bot, phone, channelId, grupDelay, checkInterval, chatId) {
  try {
    // Stop existing forwarder if any
    if (forwarderState.active) {
      await stopForwarder();
    }

    const sessionString = sessionManager.loadSession(phone);
    if (!sessionString) {
      return { success: false, error: "Session not found for " + phone };
    }

    const client = new TelegramClient(
      new StringSession(sessionString),
      config.API_ID,
      config.API_HASH,
      { connectionRetries: 3, timeout: 30, requestRetries: 3, useWSS: false }
    );
    await client.connect();

    // Resolve channel entity
    let channelEntity;
    try {
      if (channelId.startsWith("-100") || channelId.startsWith("-")) {
        channelEntity = await client.getEntity(BigInt(channelId));
      } else if (channelId.startsWith("@")) {
        channelEntity = await client.getEntity(channelId);
      } else if (channelId.includes("t.me/")) {
        const username = channelId.split("t.me/")[1];
        channelEntity = await client.getEntity(username);
      } else {
        channelEntity = await client.getEntity(channelId);
      }
    } catch (err) {
      await client.disconnect();
      return { success: false, error: "Gagal resolve channel: " + (err.message || err) };
    }

    // Get last message ID to start monitoring from
    const messages = await client.getMessages(channelEntity, { limit: 1 });
    const lastMsgId = messages.length > 0 ? messages[0].id : 0;

    // Update state
    forwarderState = {
      active: true,
      phone,
      channelId,
      checkInterval,
      grupDelay,
      totalForwarded: 0,
      intervalId: null,
      lastMessageId: lastMsgId,
      client,
      bot,
      chatId,
      channelEntity,
    };

    // Start polling
    forwarderState.intervalId = setInterval(() => {
      checkNewMessages();
    }, checkInterval);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.errorMessage || err.message || "Unknown error" };
  }
}

/**
 * Check for new messages and forward to all groups
 */
async function checkNewMessages() {
  if (!forwarderState.active || !forwarderState.client) return;

  try {
    const { client, channelEntity, lastMessageId, grupDelay, bot, chatId } = forwarderState;

    // Get new messages since last check
    const messages = await client.getMessages(channelEntity, {
      minId: lastMessageId,
      limit: 10,
    });

    if (messages.length === 0) return;

    // Sort by ID ascending
    const sorted = messages.sort((a, b) => a.id - b.id);

    // Update last message ID
    forwarderState.lastMessageId = sorted[sorted.length - 1].id;

    // Get all groups
    const dialogs = await client.getDialogs({ limit: 500 });
    const groups = [];
    for (const dialog of dialogs) {
      if (dialog.isGroup || (dialog.entity && dialog.entity.className === "Channel" && dialog.entity.megagroup)) {
        groups.push(dialog);
      }
    }

    // Forward each new message to all groups
    for (const msg of sorted) {
      let forwarded = 0;
      for (let i = 0; i < groups.length; i++) {
        try {
          await client.forwardMessages(groups[i].entity, {
            messages: [msg.id],
            fromPeer: channelEntity,
          });
          forwarded++;
        } catch (e) {
          // skip failed forward
        }
        if (i < groups.length - 1 && grupDelay > 0) {
          await new Promise((r) => setTimeout(r, grupDelay));
        }
      }
      forwarderState.totalForwarded++;

      // Notify owner
      try {
        const telegram = bot.telegram || bot;
        if (telegram && telegram.sendMessage) {
          await telegram.sendMessage(
            chatId,
            `📡 Forward: *${forwarded}/${groups.length}* grup\n` +
            `📨 Total: ${forwarderState.totalForwarded} pesan`,
            { parse_mode: "Markdown" }
          );
        }
      } catch (e) {}
    }
  } catch (err) {
    // Silent fail - will retry next interval
  }
}

/**
 * Stop the forwarder
 */
async function stopForwarder() {
  try {
    if (forwarderState.intervalId) {
      clearInterval(forwarderState.intervalId);
    }

    if (forwarderState.client) {
      try {
        await forwarderState.client.disconnect();
      } catch (e) {}
    }

    const totalForwarded = forwarderState.totalForwarded;

    forwarderState = {
      active: false,
      phone: null,
      channelId: null,
      checkInterval: 30000,
      grupDelay: 1000,
      totalForwarded: 0,
      intervalId: null,
      lastMessageId: null,
      client: null,
      bot: null,
      chatId: null,
    };

    return { success: true, totalForwarded };
  } catch (err) {
    return { success: false, error: err.message || "Unknown error" };
  }
}

module.exports = {
  getForwarderStatus,
  startForwarder,
  stopForwarder,
};
