const fs = require("fs");
const path = require("path");

const DB_DIR = "./data";
const DB_FILES = {
  shopAccounts: path.join(DB_DIR, "shop_accounts.json"), // akun yang dijual
  prices: path.join(DB_DIR, "prices.json"), // harga per ID awalan
  users: path.join(DB_DIR, "users.json"), // saldo & data user
  transactions: path.join(DB_DIR, "transactions.json"), // riwayat transaksi
  deposits: path.join(DB_DIR, "deposits.json"), // pending deposits
};

// Pastikan folder data ada
function ensureDir() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
}

// Helper baca file JSON
function readJSON(filePath, defaultValue = []) {
  ensureDir();
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
    return defaultValue;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    return defaultValue;
  }
}

// Helper tulis file JSON
function writeJSON(filePath, data) {
  ensureDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ==================== HARGA ====================

// Default harga per ID awalan
const DEFAULT_PRICES = {
  "1": 9000,
  "2": 8000,
  "3": 7500,
  "4": 7000,
  "5": 6000,
  "6": 6000,
  "7": 5000,
  "8": 4000,
};

function getPrices() {
  const prices = readJSON(DB_FILES.prices, null);
  if (!prices || Object.keys(prices).length === 0) {
    writeJSON(DB_FILES.prices, DEFAULT_PRICES);
    return { ...DEFAULT_PRICES };
  }
  return prices;
}

function setPrice(idPrefix, price) {
  const prices = getPrices();
  prices[idPrefix] = price;
  writeJSON(DB_FILES.prices, prices);
  return prices;
}

function getPrice(idPrefix) {
  const prices = getPrices();
  return prices[idPrefix] || prices["8"] || 4000; // fallback ke harga terendah
}

// ==================== AKUN SHOP ====================

/**
 * Tambah akun ke daftar jual
 * @param {string} phone - nomor telepon akun
 * @param {object} info - info akun (id, firstName, password, isLimited, email)
 */
function addShopAccount(phone, info = {}) {
  const accounts = readJSON(DB_FILES.shopAccounts);
  // Cek duplikat
  if (accounts.find((a) => a.phone === phone)) {
    return { success: false, error: "Akun sudah ada di daftar jual" };
  }
  accounts.push({
    phone,
    info,
    addedAt: new Date().toISOString(),
    sold: false,
    soldTo: null,
    soldAt: null,
  });
  writeJSON(DB_FILES.shopAccounts, accounts);
  return { success: true };
}

/**
 * Ambil semua akun yang dijual (belum terjual)
 */
function getAvailableAccounts() {
  const accounts = readJSON(DB_FILES.shopAccounts);
  return accounts.filter((a) => !a.sold);
}

/**
 * Ambil akun yang dijual berdasarkan filter limit
 * @param {boolean} isLimited - true = limit, false = aman
 */
function getAccountsByLimit(isLimited) {
  const available = getAvailableAccounts();
  return available.filter((a) => {
    if (isLimited) return a.info.isLimited === true;
    return a.info.isLimited === false;
  });
}

/**
 * Ambil akun berdasarkan awalan ID
 * @param {string} prefix - digit awalan (misal "1")
 * @param {boolean|null} isLimited - filter limit
 */
function getAccountsByPrefix(prefix, isLimited = null) {
  let accounts;
  if (isLimited !== null) {
    accounts = getAccountsByLimit(isLimited);
  } else {
    accounts = getAvailableAccounts();
  }
  return accounts.filter((a) => {
    const id = a.info.id || "";
    return id.startsWith(prefix);
  });
}

/**
 * Ambil semua prefix ID yang tersedia
 */
function getAvailablePrefixes(isLimited = null) {
  let accounts;
  if (isLimited !== null) {
    accounts = getAccountsByLimit(isLimited);
  } else {
    accounts = getAvailableAccounts();
  }
  const prefixes = new Set();
  accounts.forEach((a) => {
    const id = a.info.id || "";
    if (id.length > 0) {
      prefixes.add(id.charAt(0));
    }
  });
  return Array.from(prefixes).sort();
}

/**
 * Tandai akun sebagai terjual
 */
function markAccountSold(phone, buyerUserId) {
  const accounts = readJSON(DB_FILES.shopAccounts);
  const idx = accounts.findIndex((a) => a.phone === phone && !a.sold);
  if (idx === -1) return { success: false, error: "Akun tidak ditemukan atau sudah terjual" };

  accounts[idx].sold = true;
  accounts[idx].soldTo = buyerUserId;
  accounts[idx].soldAt = new Date().toISOString();
  writeJSON(DB_FILES.shopAccounts, accounts);
  return { success: true, account: accounts[idx] };
}

/**
 * Ambil akun berdasarkan phone
 */
function getShopAccount(phone) {
  const accounts = readJSON(DB_FILES.shopAccounts);
  return accounts.find((a) => a.phone === phone) || null;
}

/**
 * Hapus akun dari daftar jual
 */
function removeShopAccount(phone) {
  let accounts = readJSON(DB_FILES.shopAccounts);
  const before = accounts.length;
  accounts = accounts.filter((a) => a.phone !== phone);
  writeJSON(DB_FILES.shopAccounts, accounts);
  return accounts.length < before;
}

// ==================== USER / SALDO ====================

function getUser(userId) {
  const users = readJSON(DB_FILES.users, {});
  return users[userId.toString()] || { balance: 0, purchases: [] };
}

function setUser(userId, userData) {
  const users = readJSON(DB_FILES.users, {});
  users[userId.toString()] = userData;
  writeJSON(DB_FILES.users, users);
}

function getUserBalance(userId) {
  const user = getUser(userId);
  return user.balance || 0;
}

function addBalance(userId, amount) {
  const users = readJSON(DB_FILES.users, {});
  const uid = userId.toString();
  if (!users[uid]) users[uid] = { balance: 0, purchases: [] };
  users[uid].balance = (users[uid].balance || 0) + amount;
  writeJSON(DB_FILES.users, users);
  return users[uid].balance;
}

function deductBalance(userId, amount) {
  const users = readJSON(DB_FILES.users, {});
  const uid = userId.toString();
  if (!users[uid]) users[uid] = { balance: 0, purchases: [] };
  if (users[uid].balance < amount) return { success: false, error: "Saldo tidak cukup" };
  users[uid].balance -= amount;
  writeJSON(DB_FILES.users, users);
  return { success: true, newBalance: users[uid].balance };
}

function addPurchaseHistory(userId, purchaseData) {
  const users = readJSON(DB_FILES.users, {});
  const uid = userId.toString();
  if (!users[uid]) users[uid] = { balance: 0, purchases: [] };
  if (!users[uid].purchases) users[uid].purchases = [];
  users[uid].purchases.push({
    ...purchaseData,
    date: new Date().toISOString(),
  });
  writeJSON(DB_FILES.users, users);
}

// ==================== DEPOSIT ====================

function createDeposit(userId, amount, chatId) {
  const deposits = readJSON(DB_FILES.deposits);
  const deposit = {
    id: `DEP${Date.now()}`,
    userId: userId.toString(),
    amount,
    chatId,
    status: "pending", // pending, confirmed, rejected
    createdAt: new Date().toISOString(),
    confirmedAt: null,
  };
  deposits.push(deposit);
  writeJSON(DB_FILES.deposits, deposits);
  return deposit;
}

function getPendingDeposits() {
  const deposits = readJSON(DB_FILES.deposits);
  return deposits.filter((d) => d.status === "pending");
}

function confirmDeposit(depositId) {
  const deposits = readJSON(DB_FILES.deposits);
  const idx = deposits.findIndex((d) => d.id === depositId);
  if (idx === -1) return { success: false, error: "Deposit tidak ditemukan" };

  deposits[idx].status = "confirmed";
  deposits[idx].confirmedAt = new Date().toISOString();
  writeJSON(DB_FILES.deposits, deposits);

  // Tambah saldo user
  const newBalance = addBalance(deposits[idx].userId, deposits[idx].amount);
  return { success: true, deposit: deposits[idx], newBalance };
}

function rejectDeposit(depositId) {
  const deposits = readJSON(DB_FILES.deposits);
  const idx = deposits.findIndex((d) => d.id === depositId);
  if (idx === -1) return { success: false, error: "Deposit tidak ditemukan" };

  deposits[idx].status = "rejected";
  deposits[idx].confirmedAt = new Date().toISOString();
  writeJSON(DB_FILES.deposits, deposits);
  return { success: true, deposit: deposits[idx] };
}

function getDepositById(depositId) {
  const deposits = readJSON(DB_FILES.deposits);
  return deposits.find((d) => d.id === depositId) || null;
}

// ==================== TRANSAKSI ====================

function addTransaction(data) {
  const transactions = readJSON(DB_FILES.transactions);
  transactions.push({
    ...data,
    id: `TXN${Date.now()}`,
    date: new Date().toISOString(),
  });
  writeJSON(DB_FILES.transactions, transactions);
}

function getTransactionsByUser(userId) {
  const transactions = readJSON(DB_FILES.transactions);
  return transactions.filter((t) => t.userId === userId.toString());
}

// ==================== PAYMENT CONFIG ====================

const PAYMENT_FILE = path.join(DB_DIR, "payment_config.json");

const DEFAULT_PAYMENT = {
  qris: "- QRIS: (Atur QRIS statis kamu di sini)",
  dana: "- Dana: (Atur nomor Dana kamu di sini)",
  gopay: "- GoPay: (Atur nomor GoPay kamu di sini)",
};

function getPaymentConfig() {
  const config = readJSON(PAYMENT_FILE, null);
  if (!config) {
    writeJSON(PAYMENT_FILE, DEFAULT_PAYMENT);
    return { ...DEFAULT_PAYMENT };
  }
  return config;
}

function setPaymentConfig(config) {
  writeJSON(PAYMENT_FILE, config);
}

// ==================== S&K CONFIG ====================

const TOS_FILE = path.join(DB_DIR, "tos.json");

const DEFAULT_TOS = `📜 *SYARAT & KETENTUAN*

1. Akun yang dibeli tidak bisa dikembalikan (no refund).
2. Segala aktivitas setelah pembelian menjadi tanggung jawab pembeli.
3. Jika akun terkena limit/ban setelah pembelian, bukan tanggung jawab penjual.
4. Dilarang menggunakan akun untuk kegiatan ilegal.
5. Garansi hanya berlaku untuk login pertama kali.

⚠️ Dengan menekan "Konfirmasi", Anda menyetujui seluruh syarat di atas.`;

function getTOS() {
  const data = readJSON(TOS_FILE, null);
  if (!data || !data.text) {
    writeJSON(TOS_FILE, { text: DEFAULT_TOS });
    return DEFAULT_TOS;
  }
  return data.text;
}

function setTOS(text) {
  writeJSON(TOS_FILE, { text });
}

module.exports = {
  // Harga
  getPrices,
  setPrice,
  getPrice,
  DEFAULT_PRICES,

  // Shop Accounts
  addShopAccount,
  getAvailableAccounts,
  getAccountsByLimit,
  getAccountsByPrefix,
  getAvailablePrefixes,
  markAccountSold,
  getShopAccount,
  removeShopAccount,

  // Users
  getUser,
  setUser,
  getUserBalance,
  addBalance,
  deductBalance,
  addPurchaseHistory,

  // Deposits
  createDeposit,
  getPendingDeposits,
  confirmDeposit,
  rejectDeposit,
  getDepositById,

  // Transactions
  addTransaction,
  getTransactionsByUser,

  // Payment Config
  getPaymentConfig,
  setPaymentConfig,

  // TOS
  getTOS,
  setTOS,
};
