const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const mongoose = require('mongoose');
const axios = require('axios');
const nodemailer = require('nodemailer');

const app = express();
const PORT = 7700;

// Direct Working Logo Image URL
const LOGO_URL = "https://i.ibb.co/W45ZtnvZ/8121.jpg";

// MongoDB Atlas Connection Setup
const MONGO_URI = "mongodb+srv://EarnXPro0939:Faraz373737373777@cluster0.end6i26.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected Successfully'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// Mongoose Schema Definitions for Permanent Cloud Storage
const userSchema = new mongoose.Schema({
    uid: { type: String, unique: true },
    username: { type: String, required: true, lowercase: true, trim: true },
    authType: { type: String, default: 'telegram' }, // 'telegram' or 'email'
    name: { type: String, default: '' },
    password: { type: String, required: true },
    rechargeBalance: { type: Number, default: 0 },
    withdrawBalance: { type: Number, default: 0 },
    is_admin: { type: Boolean, default: false },
    bankDetails: {
        name: { type: String, default: '' },
        accNo: { type: String, default: '' },
        ifsc: { type: String, default: '' },
        phone: { type: String, default: '' }
    },
    deposits: [{
        amount: Number,
        utr: String,
        gateway: String,
        screenshotUrl: String,
        status: { type: String, default: 'Pending' },
        date: String
    }],
    withdrawals: [{
        amount: Number,
        bankDetails: Object,
        status: { type: String, default: 'Pending' },
        date: String
    }],
    investments: [{
        productName: String,
        productId: String,
        amount: Number,
        returnAmount: Number,
        endTime: Number,
        status: { type: String, default: 'Active' },
        date: String
    }],
    notifications: [{
        id: String,
        user_id: String,
        title: { type: String, default: 'System Notification' },
        message: String,
        is_read: { type: Boolean, default: false },
        created_at: { type: String, default: () => new Date().toISOString() }
    }],
    referredBy: { type: String, default: null },
    referralCount: { type: Number, default: 0 },
    teamLevel: { type: String, default: 'A' },
    lastCheckInDate: { type: String, default: null }
});

const productSchema = new mongoose.Schema({
    _id: String,
    name: String,
    price: Number,
    returnAmount: Number,
    durationMinutes: Number,
    imageUrl: String
});

const otpSchema = new mongoose.Schema({
    username: { type: String, unique: true, lowercase: true, trim: true },
    otp: String,
    name: String,
    password: String,
    ref: String,
    authType: String,
    type: String
});

const chatIdSchema = new mongoose.Schema({
    username: { type: String, unique: true, lowercase: true, trim: true },
    chatId: Number
});

const User = mongoose.model('User', userSchema);
const Product = mongoose.model('Product', productSchema);
const Otp = mongoose.model('Otp', otpSchema);
const ChatId = mongoose.model('ChatId', chatIdSchema);

// ==========================================
// ⚙️ GMAIL SMTP CONFIGURATION (UPDATED)
// ==========================================
// 💡 Yahan aap apni Gmail aur App Password change kar sakte hain agar zaroorat pade:
const GMAIL_USER = 'farazhashmi.fh098@gmail.com'; 
const GMAIL_PASS = 'fcdtlmnwaclnumei'; // <- Aapki App Password yahan configured hai

const emailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: GMAIL_USER,
        pass: GMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 15000
});

async function sendEmailOTP(recipientEmail, otp, callback) {
    const mailOptions = {
        from: `"EarnX Pro Verification" <${GMAIL_USER}>`,
        to: recipientEmail,
        subject: 'EarnX Pro - Account Verification OTP',
        html: `
            <div style="font-family: Arial, sans-serif; padding: 25px; background-color: #0b0f19; color: #ffffff; border-radius: 12px; border: 1px solid rgba(16, 185, 129, 0.2);">
                <h2 style="color: #10b981; margin-top: 0;">EarnX Pro Verification Code</h2>
                <p style="color: #d1d5db; font-size: 14px;">Your one-time password (OTP) for secure account verification is:</p>
                <div style="margin: 20px 0;">
                    <span style="color: #3b82f6; font-size: 28px; font-weight: bold; letter-spacing: 6px; background: #1f2937; padding: 12px 20px; display: inline-block; border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.3);">${otp}</span>
                </div>
                <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">Do not share this code with anyone. Valid for 10 minutes.</p>
            </div>
        `
    };

    emailTransporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('[GMAIL SEND ERROR]:', error.message);
            callback(false);
        } else {
            console.log('[GMAIL SENT SUCCESS]: OTP successfully sent to ' + recipientEmail);
            callback(true);
        }
    });
}

// List of Rotating UPI IDs for Deposits
const ROTATING_UPI_IDS = [
    'Rohit.m820@ptaxis',
    '6377833820-2.wallet@phonepe',
    '7071088675@mbk',
    '7071088675@mbkns',
    '7071088675-3@ybl',
    'rubeena.rashid@ptyes'
];

function getRandomUpiId() {
    const randomIndex = Math.floor(Math.random() * ROTATING_UPI_IDS.length);
    return ROTATING_UPI_IDS[randomIndex];
}

// Ensure uploads directory exists for screenshots
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

async function ensureDefaultAdmin() {
    try {
        const admin = await User.findOne({ is_admin: true });
        if (!admin) {
            await User.create({
                uid: 'UID10001',
                username: '@7071088675',
                authType: 'telegram',
                name: 'Admin',
                password: 'Faraz78678678690786',
                rechargeBalance: 0,
                withdrawBalance: 0,
                is_admin: true,
                bankDetails: { name: '', accNo: '', ifsc: '', phone: '' },
                deposits: [],
                withdrawals: [],
                investments: [],
                notifications: [],
                referredBy: null,
                referralCount: 0,
                teamLevel: 'A',
                lastCheckInDate: null
            });
            console.log('[MONGODB] Default Admin created successfully.');
        }
    } catch (err) {
        console.error('[MONGODB ADMIN ERROR]:', err.message);
    }
}
setTimeout(ensureDefaultAdmin, 2000);

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR);
    },
    filename: function (req, file, cb) {
        cb(null, 'deposit_' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }
});

const TELEGRAM_BOT_TOKEN = '8808651451:AAGvbN8t1_CstrgvukjMqABd5D6i5138Z54';
const RENDER_DOMAIN = 'https://earnxpro-1.onrender.com';

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.post('/telegram-webhook', async (req, res) => {
    try {
        const update = req.body;
        const msg = update.message || update.edited_message;
        if (msg && msg.from) {
            const rawUsername = msg.from.username;
            const chatId = msg.from.id;
            if (rawUsername) {
                const formattedUsername = '@' + rawUsername.toLowerCase();
                await ChatId.findOneAndUpdate(
                    { username: formattedUsername },
                    { chatId },
                    { upsert: true, new: true }
                );
                console.log(`[WEBHOOK SUCCESS] Captured Chat ID ${chatId} for ${formattedUsername}`);

                if (msg.text && msg.text.startsWith('/start')) {
                    axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                        chat_id: chatId,
                        text: `*Welcome to EarnX Pro Official OTP Verification Bot!*\n\nYour account is now verified and linked with username *${formattedUsername}*. You will receive your OTPs here directly.`,
                        parse_mode: 'Markdown'
                    }).catch(e => console.error('[BOT AUTO REPLY ERROR]:', e.message));
                }
            }
        }
    } catch (err) {
        console.error('[WEBHOOK PROCESS ERROR]:', err.message);
    }
    res.sendStatus(200);
});

async function setupTelegramWebhook() {
    try {
        const webhookUrl = `${RENDER_DOMAIN}/telegram-webhook`;
        const setUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${webhookUrl}`;
        const response = await axios.get(setUrl);
        console.log('[TELEGRAM WEBHOOK CONFIG]:', response.data.description || 'Webhook Configured');
    } catch (err) {
        console.error('[TELEGRAM WEBHOOK ERROR]:', err.message);
    }
}

async function sendRealOTP(username, otp, callback) {
    try {
        let chatIdRecord = await ChatId.findOne({ username: username.toLowerCase() });
        let targetChatId = chatIdRecord ? chatIdRecord.chatId : null;

        if (!targetChatId) {
            try {
                const updatesUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`;
                const res = await axios.get(updatesUrl);
                const results = res.data.result || [];
                
                for (let update of results) {
                    const msg = update.message || update.edited_message;
                    if (msg && msg.from) {
                        const fromUsername = '@' + (msg.from.username || '').toLowerCase();
                        const chatId = msg.from.id;
                        if (fromUsername) {
                            await ChatId.findOneAndUpdate(
                                { username: fromUsername },
                                { chatId },
                                { upsert: true, new: true }
                            );
                            if (fromUsername === username.toLowerCase()) {
                                targetChatId = chatId;
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('[TELEGRAM GET UPDATES ERROR]:', err.message);
            }
        }

        if (!targetChatId) {
            console.log(`[TELEGRAM ERROR] Chat ID not found for ${username}. User must start bot @EarnXPro_09bot first.`);
            callback(false);
            return;
        }

        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const messageText = `*EarnX Pro Verification Code*\n\nYour OTP is: *${otp}*\nPlease do not share this code with anyone.`;

        await axios.post(url, {
            chat_id: targetChatId,
            text: messageText,
            parse_mode: 'Markdown'
        });
        console.log(`[TELEGRAM SENT] OTP ${otp} successfully sent to ${username} (Chat ID: ${targetChatId})`);
        callback(true);
    } catch (error) {
        console.error('[TELEGRAM SEND ERROR]:', error.response?.data || error.message);
        callback(false);
    }
}

setInterval(async () => {
    try {
        const now = Date.now();
        const users = await User.find({ "investments.status": "Active" });
        
        for (let user of users) {
            let updated = false;
            user.investments.forEach(inv => {
                if (inv.status === 'Active' && now >= inv.endTime) {
                    inv.status = 'Completed';
                    const totalReturn = inv.returnAmount || inv.amount;
                    user.withdrawBalance += totalReturn;
                    updated = true;
                }
            });
            if (updated) {
                await user.save();
            }
        }
    } catch (err) {
        console.error('[INVESTMENT TIMER ERROR]:', err.message);
    }
}, 10000);

app.use(session({
    secret: 'earnxpro_super_secret_key',
    resave: false,
    saveUninitialized: false
}));

app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// Layout Template
function renderLayout(title, content, user, req) {
    let bottomNav = '';
    let topHeaderRight = '';

    let showChannelModal = false;
    if (req && !req.session.modalShown) {
        showChannelModal = true;
        req.session.modalShown = true;
    }

    if (user) {
        topHeaderRight = `<a href="/logout" class="text-red-400 font-semibold px-3 py-1 bg-gray-800/80 hover:bg-red-500/20 rounded-lg text-xs border border-red-500/30 transition-all">Logout</a>`;
        if (user.is_admin) {
            bottomNav = `
                <div class="bg-gray-900/90 backdrop-blur-md border-t border-gray-800 py-3 px-4 flex justify-around items-center fixed bottom-0 left-0 right-0 shadow-2xl z-40">
                    <a href="/admin" class="text-yellow-400 font-bold text-xs flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 rounded-lg border border-yellow-500/30">🛡 Admin Panel</a>
                    <a href="/logout" class="text-red-400 font-bold text-xs flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 rounded-lg border border-red-500/30">Logout</a>
                </div>
            `;
        } else {
            bottomNav = `
                <div class="bg-gray-900/90 backdrop-blur-md border-t border-gray-800 py-2.5 px-4 flex justify-around items-center fixed bottom-0 left-0 right-0 shadow-2xl z-40">
                    <a href="/home" class="text-green-400 font-bold text-xs flex flex-col items-center gap-0.5"><span class="text-lg">🏠</span> Home</a>
                    <a href="/invest" class="text-yellow-400 font-bold text-xs flex flex-col items-center gap-0.5"><span class="text-lg">📈</span> Invest</a>
                    <a href="/team" class="text-blue-400 font-bold text-xs flex flex-col items-center gap-0.5"><span class="text-lg">👥</span> Team</a>
                    <a href="/account" class="text-purple-400 font-bold text-xs flex flex-col items-center gap-0.5"><span class="text-lg">👤</span> Account</a>
                </div>
            `;
        }
    } else {
        topHeaderRight = `
            <a href="/login" class="text-gray-300 font-semibold text-xs px-3 py-1.5 bg-gray-800/80 rounded-lg border border-gray-700 hover:border-gray-500 transition-all">Login</a>
            <a href="/signup" class="bg-gradient-to-r from-green-600 to-emerald-500 px-3.5 py-1.5 rounded-lg text-white font-bold text-xs shadow-lg shadow-green-500/20 hover:scale-105 transition-all">Register</a>
        `;
    }

    const channelModalHtml = `
        <div id="channelModal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 ${showChannelModal ? '' : 'hidden'}">
            <div class="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl relative overflow-hidden">
                <div class="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl"></div>
                <div class="w-16 h-16 bg-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold shadow-inner">📢</div>
                <h3 class="text-xl font-extrabold text-white">Join Our Official Channel</h3>
                <p class="text-xs text-gray-300 leading-relaxed">Stay updated with verified payment proofs, strategic announcements, and latest platform security updates!</p>
                <a href="https://telegram.me/EarnXProo" target="_blank" onclick="closeChannelModal()" class="block w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 rounded-xl text-sm shadow-lg shadow-blue-500/25 transition-all">Follow Us on Telegram</a>
                <button onclick="closeChannelModal()" class="text-xs text-gray-400 underline hover:text-white transition-colors">Continue to Platform</button>
            </div>
        </div>
        <script>
            function closeChannelModal() {
                document.getElementById('channelModal').classList.add('hidden');
            }
        </script>
    `;

    return `
    <!DOCTYPE html>
    <html lang="en" class="dark">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} - EarnX Pro | Secure Financial Ecosystem</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            body {
                background: radial-gradient(circle at 50% 0%, #111c2e 0%, #0b0f19 70%);
                background-attachment: fixed;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            .account-container {
                padding: 16px;
                max-width: 480px;
                margin: auto;
            }
            .user-id-card {
                background: linear-gradient(135deg, rgba(22, 27, 34, 0.95) 0%, rgba(31, 36, 45, 0.95) 100%);
                backdrop-filter: blur(12px);
                border: 1px solid rgba(56, 189, 248, 0.2);
                box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1);
                padding: 18px;
                border-radius: 16px;
                margin-bottom: 16px;
            }
            .balance-cards-grid {
                display: flex;
                gap: 12px;
                margin-bottom: 20px;
            }
            .balance-card {
                flex: 1;
                background: linear-gradient(135deg, rgba(22, 27, 34, 0.9) 0%, rgba(15, 23, 42, 0.9) 100%);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(56, 189, 248, 0.15);
                padding: 16px;
                border-radius: 14px;
                text-align: center;
                box-shadow: 0 8px 25px rgba(0,0,0,0.3);
            }
            .balance-card.recharge .currency { color: #00e676; font-size: 22px; font-weight: 800; text-shadow: 0 0 20px rgba(0,230,118,0.3); }
            .balance-card.withdraw .currency { color: #b388ff; font-size: 22px; font-weight: 800; text-shadow: 0 0 20px rgba(179,136,255,0.3); }
            .action-buttons-stack button, .action-buttons-stack a {
                display: block;
                width: 100%;
                padding: 14px;
                margin-bottom: 10px;
                border-radius: 12px;
                border: none;
                font-weight: 700;
                cursor: pointer;
                font-size: 15px;
                text-align: center;
                text-decoration: none;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                transition: transform 0.1s ease, filter 0.2s ease;
            }
            .action-buttons-stack button:active, .action-buttons-stack a:active {
                transform: scale(0.98);
            }
            .deposit-btn { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #fff; }
            .withdraw-btn { background: linear-gradient(135deg, #7c3aed, #6d28d9); color: #fff; }
            .btn-support { background: linear-gradient(135deg, #d97706, #b45309); color: #fff; }
            .menu-link-btn {
                background: linear-gradient(135deg, rgba(22, 27, 34, 0.9), rgba(15, 23, 42, 0.9));
                backdrop-filter: blur(10px);
                border: 1px solid rgba(56, 189, 248, 0.15);
                color: #fff;
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 15px 18px;
                border-radius: 14px;
                margin-bottom: 10px;
                font-weight: 600;
                font-size: 14px;
                text-decoration: none;
                transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            }
            .menu-link-btn:hover {
                background: linear-gradient(135deg, rgba(31, 36, 45, 0.95), rgba(30, 41, 59, 0.95));
                border-color: rgba(56, 189, 248, 0.4);
                transform: translateY(-1px);
                box-shadow: 0 6px 20px rgba(0,0,0,0.3);
            }
            .deposit-warning {
                background: rgba(210, 153, 34, 0.1);
                border: 1px solid rgba(210, 153, 34, 0.3);
                border-left: 4px solid #d29922;
                color: #f6ad55;
                padding: 12px;
                font-size: 12px;
                border-radius: 8px;
                margin-bottom: 16px;
                line-height: 1.5;
            }
            .locked-bank-box {
                background: rgba(22, 27, 34, 0.9);
                border: 1px solid rgba(46, 160, 67, 0.5);
                padding: 14px;
                border-radius: 12px;
                margin-bottom: 16px;
            }
            .lock-badge {
                color: #2ea043;
                font-size: 12px;
                font-weight: 700;
            }
            .withdrawal-history-card {
                background: rgba(30, 34, 45, 0.85);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(42, 46, 57, 0.9);
                border-radius: 12px;
                padding: 14px 16px;
                margin-bottom: 12px;
                color: #fff;
                font-size: 13px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            }
            .history-row {
                display: flex;
                justify-content: space-between;
                margin-bottom: 4px;
            }
            .final-amount {
                font-weight: 700;
                border-top: 1px solid rgba(42, 46, 57, 0.8);
                padding-top: 8px;
                margin-top: 8px;
                color: #00e676;
            }
            .history-meta {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 8px;
                color: #9e9e9e;
                font-size: 12px;
            }
            .history-date {
                font-size: 11px;
                color: #757575;
                margin-top: 3px;
            }
            .status.completed {
                color: #00e676;
                font-weight: 700;
            }
        </style>
    </head>
    <body class="text-gray-100 min-h-screen flex flex-col justify-between pb-24 selection:bg-blue-500 selection:text-white">
        ${channelModalHtml}
        <header class="bg-gray-900/90 backdrop-blur-xl border-b border-gray-800 p-3 flex justify-between items-center sticky top-0 z-40 shadow-2xl">
            <a href="/" class="flex items-center gap-2.5 group">
                <div class="relative w-10 h-10 rounded-xl overflow-hidden shadow-lg shadow-emerald-500/30 group-hover:scale-105 transition-transform border border-emerald-500/30">
                    <img src="${LOGO_URL}" alt="EarnX Pro Logo" class="w-full h-full object-cover">
                </div>
                <div class="flex flex-col">
                    <span class="text-lg font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-100 to-emerald-400">EarnX <span class="text-cyan-400 font-extrabold">Pro</span></span>
                </div>
            </a>
            <div class="flex items-center gap-2">
                <span class="hidden sm:inline-flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-semibold">🔒 256-Bit SSL</span>
                <nav class="flex items-center space-x-3">
                    ${topHeaderRight}
                </nav>
            </div>
        </header>
        <main class="flex-grow p-4 max-w-lg mx-auto w-full animate-fade-in" id="mainContainer">
            ${content}
        </main>
        ${bottomNav}
        <footer class="bg-gray-900/90 border-t border-gray-800 text-center py-4 text-xs text-gray-400 mb-12 space-y-1 backdrop-blur-md">
            <p class="text-emerald-400/80 font-medium">🛡️ Secure Encrypted Financial Ecosystem</p>
            <p>&copy; 2026 EarnX Pro. All rights reserved.</p>
        </footer>
    </body>
    </html>`;
}

// Routes
app.get('/', (req, res) => {
    if (req.session.user) {
        return res.redirect(req.session.user.is_admin ? '/admin' : '/home');
    }
    res.redirect('/login');
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        res.redirect('/login');
    });
});

// Login Page with Remember Me Feature & Dual Support
app.get('/login', (req, res) => {
    req.session.modalShown = false;
    const formHtml = `
        <div class="bg-gray-900/90 backdrop-blur-2xl p-6 rounded-3xl shadow-2xl border border-gray-800/80 mt-6 relative overflow-hidden">
            <div class="absolute -top-16 -right-16 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl"></div>
            <div class="flex items-center justify-center mb-6">
                <div class="inline-flex items-center gap-3 bg-gray-900/95 backdrop-blur-xl border border-gray-800 px-5 py-2.5 rounded-2xl shadow-xl">
                    <div class="relative w-11 h-11 rounded-xl overflow-hidden shadow-lg shadow-emerald-500/30 border border-emerald-500/30">
                        <img src="${LOGO_URL}" alt="EarnX Pro Logo" class="w-full h-full object-cover">
                    </div>
                    <div class="flex flex-col text-left">
                        <span class="text-xl font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-100 to-emerald-400">
                            EarnX <span class="text-cyan-400 font-extrabold">Pro</span>
                        </span>
                        <span class="text-[9px] uppercase tracking-widest text-emerald-400/80 font-bold -mt-1">Secure Ecosystem</span>
                    </div>
                </div>
            </div>
            <h2 class="text-2xl font-black text-center text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500 mb-6">Welcome Back</h2>
            <form action="/login" method="POST" id="loginForm" class="space-y-4">
                <div>
                    <label class="block text-xs font-semibold text-gray-400 mb-1">Telegram (@username) or Email Address</label>
                    <input type="text" id="loginUsername" name="username" placeholder="@username or email@gmail.com" required class="w-full bg-gray-800/80 border border-gray-700 rounded-xl p-3 text-white focus:outline-none focus:border-green-500 transition-colors">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-gray-400 mb-1">Password</label>
                    <input type="password" id="loginPassword" name="password" required class="w-full bg-gray-800/80 border border-gray-700 rounded-xl p-3 text-white focus:outline-none focus:border-green-500 transition-colors">
                </div>
                <div class="flex items-center justify-between text-xs text-gray-400">
                    <label class="flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox" id="rememberMe" class="w-4 h-4 rounded bg-gray-800 border-gray-700 text-green-500 focus:ring-0 focus:ring-offset-0">
                        <span>Remember Me</span>
                    </label>
                    <a href="/forgot-password" class="text-yellow-400 hover:underline">Forgot Password?</a>
                </div>
                <button type="submit" class="w-full bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 text-white font-bold p-3 rounded-xl shadow-lg shadow-green-500/20 transition-all">Secure Login</button>
            </form>
            <div class="flex justify-center items-center text-xs mt-5 pt-4 border-t border-gray-800">
                <a href="/signup" class="text-green-400 font-bold hover:underline">Create Account</a>
            </div>
        </div>

        <script>
            document.addEventListener("DOMContentLoaded", () => {
                const savedUsername = localStorage.getItem("earnx_username");
                const savedPassword = localStorage.getItem("earnx_password");
                const rememberMeInput = document.getElementById("rememberMe");
                const usernameInput = document.getElementById("loginUsername");
                const passwordInput = document.getElementById("loginPassword");

                if (savedUsername && savedPassword) {
                    usernameInput.value = savedUsername;
                    passwordInput.value = savedPassword;
                    rememberMeInput.checked = true;
                }

                document.getElementById("loginForm").addEventListener("submit", () => {
                    if (rememberMeInput.checked) {
                        localStorage.setItem("earnx_username", usernameInput.value);
                        localStorage.setItem("earnx_password", passwordInput.value);
                    } else {
                        localStorage.removeItem("earnx_username");
                        localStorage.removeItem("earnx_password");
                    }
                });
            });
        </script>
    `;
    res.send(renderLayout('Login', formHtml, req.session.user, req));
});

app.post('/login', async (req, res) => {
    let { username, password } = req.body;
    username = username.trim().toLowerCase();
    if (!username.includes('@') && !username.includes('.')) {
        username = '@' + username;
    }
    
    const user = await User.findOne({ username, password });
    if (user) {
        req.session.user = user;
        req.session.modalShown = false;
        return res.redirect(user.is_admin ? '/admin' : '/home');
    }
    res.send(renderLayout('Login', `<p class="text-red-500 text-center font-bold">Invalid Username or Password</p><br><a href="/login" class="text-blue-400 block text-center text-sm underline">Try Again</a>`, null, req));
});

// Signup with Dual Support (Email or Telegram)
app.get('/signup', (req, res) => {
    req.session.modalShown = false;
    const refCode = req.query.ref || '';
    const formHtml = `
        <div class="bg-gray-900/90 backdrop-blur-2xl p-6 rounded-3xl shadow-2xl border border-gray-800/80 mt-6 relative overflow-hidden">
            <div class="absolute -top-16 -right-16 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl"></div>
            <div class="flex items-center justify-center mb-6">
                <div class="inline-flex items-center gap-3 bg-gray-900/95 backdrop-blur-xl border border-gray-800 px-5 py-2.5 rounded-2xl shadow-xl">
                    <div class="relative w-11 h-11 rounded-xl overflow-hidden shadow-lg shadow-emerald-500/30 border border-emerald-500/30">
                        <img src="${LOGO_URL}" alt="EarnX Pro Logo" class="w-full h-full object-cover">
                    </div>
                    <div class="flex flex-col text-left">
                        <span class="text-xl font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-100 to-emerald-400">
                            EarnX <span class="text-cyan-400 font-extrabold">Pro</span>
                        </span>
                        <span class="text-[9px] uppercase tracking-widest text-emerald-400/80 font-bold -mt-1">Secure Ecosystem</span>
                    </div>
                </div>
            </div>
            <h2 class="text-2xl font-black text-center text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500 mb-6">Create Secure Account</h2>
            
            <div class="flex justify-center gap-2 mb-4">
                <button type="button" onclick="switchTab('email')" id="emailTabBtn" class="flex-1 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white shadow">📧 Register with Email</button>
                <button type="button" onclick="switchTab('telegram')" id="tgTabBtn" class="flex-1 py-2 text-xs font-bold rounded-xl bg-gray-800 text-gray-300 shadow">✈️ Register with Telegram</button>
            </div>

            <form action="/send-signup-otp" method="POST" class="space-y-4">
                <input type="hidden" name="ref" value="${refCode}">
                <input type="hidden" name="authType" id="authTypeInput" value="email">
                <div>
                    <label class="block text-xs font-semibold text-gray-400 mb-1">Your Name</label>
                    <input type="text" name="name" placeholder="Enter Full Name" required class="w-full bg-gray-800/80 border border-gray-700 rounded-xl p-3 text-white focus:outline-none focus:border-green-500 transition-colors">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-gray-400 mb-1" id="usernameLabel">Gmail / Email Address</label>
                    <input type="text" name="username" id="usernameInput" placeholder="yourname@gmail.com" required class="w-full bg-gray-800/80 border border-gray-700 rounded-xl p-3 text-white focus:outline-none focus:border-green-500 transition-colors">
                    <p class="text-[11px] text-yellow-400/90 mt-1.5 leading-relaxed" id="usernameHint">
                        📧 Verification OTP will be sent directly to your Gmail / Email Inbox.
                    </p>
                </div>
                <div>
                    <label class="block text-xs font-semibold text-gray-400 mb-1">Password</label>
                    <input type="password" name="password" required class="w-full bg-gray-800/80 border border-gray-700 rounded-xl p-3 text-white focus:outline-none focus:border-green-500 transition-colors">
                </div>
                ${refCode ? `<p class="text-xs text-yellow-400 bg-yellow-500/10 p-2 rounded-lg border border-yellow-500/20">Referral Code Applied: ${refCode}</p>` : ''}
                <button type="submit" class="w-full bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 text-white font-bold p-3 rounded-xl shadow-lg shadow-green-500/20 transition-all">Send OTP & Register</button>
            </form>
            <p class="text-center text-xs text-gray-400 mt-4">Already have an account? <a href="/login" class="text-green-400 font-bold hover:underline">Login</a></p>
        </div>

        <script>
            function switchTab(type) {
                const authInput = document.getElementById('authTypeInput');
                const label = document.getElementById('usernameLabel');
                const input = document.getElementById('usernameInput');
                const hint = document.getElementById('usernameHint');
                const emailBtn = document.getElementById('emailTabBtn');
                const tgBtn = document.getElementById('tgTabBtn');

                if (type === 'email') {
                    authInput.value = 'email';
                    label.innerText = 'Gmail / Email Address';
                    input.placeholder = 'yourname@gmail.com';
                    hint.innerHTML = '📧 Verification OTP will be sent directly to your Gmail / Email Inbox.';
                    emailBtn.className = 'flex-1 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white shadow';
                    tgBtn.className = 'flex-1 py-2 text-xs font-bold rounded-xl bg-gray-800 text-gray-300 shadow';
                } else {
                    authInput.value = 'telegram';
                    label.innerText = 'Telegram Username';
                    input.placeholder = '@yourusername';
                    hint.innerHTML = '⚠️ Start bot <a href="https://telegram.me/EarnXPro_09bot" target="_blank" class="underline font-bold text-white">@EarnXPro_09bot</a> first to receive Telegram OTP.';
                    tgBtn.className = 'flex-1 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white shadow';
                    emailBtn.className = 'flex-1 py-2 text-xs font-bold rounded-xl bg-gray-800 text-gray-300 shadow';
                }
            }
        </script>
    `;
    res.send(renderLayout('Sign Up', formHtml, req.session.user, req));
});

app.get('/send-signup-otp', (req, res) => {
    res.redirect('/signup');
});

app.post('/send-signup-otp', async (req, res) => {
    let { username, name, password, ref, authType } = req.body;
    username = username.trim().toLowerCase();
    if (authType === 'telegram' && !username.startsWith('@')) username = '@' + username;

    const existingUser = await User.findOne({ username });
    if (existingUser) {
        return res.send(renderLayout('Error', `<p class="text-red-500 text-center font-bold">Account (${username}) already registered!</p><br><a href="/signup" class="text-blue-400 block text-center text-sm underline">Back</a>`, null, req));
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await Otp.findOneAndUpdate(
        { username },
        { otp, name, password, ref, authType, type: 'signup' },
        { upsert: true, new: true }
    );

    const handleOtpResult = (success) => {
        if (!success) {
            return res.send(renderLayout('Error', `<p class="text-red-500 text-center font-bold">Could not send OTP via ${authType}! Please check your credentials and try again.</p><br><a href="/signup" class="text-blue-400 block text-center text-sm underline">Back</a>`, null, req));
        }
        const verifyHtml = `
            <div class="bg-gray-900/90 backdrop-blur-2xl p-6 rounded-3xl shadow-2xl border border-gray-800 mt-10 text-center">
                <h2 class="text-2xl font-black text-green-400 mb-3">Verify OTP Code</h2>
                <p class="text-xs text-gray-400 mb-6">Verification code sent via <b>${authType.toUpperCase()}</b> to: <b>${username}</b></p>
                <form action="/verify-signup-otp" method="POST" class="space-y-4">
                    <input type="hidden" name="username" value="${username}">
                    <input type="text" name="otp" required maxlength="6" placeholder="Enter 6-digit OTP" class="w-full bg-gray-800/80 border border-gray-700 rounded-xl p-3 text-white tracking-widest text-center text-lg focus:outline-none focus:border-green-500">
                    <button type="submit" class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 text-white font-bold p-3 rounded-xl shadow-lg transition-all">Confirm & Register</button>
                </form>
            </div>
        `;
        res.send(renderLayout('Verify OTP', verifyHtml, null, req));
    };

    if (authType === 'email') {
        sendEmailOTP(username, otp, handleOtpResult);
    } else {
        sendRealOTP(username, otp, handleOtpResult);
    }
});

app.post('/verify-signup-otp', async (req, res) => {
    let { username, otp } = req.body;
    username = username.trim().toLowerCase();

    const record = await Otp.findOne({ username });

    if (record && record.type === 'signup' && record.otp === otp) {
        const uniqueUid = 'UID' + Math.floor(10000 + Math.random() * 90000);
        
        let referredBy = null;
        if (record.ref) {
            let referrer = await User.findOne({ uid: record.ref });
            if (referrer) {
                referredBy = referrer.uid;
                referrer.referralCount = (referrer.referralCount || 0) + 1;
                await referrer.save();
            }
        }

        await User.create({
            uid: uniqueUid,
            username,
            authType: record.authType || 'email',
            name: record.name || '',
            password: record.password,
            rechargeBalance: 0,
            withdrawBalance: 0,
            is_admin: false,
            bankDetails: { name: '', accNo: '', ifsc: '', phone: '' },
            deposits: [],
            withdrawals: [],
            investments: [],
            notifications: [],
            referredBy,
            referralCount: 0,
            teamLevel: 'A',
            lastCheckInDate: null
        });
        await Otp.deleteOne({ username });
        req.session.modalShown = false;
        return res.redirect('/login');
    }
    res.send(renderLayout('Error', `<p class="text-red-500 text-center font-bold">Invalid OTP!</p><br><a href="/signup" class="text-blue-400 block text-center text-sm underline">Try Again</a>`, null, req));
});

// Forgot Password
app.get('/forgot-password', (req, res) => {
    const formHtml = `
        <div class="bg-gray-900/90 backdrop-blur-2xl p-6 rounded-3xl shadow-2xl border border-gray-800 mt-10">
            <h2 class="text-2xl font-black text-center text-yellow-400 mb-6">Reset Password</h2>
            <form action="/send-forgot-otp" method="POST" class="space-y-4">
                <div>
                    <input type="text" name="username" placeholder="@username or email@gmail.com" required class="w-full bg-gray-800/80 border border-gray-700 rounded-xl p-3 text-white focus:outline-none focus:border-yellow-500">
                </div>
                <button type="submit" class="w-full bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 text-white font-bold p-3 rounded-xl shadow-lg transition-all">Send Reset OTP</button>
            </form>
            <a href="/login" class="block text-center text-xs text-gray-400 mt-4 hover:text-white underline">Back to Login</a>
        </div>
    `;
    res.send(renderLayout('Forgot Password', formHtml, null, req));
});

app.post('/send-forgot-otp', async (req, res) => {
    let { username } = req.body;
    username = username.trim().toLowerCase();
    if (!username.includes('@') && !username.includes('.')) username = '@' + username;

    const user = await User.findOne({ username });
    if (!user) {
        return res.send(renderLayout('Error', `<p class="text-red-500 text-center font-bold">Account not found!</p><br><a href="/forgot-password" class="text-blue-400 block text-center text-sm underline">Back</a>`, null, req));
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await Otp.findOneAndUpdate(
        { username },
        { otp, type: 'forgot' },
        { upsert: true, new: true }
    );

    const handleResetOtp = (success) => {
        if (!success) {
            return res.send(renderLayout('Error', `<p class="text-red-500 text-center font-bold">Could not send OTP!</p><br><a href="/forgot-password" class="text-blue-400 block text-center text-sm underline">Back</a>`, null, req));
        }
        const resetHtml = `
            <div class="bg-gray-900/90 backdrop-blur-2xl p-6 rounded-3xl shadow-2xl border border-gray-800 mt-10">
                <h2 class="text-2xl font-black text-center text-yellow-400 mb-6">Set New Password</h2>
                <form action="/verify-and-reset" method="POST" class="space-y-4">
                    <input type="hidden" name="username" value="${username}">
                    <input type="text" name="otp" required maxlength="6" placeholder="Enter 6-digit OTP" class="w-full bg-gray-800/80 border border-gray-700 rounded-xl p-3 text-white tracking-widest text-center text-lg focus:outline-none focus:border-yellow-500">
                    <input type="password" name="newPassword" placeholder="New Password" required class="w-full bg-gray-800/80 border border-gray-700 rounded-xl p-3 text-white focus:outline-none focus:border-yellow-500">
                    <button type="submit" class="w-full bg-gradient-to-r from-green-600 to-emerald-500 text-white font-bold p-3 rounded-xl shadow-lg transition-all">Update Password</button>
                </form>
            </div>
        `;
        res.send(renderLayout('Reset Password', resetHtml, null, req));
    };

    if (user.authType === 'email' || username.includes('@gmail.com')) {
        sendEmailOTP(username, otp, handleResetOtp);
    } else {
        sendRealOTP(username, otp, handleResetOtp);
    }
});

app.post('/verify-and-reset', async (req, res) => {
    let { username, otp, newPassword } = req.body;
    username = username.trim().toLowerCase();

    const record = await Otp.findOne({ username });

    if (record && record.type === 'forgot' && record.otp === otp) {
        let user = await User.findOne({ username });
        if (user) {
            user.password = newPassword;
            await user.save();
            await Otp.deleteOne({ username });
            return res.send(renderLayout('Success', `<p class="text-green-400 text-center font-bold text-base">Password updated successfully!</p><br><a href="/login" class="text-blue-400 block text-center text-sm underline">Login Now</a>`, null, req));
        }
    }
    res.send(renderLayout('Error', `<p class="text-red-500 text-center font-bold">Invalid OTP!</p><br><a href="/forgot-password" class="text-blue-400 block text-center text-sm underline">Try Again</a>`, null, req));
});

// Daily Check-In
app.get('/daily-signin', async (req, res) => {
    if (!req.session.user || req.session.user.is_admin) return res.redirect('/login');
    let user = await User.findOne({ username: req.session.user.username });
    
    const todayStr = new Date().toDateString();
    if (user.lastCheckInDate === todayStr) {
        return res.send(renderLayout('Daily Sign In', `<div class="bg-gray-900/90 backdrop-blur-2xl p-6 rounded-3xl border border-gray-800 text-center space-y-4 mt-10 shadow-xl"><h2 class="text-xl font-black text-yellow-400">Already Claimed Today!</h2><p class="text-xs text-gray-300">You have already claimed your daily sign-in bonus of ₹4 today. Return tomorrow for your next reward!</p><a href="/home" class="inline-block bg-blue-600 text-white font-bold px-5 py-2.5 rounded-xl text-xs mt-3 shadow-lg shadow-blue-500/20">Back to Home</a></div>`, req.session.user, req));
    }

    user.lastCheckInDate = todayStr;
    user.rechargeBalance = (user.rechargeBalance || 0) + 4;
    await user.save();
    req.session.user = user;

    res.send(renderLayout('Daily Sign In', `<div class="bg-gray-900/90 backdrop-blur-2xl p-6 rounded-3xl border border-gray-800 text-center space-y-4 mt-10 shadow-xl"><h2 class="text-xl font-black text-green-400">🎉 Bonus Successfully Claimed!</h2><p class="text-xs text-gray-300">₹4 has been instantly credited to your Recharge Balance.</p><a href="/home" class="inline-block bg-green-600 text-white font-bold px-5 py-2.5 rounded-xl text-xs mt-3 shadow-lg shadow-blue-500/20">Back to Home</a></div>`, req.session.user, req));
});

// Home Page
app.get('/home', async (req, res) => {
    if (!req.session.user || req.session.user.is_admin) return res.redirect('/login');
    let currentUser = await User.findOne({ username: req.session.user.username });

    const todayStr = new Date().toDateString();
    const alreadyCheckedIn = currentUser.lastCheckInDate === todayStr;

    const topic1Text = `EarnX Pro represents the absolute pinnacle of international financial technology, high-frequency digital liquidity engineering, and decentralized asset management ecosystems. Designed with elite institutional-grade infrastructure, our platform bridges the complex gap between modern retail participants and global capital markets. We deliver unprecedented operational velocity, unmatched algorithmic stability, and rigorous multi-layered cryptographic security protocols to safeguard every transaction and user portfolio worldwide.`;
    const topic2Text = `Security, absolute transparency, and ultra-low latency liquidity velocity form the unyielding triad upon which EarnX Pro's operational architecture is built. Our proprietary risk management frameworks, continuous real-time market auditing, and dedicated compliance systems ensure an uncompromised trading environment. Empowering thousands of visionary participants globally, EarnX Pro continues to pioneer sustainable wealth creation and cutting-edge digital asset solutions tailored for the future of finance.`;

    const content = `
        <div class="space-y-6">
            <div class="bg-gradient-to-br from-gray-900/90 via-gray-900/80 to-slate-900/90 backdrop-blur-2xl p-5 rounded-3xl border border-emerald-500/20 shadow-2xl flex justify-between items-center relative overflow-hidden">
                <div class="absolute -right-10 -bottom-10 w-28 h-28 bg-emerald-500/10 rounded-full blur-xl"></div>
                <div>
                    <h3 class="text-gray-400 text-[10px] uppercase tracking-wider font-semibold">User Profile Verified</h3>
                    <div class="text-lg font-black text-white mt-1">UID: <span class="text-emerald-400">${currentUser.uid}</span></div>
                    <p class="text-xs text-gray-300 mt-0.5">Name: ${currentUser.name || 'N/A'} | Account: ${currentUser.username}</p>
                </div>
                <div class="text-right flex-shrink-0">
                    <span class="inline-flex items-center gap-1 bg-emerald-500/20 text-emerald-400 text-xs px-3 py-1.5 rounded-xl font-extrabold border border-emerald-500/30 whitespace-nowrap shadow">Active Account</span>
                </div>
            </div>

            <div class="grid grid-cols-4 gap-2 text-center">
                <a href="/deposit" class="bg-gradient-to-b from-gray-900/90 to-gray-950/90 backdrop-blur-xl hover:from-gray-800 hover:to-gray-900 border border-gray-800 hover:border-emerald-500/30 p-3 rounded-2xl flex flex-col items-center justify-center space-y-1 shadow-xl transition-all group">
                    <span class="text-2xl group-hover:scale-110 transition-transform">💰</span>
                    <span class="text-[11px] font-bold text-blue-400">Recharge</span>
                </a>
                <a href="/withdrawal" class="bg-gradient-to-b from-gray-900/90 to-gray-950/90 backdrop-blur-xl hover:from-gray-800 hover:to-gray-900 border border-gray-800 hover:border-emerald-500/30 p-3 rounded-2xl flex flex-col items-center justify-center space-y-1 shadow-xl transition-all group">
                    <span class="text-2xl group-hover:scale-110 transition-transform">💸</span>
                    <span class="text-[11px] font-bold text-purple-400">Withdraw</span>
                </a>
                <a href="/daily-signin" class="bg-gradient-to-b from-gray-900/90 to-gray-950/90 backdrop-blur-xl hover:from-gray-800 hover:to-gray-900 border border-gray-800 hover:border-emerald-500/30 p-3 rounded-2xl flex flex-col items-center justify-center space-y-1 shadow-xl transition-all group">
                    <span class="text-2xl group-hover:scale-110 transition-transform">🎁</span>
                    <span class="text-[11px] font-bold ${alreadyCheckedIn ? 'text-gray-400' : 'text-yellow-400'}">${alreadyCheckedIn ? 'Claimed' : 'Sign In'}</span>
                </a>
                <a href="https://telegram.me/EarnXPro24x7Support" target="_blank" class="bg-gradient-to-b from-gray-900/90 to-gray-950/90 backdrop-blur-xl hover:from-gray-800 hover:to-gray-900 border border-gray-800 hover:border-emerald-500/30 p-3 rounded-2xl flex flex-col items-center justify-center space-y-1 shadow-xl transition-all group">
                    <span class="text-2xl group-hover:scale-110 transition-transform">🎧</span>
                    <span class="text-[11px] font-bold text-emerald-400">Support</span>
                </a>
            </div>

            <div class="bg-gradient-to-br from-gray-900/90 via-gray-900/80 to-slate-900/90 backdrop-blur-2xl p-5 rounded-3xl border border-gray-800 shadow-2xl space-y-2">
                <h3 class="text-base font-extrabold text-blue-400 flex items-center gap-2"><span>🏢</span> About EarnX Pro & Global Enterprise Excellence</h3>
                <div class="text-xs text-gray-300 leading-relaxed max-h-60 overflow-y-auto pr-1">
                    <p>${topic1Text}</p>
                </div>
            </div>

            <div class="bg-gradient-to-br from-gray-900/90 via-gray-900/80 to-slate-900/90 backdrop-blur-2xl p-5 rounded-3xl border border-gray-800 shadow-2xl space-y-2">
                <h3 class="text-base font-extrabold text-yellow-400 flex items-center gap-2"><span>🚀</span> Advanced Security & Scalable Financial Vision</h3>
                <div class="text-xs text-gray-300 leading-relaxed max-h-60 overflow-y-auto pr-1">
                    <p>${topic2Text}</p>
                </div>
            </div>
        </div>
    `;
    res.send(renderLayout('Home', content, req.session.user, req));
});

// Invest Page
app.get('/invest', async (req, res) => {
    if (!req.session.user || req.session.user.is_admin) return res.redirect('/login');
    let currentUser = await User.findOne({ username: req.session.user.username });
    let products = await Product.find({});

    let productsHtml = products.map((p, index) => {
        const hasInvested = (currentUser.investments || []).some(inv => inv.productId === p._id);
        
        return `
        <div class="bg-gradient-to-br from-gray-900/90 via-gray-900/80 to-slate-900/90 backdrop-blur-2xl border border-gray-800 rounded-3xl p-4 flex flex-col justify-between shadow-2xl">
            ${p.imageUrl ? `<img src="${p.imageUrl}" alt="Product" class="w-full h-36 object-cover rounded-2xl mb-3 border border-gray-800">` : ''}
            <div>
                <h4 class="font-black text-lg text-emerald-400">${p.name}</h4>
                <div class="flex justify-between items-center mt-2">
                    <p class="text-sm text-gray-300">Price: <b class="text-white">₹${p.price}</b></p>
                    <p class="text-sm text-yellow-400 font-bold">Return: ₹${p.returnAmount}</p>
                </div>
                <p class="text-xs text-gray-400 mt-1">Duration: ${p.durationMinutes >= 60 ? (p.durationMinutes / 60) + ' Hours' : p.durationMinutes + ' Minutes'}</p>
            </div>
            <form action="/invest" method="POST" class="mt-4">
                <input type="hidden" name="productId" value="${p._id}">
                <button type="submit" id="investBtn_${index}" class="w-full ${hasInvested ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700' : 'bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 text-white shadow-lg shadow-green-500/20'} font-bold py-2.5 rounded-xl text-sm transition-all" ${hasInvested ? 'disabled' : ''}>${hasInvested ? 'Already Invested' : 'Invest Now'}</button>
            </form>
        </div>
    `;
    }).join('');

    const content = `
        <div class="space-y-6">
            <h2 class="text-2xl font-black text-yellow-400 flex items-center gap-2"><span>📦</span> Investment Products</h2>
            <div class="grid grid-cols-1 gap-4">
                ${products.length ? productsHtml : '<p class="text-gray-400 text-sm text-center py-10 bg-gray-900/50 rounded-2xl border border-gray-800">No products available currently.</p>'}
            </div>
        </div>
    `;
    res.send(renderLayout('Invest', content, req.session.user, req));
});

app.post('/invest', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const { productId } = req.body;
    let user = await User.findOne({ username: req.session.user.username });
    let product = await Product.findOne({ _id: productId });

    if (!user || !product) {
        return res.redirect('/invest');
    }

    const existingInvestment = (user.investments || []).some(inv => inv.productId === productId);
    if (existingInvestment) {
        return res.send(renderLayout('Error', `<p class="text-red-500 text-center font-bold">Aap is product mein pehle hi invest kar chuke hain. Dobara invest nahi kar sakte!</p><br><a href="/invest" class="text-blue-400 block text-center text-sm underline">Back to Invest</a>`, user, req));
    }

    if ((user.rechargeBalance || 0) >= product.price) {
        user.rechargeBalance -= product.price;
        if (!user.investments) user.investments = [];
        
        const endTime = Date.now() + (product.durationMinutes * 60 * 1000);
        user.investments.push({
            productName: product.name,
            productId: productId,
            amount: product.price,
            returnAmount: product.returnAmount,
            endTime: endTime,
            status: 'Active',
            date: new Date().toLocaleString()
        });
        await user.save();
    }
    res.redirect('/invest');
});

// Team Page
app.get('/team', async (req, res) => {
    if (!req.session.user || req.session.user.is_admin) return res.redirect('/login');
    let currentUser = await User.findOne({ username: req.session.user.username });

    const referralLink = `https://earnxpro-1.onrender.com/signup?ref=${currentUser.uid}`;

    const content = `
        <div class="space-y-6">
            <div class="bg-gradient-to-br from-gray-900/90 via-gray-900/80 to-slate-900/90 backdrop-blur-2xl p-5 rounded-3xl border border-gray-800 shadow-2xl space-y-3">
                <h3 class="text-sm font-black text-yellow-400 flex items-center gap-2"><span>🔗</span> Referral & Team Program</h3>
                <p class="text-xs text-gray-300 leading-relaxed">Build your ultimate earning network, invite friends, and watch your passive income multiply effortlessly with every tier.</p>
                <div class="flex items-center space-x-2 pt-1">
                    <input type="text" readonly value="${referralLink}" class="w-full bg-gray-800/90 text-xs text-gray-300 p-3 rounded-xl border border-gray-700 focus:outline-none" id="refLinkInput">
                    <button onclick="navigator.clipboard.writeText(document.getElementById('refLinkInput').value); alert('Copied!');" class="bg-gradient-to-r from-yellow-600 to-amber-600 text-white px-4 py-3 rounded-xl text-xs font-bold shadow-lg shadow-yellow-500/20">Copy</button>
                </div>
            </div>

            <div class="bg-gradient-to-br from-gray-900/90 via-gray-900/80 to-slate-900/90 backdrop-blur-2xl p-5 rounded-3xl border border-gray-800 shadow-2xl space-y-4">
                <h3 class="text-lg font-black text-blue-400">👥 Team Hierarchy Status</h3>
                <p class="text-xs text-gray-300">Current Level: <span class="text-emerald-400 font-bold">Team ${currentUser.teamLevel || 'A'}</span></p>
                
                <div class="border-t border-gray-800 pt-3 text-xs space-y-2.5 text-gray-300">
                    <div class="bg-gray-800/80 p-3.5 rounded-xl border border-gray-700/50">
                        <p class="font-bold text-yellow-400">Team A (Level 1)</p>
                        <p class="text-gray-300 mt-0.5">Bonus: 1% on direct referrals' deposits.</p>
                        <p class="text-gray-400 mt-1">Status: Active (Progress: ${currentUser.referralCount || 0}/25 to Team B)</p>
                    </div>
                    <div class="bg-gray-800/80 p-3.5 rounded-xl border border-gray-700/50">
                        <p class="font-bold text-yellow-400">Team B (Level 2)</p>
                        <p class="text-gray-300 mt-0.5">Bonus: 0.5% commission.</p>
                        <p class="text-gray-400 mt-1">Requirement: 25 successful referrals with deposits in Team A, then 70 referrals to reach Team C.</p>
                    </div>
                    <div class="bg-gray-800/80 p-3.5 rounded-xl border border-gray-700/50">
                        <p class="font-bold text-yellow-400">Team C (Level 3 - Unlimited)</p>
                        <p class="text-gray-300 mt-0.5">Bonus: 0.10% commission on deposits. This is the final unlimited tier.</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    res.send(renderLayout('Team', content, req.session.user, req));
});

app.get('/api/notifications/count', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ count: 0 });
    let currentUser = await User.findOne({ username: req.session.user.username });
    if (!currentUser || !currentUser.notifications) return res.json({ count: 0 });
    
    const unreadCount = currentUser.notifications.filter(n => !n.is_read).length;
    res.json({ count: unreadCount });
});

app.post('/api/notifications/mark-read', async (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ success: false, error: "Unauthorized" });
        let user = await User.findOne({ username: req.session.user.username });

        if (user && user.notifications) {
            user.notifications.forEach(n => {
                n.is_read = true;
            });
            await user.save();
        }

        res.status(200).json({ success: true, message: "Notifications marked as read." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Account Menu Sub-pages
app.get('/account/investments', async (req, res) => {
    if (!req.session.user || req.session.user.is_admin) return res.redirect('/login');
    let currentUser = await User.findOne({ username: req.session.user.username });

    let myInvestmentsHtml = (currentUser.investments || []).map(inv => `
        <div class="bg-gradient-to-br from-gray-900/90 via-gray-900/80 to-slate-900/90 backdrop-blur-2xl p-4 rounded-3xl border border-gray-800 text-sm flex justify-between items-center mb-3 shadow-2xl">
            <div>
                <p class="font-bold text-blue-400 text-base">${inv.productName}</p>
                <p class="text-gray-300 mt-1">Invested: ₹${inv.amount} | Return: ₹${inv.returnAmount}</p>
                <p class="text-xs text-gray-400 mt-1">Status: <span class="${inv.status === 'Active' ? 'text-yellow-400 font-bold' : 'text-emerald-400 font-bold'}">${inv.status}</span></p>
            </div>
        </div>
    `).join('');

    const content = `
        <div class="space-y-4 max-w-lg mx-auto">
            <h2 class="text-xl font-black text-yellow-400 flex items-center gap-2"><span>📈</span> My Active Investments</h2>
            <div class="space-y-2">
                ${myInvestmentsHtml.length ? myInvestmentsHtml : '<p class="text-center text-gray-400 py-12 text-sm bg-gray-900/50 rounded-2xl border border-gray-800">No active investments found.</p>'}
            </div>
            <a href="/account" class="block text-center bg-gray-800/80 backdrop-blur-md border border-gray-700 hover:bg-gray-800 text-white p-3 rounded-xl font-bold text-sm mt-4 shadow-lg">Back to Account</a>
        </div>
    `;
    res.send(renderLayout('My Active Investments', content, req.session.user, req));
});

app.get('/account/notifications', async (req, res) => {
    if (!req.session.user || req.session.user.is_admin) return res.redirect('/login');
    let currentUser = await User.findOne({ username: req.session.user.username });

    if (currentUser && currentUser.notifications) {
        currentUser.notifications.forEach(n => { n.is_read = true; });
        await currentUser.save();
    }

    let notificationsHtml = (currentUser.notifications || []).map(n => `
        <div class="border border-gray-800 bg-gradient-to-br from-gray-900/90 via-gray-900/80 to-slate-900/90 backdrop-blur-2xl p-4 rounded-3xl text-xs space-y-1.5 shadow-2xl">
            <div class="flex justify-between items-center text-cyan-400 font-bold text-sm">
                <span>📢 ${n.title || 'System Notification'}</span>
                <span class="text-[10px] text-gray-400">${n.created_at ? new Date(n.created_at).toLocaleString() : n.date}</span>
            </div>
            <p class="text-gray-200 leading-relaxed">${n.message}</p>
        </div>
    `).join('');

    const content = `
        <div class="space-y-4 max-w-lg mx-auto">
            <h2 class="text-xl font-black text-cyan-400 flex items-center gap-2"><span>🔔</span> System Notifications</h2>
            <div class="space-y-3">
                ${notificationsHtml.length ? notificationsHtml : '<p class="text-center text-gray-400 py-12 text-sm bg-gray-900/50 rounded-2xl border border-gray-800">No notifications found.</p>'}
            </div>
            <a href="/account" class="block text-center bg-gray-800/80 backdrop-blur-md border border-gray-700 hover:bg-gray-800 text-white p-3 rounded-xl font-bold text-sm mt-4 shadow-lg">Back to Account</a>
        </div>
    `;
    res.send(renderLayout('System Notifications', content, req.session.user, req));
});

app.get('/account/deposits', async (req, res) => {
    if (!req.session.user || req.session.user.is_admin) return res.redirect('/login');
    let currentUser = await User.findOne({ username: req.session.user.username });

    let depositHistoryHtml = (currentUser.deposits || []).map(d => `
        <div class="bg-gradient-to-br from-gray-900/90 via-gray-900/80 to-slate-900/90 backdrop-blur-2xl border border-gray-800 p-4 rounded-3xl text-xs flex justify-between items-center mb-3 shadow-2xl">
            <div>
                <p class="text-sm">Amt: <b class="text-white text-base">₹${d.amount.toLocaleString()}</b> | UTR: <b class="text-emerald-400">${d.utr}</b></p>
                <p class="text-gray-400 mt-1">Gateway: ${d.gateway || 'UPI'} | ${d.date}</p>
            </div>
            <div class="text-right">
                <span class="${d.status === 'Completed' || d.status === 'Approved' ? 'text-emerald-400 font-bold' : d.status === 'Failed' || d.status === 'Rejected' ? 'text-red-400 font-bold' : 'text-yellow-400 font-bold'} text-sm">${d.status}</span>
                ${d.screenshotUrl ? `<br><a href="${d.screenshotUrl}" target="_blank" class="text-blue-400 underline mt-1 inline-block font-semibold">View SS</a>` : ''}
            </div>
        </div>
    `).join('');

    const content = `
        <div class="space-y-4 max-w-lg mx-auto">
            <h2 class="text-xl font-black text-emerald-400 flex items-center gap-2"><span>📜</span> Deposit History</h2>
            <div class="space-y-2">
                ${depositHistoryHtml.length ? depositHistoryHtml : '<p class="text-center text-gray-400 py-12 text-sm bg-gray-900/50 rounded-2xl border border-gray-800">No deposit history found.</p>'}
            </div>
            <a href="/account" class="block text-center bg-gray-800/80 backdrop-blur-md border border-gray-700 hover:bg-gray-800 text-white p-3 rounded-xl font-bold text-sm mt-4 shadow-lg">Back to Account</a>
        </div>
    `;
    res.send(renderLayout('Deposit History', content, req.session.user, req));
});

app.get('/account/withdrawals', async (req, res) => {
    if (!req.session.user || req.session.user.is_admin) return res.redirect('/login');
    let currentUser = await User.findOne({ username: req.session.user.username });

    let withdrawHistoryHtml = (currentUser.withdrawals || []).map(w => {
        let fixedAmt = Math.round(w.amount * (1 - 0.12));
        let statusClass = (w.status === 'Approved' || w.status === 'Completed') ? 'text-emerald-400 font-bold' : ((w.status === 'Failed' || w.status === 'Rejected') ? 'text-red-400 font-bold' : 'text-yellow-400 font-bold');
        let displayStatus = (w.status === 'Approved') ? 'Completed' : w.status;

        return `
            <div class="withdrawal-history-card">
                <div class="history-row final-amount text-sm">
                    <span class="label">Withdrawal Amount:</span>
                    <span class="value">₹${fixedAmt}</span> 
                </div>
                <div class="history-meta">
                    <small>Bank A/C: ${w.bankDetails ? w.bankDetails.accNo : 'N/A'}</small>
                    <span class="status ${statusClass.includes('emerald') ? 'completed' : ''} ${statusClass}">${displayStatus}</span>
                </div>
                <div class="history-date">
                    <small>${w.date}</small>
                </div>
            </div>
        `;
    }).join('');

    const content = `
        <div class="space-y-4 max-w-lg mx-auto">
            <h2 class="text-xl font-black text-purple-400 flex items-center gap-2"><span>📜</span> Withdrawal History</h2>
            <div class="space-y-2">
                ${withdrawHistoryHtml.length ? withdrawHistoryHtml : '<p class="text-center text-gray-400 py-12 text-sm bg-gray-900/50 rounded-2xl border border-gray-800">No withdrawal requests found.</p>'}
            </div>
            <a href="/account" class="block text-center bg-gray-800/80 backdrop-blur-md border border-gray-700 hover:bg-gray-800 text-white p-3 rounded-xl font-bold text-sm mt-4 shadow-lg">Back to Account</a>
        </div>
    `;
    res.send(renderLayout('Withdrawal History', content, req.session.user, req));
});

// Account Page
app.get('/account', async (req, res) => {
    if (!req.session.user || req.session.user.is_admin) return res.redirect('/login');
    let currentUser = await User.findOne({ username: req.session.user.username });
    const unreadCountInitial = (currentUser.notifications || []).filter(n => !n.is_read).length;

    const content = `
        <div class="flex items-center justify-center py-2">
            <div class="inline-flex items-center gap-3 bg-gradient-to-br from-gray-900/95 to-slate-900/95 backdrop-blur-2xl border border-emerald-500/20 px-5 py-2.5 rounded-2xl shadow-2xl">
                <div class="relative w-10 h-10 rounded-xl overflow-hidden shadow-lg shadow-emerald-500/30 border border-emerald-500/30">
                    <img src="${LOGO_URL}" alt="EarnX Pro Logo" class="w-full h-full object-cover">
                </div>
                <div class="flex flex-col text-left">
                    <span class="text-lg font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-100 to-emerald-400">
                        EarnX <span class="text-cyan-400 font-extrabold">Pro</span>
                    </span>
                    <span class="text-[9px] uppercase tracking-widest text-emerald-400/80 font-bold -mt-1">Secure Ecosystem</span>
                </div>
            </div>
        </div>

        <div class="account-container">
            <div class="user-id-card">
                <div class="uid-text text-sm font-bold flex justify-between items-center">
                    <span>UID: <span class="text-emerald-400">${currentUser.uid}</span></span>
                    <span class="text-[10px] bg-emerald-500/20 text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/30">Verified</span>
                </div>
                <div class="account-status text-xs text-gray-300 mt-2">Name: ${currentUser.name || 'N/A'} &bull; Account: ${currentUser.username}</div>
            </div>

            <div class="balance-cards-grid">
                <div class="balance-card recharge">
                    <span class="currency">₹${(currentUser.rechargeBalance || 0).toFixed(2)}</span>
                    <span class="label text-xs text-gray-400 block mt-1 font-semibold">Recharge Balance</span>
                </div>
                <div class="balance-card withdraw">
                    <span class="currency">₹${(currentUser.withdrawBalance || 0).toFixed(2)}</span>
                    <span class="label text-xs text-gray-400 block mt-1 font-semibold">Withdraw Balance</span>
                </div>
            </div>

            <div class="action-buttons-stack">
                <a href="/deposit" class="deposit-btn">💰 Deposit Funds</a>
                <a href="/withdrawal" class="withdraw-btn">💸 Withdraw Funds</a>
                <a href="https://telegram.me/EarnXPro24x7Support" target="_blank" class="btn-support">🎧 Customer Care Support</a>
            </div>

            <div class="space-y-3 mt-4 action-buttons-stack">
                <a href="/account/investments" class="menu-link-btn">
                    <span class="flex items-center gap-3"><span>📈</span> My Active Investments</span>
                    <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                </a>

                <a href="/account/notifications" class="menu-link-btn">
                    <span class="flex items-center gap-3">
                        <span>🔔</span> System Notifications 
                        ${unreadCountInitial > 0 ? `<span class="bg-cyan-500 text-black text-[10px] font-black px-2 py-0.5 rounded-full">${unreadCountInitial}</span>` : ''}
                    </span>
                    <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                </a>

                <a href="/account/deposits" class="menu-link-btn">
                    <span class="flex items-center gap-3"><span>📜</span> View Deposit History</span>
                    <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                </a>

                <a href="/account/withdrawals" class="menu-link-btn">
                    <span class="flex items-center gap-3"><span>📜</span> View Withdrawal History</span>
                    <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                </a>
            </div>
        </div>
    `;
    res.send(renderLayout('Account Dashboard', content, req.session.user, req));
});

// Deposit Page
app.get('/deposit', async (req, res) => {
    if (!req.session.user || req.session.user.is_admin) return res.redirect('/login');
    let user = await User.findOne({ username: req.session.user.username });
    
    let assignedUpi = getRandomUpiId();

    let historyHtml = (user.deposits || []).map(d => {
        let statusColor = 'text-yellow-400';
        let displayStatus = d.status;
        if (d.status === 'Approved' || d.status === 'Completed') {
            statusColor = 'text-emerald-400';
            displayStatus = 'Completed';
        } else if (d.status === 'Rejected' || d.status === 'Failed') {
            statusColor = 'text-red-400';
            displayStatus = 'Failed';
        }

        return `
            <div class="bg-gray-800/80 border border-gray-700/80 p-3 rounded-xl text-xs mb-2 flex justify-between items-center shadow">
                <div>
                    <p>Amt: <b class="text-white">₹${d.amount}</b> | UTR: <b class="text-emerald-400">${d.utr}</b></p>
                    <p class="text-gray-400 mt-0.5">Gateway: ${d.gateway || 'UPI'} | ${d.date}</p>
                </div>
                <div>
                    <span class="px-2.5 py-1 rounded-lg font-bold ${statusColor} bg-gray-900/50">${displayStatus}</span>
                    ${d.screenshotUrl ? `<br><a href="${d.screenshotUrl}" target="_blank" class="text-blue-400 underline mt-1 inline-block font-semibold">View SS</a>` : ''}
                </div>
            </div>
        `;
    }).join('');

    const content = `
        <div class="bg-gradient-to-br from-gray-900/90 via-gray-900/80 to-slate-900/90 backdrop-blur-2xl p-6 rounded-3xl border border-gray-800 shadow-2xl space-y-4 deposit-page">
            <h2 class="text-xl font-black text-emerald-400">Deposit Funds (₹100 - ₹50,000)</h2>

            <div class="deposit-warning">
                ⚠️ <strong>Important Payment Notice:</strong> Please use only the 4 authorized UPI apps provided below. If you make a payment from any third-party wallet or unverified third-party app, your deposit will <strong>not</strong> be updated or credited to your recharge balance.
            </div>
            
            <div id="step-amount">
                <form id="initDepositForm" class="space-y-3">
                    <input type="number" id="deposit_amount" placeholder="Enter Amount (Min 100 - Max 50000)" min="100" max="50000" required class="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white focus:outline-none focus:border-emerald-500">
                    <button type="submit" class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold p-3 rounded-xl shadow-lg shadow-blue-500/20 transition-all">Proceed to Pay</button>
                </form>
            </div>

            <div id="step-gateway" style="display:none;" class="space-y-4">
                <div class="bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 p-3 rounded-xl text-center text-sm font-bold">
                    ⏱️ Time Remaining: <span id="timer">12:00</span>
                </div>
                
                <div class="upi-box bg-gray-800/90 p-3.5 rounded-xl border border-gray-700 flex justify-between items-center shadow-inner">
                    <span class="text-xs">Pay to UPI ID: <strong id="targetUpi" class="text-emerald-400 text-sm font-bold">${assignedUpi}</strong></span>
                    <button onclick="navigator.clipboard.writeText('${assignedUpi}'); alert('UPI ID Copied!');" class="bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 text-white text-xs px-3.5 py-2 rounded-xl font-bold shadow">Copy UPI</button>
                </div>

                <div class="upi-options-grid grid grid-cols-2 gap-2.5">
                    <button type="button" onclick="launchApp('gpay')" class="upi-app-btn bg-blue-600 hover:bg-blue-500 text-center text-white py-2.5 rounded-xl text-xs font-bold block shadow w-full">Google Pay</button>
                    <button type="button" onclick="launchApp('phonepe')" class="upi-app-btn bg-purple-600 hover:bg-purple-500 text-center text-white py-2.5 rounded-xl text-xs font-bold block shadow w-full">PhonePe</button>
                    <button type="button" onclick="launchApp('paytm')" class="upi-app-btn bg-sky-600 hover:bg-sky-500 text-center text-white py-2.5 rounded-xl text-xs font-bold block shadow w-full">Paytm</button>
                    <button type="button" onclick="launchApp('mobikwik')" class="upi-app-btn bg-orange-600 hover:bg-orange-500 text-center text-white py-2.5 rounded-xl text-xs font-bold block shadow w-full">MobiKwik</button>
                </div>

                <form action="/deposit" method="POST" enctype="multipart/form-data" class="space-y-3" id="depositForm">
                    <input type="hidden" name="amount" id="final_amount">
                    <input type="hidden" name="gateway" value="${assignedUpi}">
                    <input type="text" name="utr" id="utrInput" placeholder="Enter 12-digit UTR" pattern="[0-9]{12}" maxlength="12" required class="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white focus:outline-none focus:border-emerald-500">
                    <small id="utrError" style="color: #ff5252; display: none;">UTR must be exactly 12 numeric digits.</small>
                    <div>
                        <label class="block text-xs font-semibold text-gray-400 mb-1">Upload Payment Screenshot (Required)</label>
                        <input type="file" name="screenshot" id="screenshotFile" accept="image/*" required class="w-full bg-gray-800 border border-gray-700 rounded-xl p-2.5 text-white text-xs file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-gray-700 file:text-gray-200">
                    </div>
                    <button type="submit" id="submitProofBtn" class="submit-proof-btn w-full bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 text-white font-bold p-3 rounded-xl shadow-lg shadow-green-500/20 transition-all">Submit Payment Proof</button>
                </form>
            </div>

            <hr class="border-gray-800 my-4">
            <h3 class="font-bold text-sm text-gray-300">Deposit History</h3>
            <div class="max-h-48 overflow-y-auto space-y-2">
                ${historyHtml.length ? historyHtml : '<p class="text-xs text-gray-400 text-center py-4">No deposit history found.</p>'}
            </div>

            <a href="/account" class="block text-center text-xs text-gray-400 mt-3 hover:text-white underline">Back to Account</a>
        </div>

        <script>
            let timerInterval;
            document.getElementById('initDepositForm').addEventListener('submit', function(e) {
                e.preventDefault();
                let amt = document.getElementById('deposit_amount').value;
                if(amt < 100 || amt > 50000) {
                    alert('Deposit amount must be between ₹100 and ₹50,000');
                    return;
                }
                document.getElementById('final_amount').value = amt;
                document.getElementById('step-amount').style.display = 'none';
                document.getElementById('step-gateway').style.display = 'block';

                let timeLeft = 12 * 60;
                timerInterval = setInterval(() => {
                    let min = Math.floor(timeLeft / 60);
                    let sec = timeLeft % 60;
                    document.getElementById('timer').textContent = min + ':' + (sec < 10 ? '0' : '') + sec;
                    if(timeLeft <= 0) {
                        clearInterval(timerInterval);
                        alert('Session expired! Please restart deposit.');
                        location.reload();
                    }
                    timeLeft--;
                }, 1000);
            });

            function launchApp(app) {
                const amt = document.getElementById('deposit_amount').value;
                const upiId = '${assignedUpi}';
                let targetUrl = '';

                if (app === 'gpay') {
                    targetUrl = 'upi://pay?pa=' + encodeURIComponent(upiId) + '&pn=EarnXPro&am=' + amt + '&cu=INR';
                } else if (app === 'phonepe') {
                    targetUrl = 'upi://pay?pa=' + encodeURIComponent(upiId) + '&pn=EarnXPro&am=' + amt + '&cu=INR';
                } else if (app === 'paytm') {
                    targetUrl = 'paytmmp://pay?pa=' + encodeURIComponent(upiId) + '&pn=EarnXPro&am=' + amt + '&cu=INR';
                } else if (app === 'mobikwik') {
                    targetUrl = 'upi://pay?pa=' + encodeURIComponent(upiId) + '&pn=EarnXPro&am=' + amt + '&cu=INR';
                }

                window.location.href = targetUrl;
            }

            document.getElementById('submitProofBtn').addEventListener('click', async (e) => {
                e.preventDefault();

                const utrVal = document.getElementById('utrInput').value.trim();
                const utrRegex = /^[0-9]{12}$/;
                if (!utrRegex.test(utrVal)) {
                    document.getElementById('utrError').style.display = 'block';
                    return;
                }
                document.getElementById('utrError').style.display = 'none';

                alert("Please wait patiently while our system is checking the payment.");

                const formData = new FormData();
                formData.append('amount', document.getElementById('final_amount').value);
                formData.append('gateway', '${assignedUpi}');
                formData.append('utr', utrVal);
                formData.append('screenshot', document.getElementById('screenshotFile').files[0]);

                try {
                    const response = await fetch('/deposit', {
                        method: 'POST',
                        body: formData
                    });
                    
                    if(response.redirected) {
                        window.location.href = response.url;
                    } else {
                        window.location.reload();
                    }
                } catch (err) {
                    console.error(err);
                }
            });
        </script>
    `;
    res.send(renderLayout('Deposit', content, req.session.user, req));
});

app.post('/deposit', upload.single('screenshot'), async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const { amount, utr, gateway } = req.body;
    
    const utrRegex = /^[0-9]{12}$/; 
    if (!utrRegex.test(utr)) {
        return res.send(renderLayout('Error', `<p class="text-red-500 text-center font-bold">Invalid UTR! Please enter a valid 12-digit numeric reference number.</p><br><a href="/deposit" class="text-blue-400 block text-center text-sm underline">Back</a>`, req.session.user, req));
    }

    const existingUserWithUtr = await User.findOne({ "deposits.utr": utr });
    if (existingUserWithUtr) {
        return res.send(renderLayout('Error', `<p class="text-red-500 text-center font-bold">This UTR / Transaction ID has already been submitted! Please enter a unique UTR.</p><br><a href="/deposit" class="text-blue-400 block text-center text-sm underline">Back</a>`, req.session.user, req));
    }

    if (!req.file) {
        return res.send(renderLayout('Error', `<p class="text-red-500 text-center font-bold">Payment screenshot is mandatory!</p><br><a href="/deposit" class="text-blue-400 block text-center text-sm underline">Back</a>`, req.session.user, req));
    }

    let user = await User.findOne({ username: req.session.user.username });
    if (user) {
        if (!user.deposits) user.deposits = [];
        user.deposits.push({ 
            amount: parseFloat(amount), 
            utr, 
            gateway: gateway || 'UPI',
            screenshotUrl: `/uploads/${req.file.filename}`,
            status: 'Pending', 
            date: new Date().toLocaleString() 
        });
        await user.save();
    }
    res.redirect('/deposit');
});

// Withdrawal Page
app.get('/withdrawal', async (req, res) => {
    if (!req.session.user || req.session.user.is_admin) return res.redirect('/login');
    let user = await User.findOne({ username: req.session.user.username });

    let historyHtml = (user.withdrawals || []).map(w => {
        let fixedAmt = Math.round(w.amount * (1 - 0.12));
        let statusClass = (w.status === 'Approved' || w.status === 'Completed') ? 'text-emerald-400 font-bold' : ((w.status === 'Failed' || w.status === 'Rejected') ? 'text-red-400 font-bold' : 'text-yellow-400 font-bold');
        let displayStatus = (w.status === 'Approved') ? 'Completed' : w.status;

        return `
            <div class="withdrawal-history-card">
                <div class="history-row final-amount text-sm">
                    <span class="label">Withdrawal Amount:</span>
                    <span class="value">₹${fixedAmt}</span> 
                </div>
                <div class="history-meta">
                    <small>Bank A/C: ${w.bankDetails ? w.bankDetails.accNo : 'N/A'}</small>
                    <span class="status ${statusClass.includes('emerald') ? 'completed' : ''} ${statusClass}">${displayStatus}</span>
                </div>
                <div class="history-date">
                    <small>${w.date}</small>
                </div>
            </div>
        `;
    }).join('');

    const b = user.bankDetails || { name: '', accNo: '', ifsc: '', phone: '' };
    const hasSavedBank = b.accNo && b.accNo.trim() !== '';

    let bankSectionHTML = '';
    if (hasSavedBank) {
        bankSectionHTML = `
            <div class="locked-bank-box">
                <p><strong>Linked Bank Account (Verified & Locked)</strong></p>
                <p class="text-xs text-gray-300 mt-1">Holder Name: ${b.name}</p>
                <p class="text-xs text-gray-300">Account No: ****${b.accNo.slice(-4)}</p>
                <p class="text-xs text-gray-300">IFSC Code: ${b.ifsc}</p>
                <span class="lock-badge mt-2 inline-block">🔒 Permanent Account Bound</span>
            </div>
        `;
    } else {
        bankSectionHTML = `
            <div class="bank-form space-y-2.5">
                <input type="text" name="accName" placeholder="Account Holder Name" required class="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white text-xs focus:outline-none focus:border-purple-500">
                <input type="text" name="accNo" placeholder="Enter Bank Account Number" required class="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white text-xs focus:outline-none focus:border-purple-500">
                <input type="text" name="ifsc" placeholder="Enter IFSC Code" required class="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white text-xs focus:outline-none focus:border-purple-500">
                <input type="text" name="phone" placeholder="Account Identifier" value="${user.username}" required class="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white text-xs focus:outline-none focus:border-purple-500">
            </div>
        `;
    }

    const content = `
        <div class="bg-gradient-to-br from-gray-900/90 via-gray-900/80 to-slate-900/90 backdrop-blur-2xl p-6 rounded-3xl border border-gray-800 shadow-2xl space-y-4">
            <h2 class="text-xl font-black text-purple-400">Withdraw Funds (₹100 - ₹50,000)</h2>
            
            <div class="bg-gray-800/80 p-3.5 rounded-xl text-xs text-emerald-400 font-bold border border-gray-700">
                Available Withdraw Balance: ₹${(user.withdrawBalance || 0).toFixed(2)}
            </div>

            <div class="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-xl text-xs text-yellow-300">
                <p class="font-bold mb-1">⚠ Withdrawal Tax Policy Notice:</p>
                <p class="text-gray-300">A mandatory 12% tax fee will be applied to every withdrawal transaction processed through the platform. Please verify your payout details before submitting.</p>
            </div>

            <form id="withdrawalForm" class="space-y-3">
                ${bankSectionHTML}
                <div class="form-group pt-1">
                    <label class="block text-xs font-semibold text-gray-400 mb-1">Withdrawal Amount (₹)</label>
                    <input type="number" id="withdrawalAmount" name="amount" min="100" max="50000" placeholder="Enter amount" required class="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white text-xs focus:outline-none focus:border-purple-500">
                </div>
                <div class="form-group">
                    <label class="block text-xs font-semibold text-gray-400 mb-1">Confirm Signup Password</label>
                    <input type="password" id="signupPassword" name="signupPasswordVerify" placeholder="Enter password created during signup" required class="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white text-xs focus:outline-none focus:border-purple-500">
                </div>
                <button type="button" id="submitWithdrawalBtn" class="btn-submit w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold p-3 rounded-xl shadow-lg shadow-purple-500/20 transition-all text-sm">Submit Withdrawal / Save Bank</button>
            </form>

            <hr class="border-gray-800 my-4">
            <h3 class="font-bold text-sm text-gray-300">Withdrawal History</h3>
            <div class="max-h-48 overflow-y-auto space-y-2">
                ${historyHtml.length ? historyHtml : '<p class="text-xs text-gray-400 text-center py-4">No withdrawal requests found.</p>'}
            </div>

            <a href="/account" class="block text-center text-xs text-gray-400 mt-3 hover:text-white underline">Back to Account</a>
        </div>

        <script>
            document.getElementById('submitWithdrawalBtn').addEventListener('click', async () => {
                const amount = document.getElementById('withdrawalAmount').value;
                const password = document.getElementById('signupPassword').value;
                const userId = '${user.uid}';

                const accNameInput = document.querySelector('input[name="accName"]');
                const accNoInput = document.querySelector('input[name="accNo"]');
                const ifscInput = document.querySelector('input[name="ifsc"]');
                const phoneInput = document.querySelector('input[name="phone"]');

                const bodyData = {
                    userId,
                    amount,
                    password,
                    accName: accNameInput ? accNameInput.value : '',
                    accNo: accNoInput ? accNoInput.value : '',
                    ifsc: ifscInput ? ifscInput.value : '',
                    phone: phoneInput ? phoneInput.value : ''
                };

                try {
                    const response = await fetch('/api/withdrawal', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(bodyData)
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        alert("Withdrawal has been submitted, please wait 24 hours to get the amount in your bank.");
                        location.reload();
                    } else {
                        alert(data.message || "Error submitting withdrawal");
                    }
                } catch (err) {
                    console.error(err);
                }
            });
        </script>
    `;
    res.send(renderLayout('Withdraw', content, req.session.user, req));
});

app.post('/api/withdrawal', async (req, res) => {
    try {
        const { userId, amount, password, accName, accNo, ifsc, phone } = req.body;
        let user = await User.findOne({ $or: [{ uid: userId }, { username: req.session.user?.username }] });
        
        if (!user || user.password !== password) {
            return res.status(400).json({ success: false, message: "Incorrect signup password verification!" });
        }

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const dailyWithdrawalsCount = (user.withdrawals || []).filter(w => {
            return new Date(w.date) >= todayStart;
        }).length;

        if (dailyWithdrawalsCount >= 2) {
            return res.status(400).json({ 
                success: false, 
                message: "Daily limit reached. You can only make a maximum of 2 withdrawal requests per day." 
            });
        }

        let amtNum = parseFloat(amount);
        if (!user.bankDetails || !user.bankDetails.accNo) {
            if (accNo) {
                user.bankDetails = { name: accName, accNo, ifsc, phone };
            }
        }

        if ((user.withdrawBalance || 0) >= amtNum && amtNum >= 100 && amtNum <= 50000) {
            user.withdrawBalance -= amtNum;
            if (!user.withdrawals) user.withdrawals = [];
            user.withdrawals.push({ 
                amount: amtNum, 
                bankDetails: user.bankDetails,
                status: 'Pending', 
                date: new Date().toLocaleString() 
            });
            await user.save();
            
            return res.status(200).json({
                success: true,
                message: "Withdrawal has been submitted, please wait 24 hours to get the amount in your bank."
            });
        } else {
            return res.status(400).json({ success: false, message: "Invalid amount or insufficient withdraw balance!" });
        }

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/withdrawal', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const { amount, accName, accNo, ifsc, phone, signupPasswordVerify } = req.body;
    let user = await User.findOne({ username: req.session.user.username });
    
    if (!user || user.password !== signupPasswordVerify) {
        return res.send(renderLayout('Error', `<p class="text-red-500 text-center font-bold">Incorrect signup password verification!</p><br><a href="/withdrawal" class="text-blue-400 block text-center text-sm underline">Back</a>`, null, req));
    }

    let amtNum = parseFloat(amount);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const dailyCount = (user.withdrawals || []).filter(w => new Date(w.date) >= todayStart).length;
    if (dailyCount >= 2) {
        return res.send(renderLayout('Error', `<p class="text-red-500 text-center font-bold">Daily limit reached. Max 2 withdrawal requests per day.</p><br><a href="/withdrawal" class="text-blue-400 block text-center text-sm underline">Back</a>`, null, req));
    }

    if (!user.bankDetails || !user.bankDetails.accNo) {
        if (accNo) {
            user.bankDetails = { name: accName, accNo, ifsc, phone };
        }
    }

    if ((user.withdrawBalance || 0) >= amtNum && amtNum >= 100 && amtNum <= 50000) {
        user.withdrawBalance -= amtNum;
        if (!user.withdrawals) user.withdrawals = [];
        user.withdrawals.push({ 
            amount: amtNum, 
            bankDetails: user.bankDetails,
            status: 'Pending', 
            date: new Date().toLocaleString() 
        });
        await user.save();
    }
    res.redirect('/withdrawal');
});

// Admin Panel
app.get('/admin', async (req, res) => {
    if (!req.session.user || !req.session.user.is_admin) return res.redirect('/login');
    let tab = req.query.tab || 'users';

    let regularUsers = await User.find({ is_admin: { $ne: true } });
    let products = await Product.find({});

    let usersHtml = regularUsers.map(u => `
        <div class="bg-gray-800/90 p-4 rounded-2xl mb-3 text-sm border border-gray-700 shadow">
            <div class="flex justify-between items-center mb-2">
                <div>
                    <p class="font-bold text-yellow-400">UID: ${u.uid} | Name: ${u.name || 'N/A'} | Account: ${u.username}</p>
                    <p class="text-emerald-400 text-xs mt-0.5">Recharge Bal: ₹${(u.rechargeBalance || 0).toFixed(2)} | Withdraw Bal: ₹${(u.withdrawBalance || 0).toFixed(2)}</p>
                </div>
                <form action="/admin/add-balance" method="POST" class="flex space-x-1">
                    <input type="hidden" name="username" value="${u.username}">
                    <input type="number" name="amount" placeholder="+/- Amt" class="w-20 bg-gray-900 text-white p-2 rounded-xl text-xs border border-gray-700" required>
                    <button type="submit" class="bg-blue-600 hover:bg-blue-500 px-3 py-2 rounded-xl text-xs font-bold text-white shadow">Update</button>
                </form>
            </div>
            <div class="bg-gray-900/80 p-3 rounded-xl text-xs mt-2 text-gray-300 border border-gray-800">
                <p class="text-blue-400 font-semibold mb-1">Bank Details:</p>
                <p>Name: ${u.bankDetails?.name || 'N/A'} | A/C: ${u.bankDetails?.accNo || 'N/A'} | IFSC: ${u.bankDetails?.ifsc || 'N/A'}</p>
                <p class="text-gray-400 mt-1">Referrals: ${u.referralCount || 0}</p>
            </div>
        </div>
    `).join('');

    let depositsHtml = [];
    let allUsersWithDeposits = await User.find({ "deposits.status": "Pending" });
    allUsersWithDeposits.forEach(u => {
        u.deposits.forEach((d, dIdx) => {
            if (d.status === 'Pending') {
                depositsHtml.push(`
                    <div class="bg-gray-800/90 p-4 rounded-2xl mb-3 text-sm flex justify-between items-center border border-gray-700 shadow">
                        <div>
                            <p class="font-bold text-white">UID: ${u.uid} (${u.username})</p>
                            <p class="text-gray-300">Amt: ₹${d.amount} | UTR: <b class="text-emerald-400">${d.utr}</b></p>
                            <p class="text-xs text-gray-400 mt-1">${d.date} - Status: <span class="text-yellow-400 font-bold">Pending</span></p>
                            ${d.screenshotUrl ? `<a href="${d.screenshotUrl}" target="_blank" class="text-blue-400 underline text-xs font-bold inline-block mt-2">🔍 Open Screenshot</a>` : ''}
                        </div>
                        <div class="flex space-x-2">
                            <form action="/admin/action-deposit" method="POST">
                                <input type="hidden" name="userId" value="${u._id}">
                                <input type="hidden" name="index" value="${dIdx}">
                                <input type="hidden" name="action" value="approve">
                                <button type="submit" class="bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-xl text-xs font-bold text-white shadow">Approve</button>
                            </form>
                            <form action="/admin/action-deposit" method="POST">
                                <input type="hidden" name="userId" value="${u._id}">
                                <input type="hidden" name="index" value="${dIdx}">
                                <input type="hidden" name="action" value="reject">
                                <button type="submit" class="bg-red-600 hover:bg-red-500 px-3 py-2 rounded-xl text-xs font-bold text-white shadow">Reject</button>
                            </form>
                        </div>
                    </div>
                `);
            }
        });
    });

    let withdrawalsHtml = [];
    let allUsersWithWithdrawals = await User.find({ "withdrawals.status": "Pending" });
    allUsersWithWithdrawals.forEach(u => {
        u.withdrawals.forEach((w, wIdx) => {
            if (w.status === 'Pending') {
                withdrawalsHtml.push(`
                    <div class="bg-gray-800/90 p-4 rounded-2xl mb-3 text-sm flex justify-between items-center border border-gray-700 shadow">
                        <div>
                            <p class="font-bold text-white">UID: ${u.uid} (${u.username})</p>
                            <p class="text-gray-300">Amt: ₹${w.amount} | A/C: <b class="text-purple-400">${w.bankDetails?.accNo}</b></p>
                            <p class="text-xs text-gray-400 mt-1">${w.date} - Status: <span class="text-yellow-400 font-bold">Pending</span></p>
                        </div>
                        <div class="flex space-x-2">
                            <form action="/admin/action-withdrawal" method="POST">
                                <input type="hidden" name="userId" value="${u._id}">
                                <input type="hidden" name="index" value="${wIdx}">
                                <input type="hidden" name="action" value="approve">
                                <button type="submit" class="bg-purple-600 hover:bg-purple-500 px-3 py-2 rounded-xl text-xs font-bold text-white shadow">Approve</button>
                            </form>
                            <form action="/admin/action-withdrawal" method="POST">
                                <input type="hidden" name="userId" value="${u._id}">
                                <input type="hidden" name="index" value="${wIdx}">
                                <input type="hidden" name="action" value="reject">
                                <button type="submit" class="bg-red-600 hover:bg-red-500 px-3 py-2 rounded-xl text-xs font-bold text-white shadow">Reject</button>
                            </form>
                        </div>
                    </div>
                `);
            }
        });
    });

    let productListHtml = [];
    for (let p of products) {
        let investorsList = [];
        let allUsers = await User.find({ "investments.productId": p._id });
        allUsers.forEach(u => {
            u.investments.forEach(inv => {
                if (inv.productId === p._id) {
                    investorsList.push(`<span class="bg-gray-900 text-xs px-2.5 py-1 rounded-lg text-cyan-300 border border-gray-800 font-medium">UID: ${u.uid} (₹${inv.amount}) - ${inv.status}</span>`);
                }
            });
        });

        productListHtml.push(`
            <div class="bg-gray-800/90 p-4 rounded-2xl mb-3 text-sm space-y-2 border border-gray-700 shadow">
                <div class="flex justify-between items-center">
                    <div>
                        <p class="font-bold text-emerald-400 text-base">${p.name}</p>
                        <p class="text-gray-300 text-xs mt-0.5">Price: ₹${p.price} | Return: ₹${p.returnAmount} | Timer: ${p.durationMinutes >= 60 ? (p.durationMinutes / 60) + ' Hours' : p.durationMinutes + 'm'}</p>
                    </div>
                    <form action="/admin/delete-product" method="POST">
                        <input type="hidden" name="productId" value="${p._id}">
                        <button type="submit" class="bg-red-600 hover:bg-red-500 px-3 py-1.5 rounded-xl text-xs text-white font-bold shadow">Delete</button>
                    </form>
                </div>
                <div class="border-t border-gray-700 pt-2.5">
                    <p class="text-xs text-yellow-400 font-semibold mb-1.5">Investors (${investorsList.length}):</p>
                    <div class="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                        ${investorsList.length ? investorsList.join('') : '<span class="text-xs text-gray-400">No investors yet.</span>'}
                    </div>
                </div>
            </div>
        `);
    }

    let userOptionsHtml = regularUsers.map(u => `<option value="${u.username}">UID: ${u.uid} (${u.username})</option>`).join('');

    let activeTabContent = '';
    if (tab === 'users') {
        activeTabContent = `<div class="space-y-2"><h3 class="font-bold text-emerald-400 mb-3 text-base">👥 All Registered Users</h3>${usersHtml.length ? usersHtml : '<p class="text-gray-400 text-sm text-center py-8">No users found.</p>'}</div>`;
    } else if (tab === 'deposits') {
        activeTabContent = `<div class="space-y-2"><h3 class="font-bold text-blue-400 mb-3 text-base">💰 Pending Deposit Requests</h3>${depositsHtml.length ? depositsHtml.join('') : '<p class="text-gray-400 text-sm text-center py-8">No pending deposit requests.</p>'}</div>`;
    } else if (tab === 'withdrawals') {
        activeTabContent = `<div class="space-y-2"><h3 class="font-bold text-purple-400 mb-3 text-base">💸 Pending Withdrawal Requests</h3>${withdrawalsHtml.length ? withdrawalsHtml.join('') : '<p class="text-gray-400 text-sm text-center py-8">No pending withdrawal requests.</p>'}</div>`;
    } else if (tab === 'products') {
        activeTabContent = `
            <div class="space-y-5">
                <h3 class="font-bold text-yellow-400 text-base">📦 Add New Investment Product</h3>
                <form action="/admin/add-product" method="POST" class="space-y-3 bg-gray-800/80 p-4 rounded-2xl border border-gray-700">
                    <input type="text" name="name" placeholder="Product Name" required class="w-full bg-gray-900 p-3 rounded-xl text-xs text-white border border-gray-700 focus:outline-none focus:border-yellow-500">
                    <input type="number" name="price" placeholder="Product Price (₹)" required class="w-full bg-gray-900 p-3 rounded-xl text-xs text-white border border-gray-700 focus:outline-none focus:border-yellow-500">
                    <input type="number" name="returnAmount" placeholder="Return Income Amount (₹)" required class="w-full bg-gray-900 p-3 rounded-xl text-xs text-white border border-gray-700 focus:outline-none focus:border-yellow-500">
                    
                    <div class="flex space-x-2">
                        <input type="number" name="durationValue" placeholder="Duration (e.g. 120 or 2)" required class="w-2/3 bg-gray-900 p-3 rounded-xl text-xs text-white border border-gray-700 focus:outline-none focus:border-yellow-500">
                        <select name="durationType" class="w-1/3 bg-gray-900 p-3 rounded-xl text-xs text-white border border-gray-700 focus:outline-none focus:border-yellow-500">
                            <option value="minutes">Minutes</option>
                            <option value="hours">Hours</option>
                        </select>
                    </div>

                    <input type="text" name="imageUrl" placeholder="Image URL (optional)" class="w-full bg-gray-900 p-3 rounded-xl text-xs text-white border border-gray-700 focus:outline-none focus:border-yellow-500">
                    <button type="submit" class="w-full bg-gradient-to-r from-yellow-600 to-amber-600 py-3 rounded-xl text-xs font-bold text-white shadow-lg shadow-yellow-500/20">Add Product</button>
                </form>
                <h3 class="font-bold text-yellow-400 text-base mt-6">Active Products & Investor Details</h3>
                <div class="max-h-96 overflow-y-auto space-y-2">${productListHtml.length ? productListHtml.join('') : '<p class="text-gray-400 text-sm text-center py-6">No products added.</p>'}</div>
            </div>
        `;
    } else if (tab === 'send-funds') {
        activeTabContent = `
            <div class="space-y-6">
                <div class="bg-gray-800/80 p-5 rounded-2xl border border-gray-700 shadow-xl">
                    <h3 class="font-bold text-emerald-400 mb-3 text-base">💸 Send Direct Funds to User</h3>
                    <form action="/admin/send-funds" method="POST" class="space-y-3">
                        <div>
                            <label class="block text-xs font-semibold text-gray-300 mb-1">Select User</label>
                            <select name="username" required class="w-full bg-gray-900 p-3 rounded-xl text-xs text-white border border-gray-700 focus:outline-none focus:border-emerald-500">
                                <option value="">-- Choose User --</option>
                                ${userOptionsHtml}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-gray-300 mb-1">Amount (₹)</label>
                            <input type="number" name="amount" min="1" placeholder="Enter Amount" required class="w-full bg-gray-900 p-3 rounded-xl text-xs text-white border border-gray-700 focus:outline-none focus:border-emerald-500">
                        </div>
                        <button type="submit" class="w-full bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 py-3 rounded-xl text-xs font-bold text-white shadow-lg shadow-green-500/20 transition-all">Send Balance (Adds to Deposit History)</button>
                    </form>
                </div>

                <div class="bg-gray-800/80 p-5 rounded-2xl border border-gray-700 shadow-xl">
                    <h3 class="font-bold text-cyan-400 mb-3 text-base">📢 Send System Message / Notification</h3>
                    <form action="/admin/send-message" method="POST" class="space-y-3">
                        <div>
                            <label class="block text-xs font-semibold text-gray-300 mb-1">Select User</label>
                            <select name="username" required class="w-full bg-gray-900 p-3 rounded-xl text-xs text-white border border-gray-700 focus:outline-none focus:border-cyan-500">
                                <option value="">-- Choose User --</option>
                                ${userOptionsHtml}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-gray-300 mb-1">Message Body</label>
                            <textarea name="message" rows="3" placeholder="Type notification message here..." required class="w-full bg-gray-900 p-3 rounded-xl text-xs text-white border border-gray-700 focus:outline-none focus:border-cyan-500"></textarea>
                        </div>
                        <button type="submit" class="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 py-3 rounded-xl text-xs font-bold text-white shadow-lg shadow-cyan-500/20 transition-all">Send System Notification</button>
                    </form>
                </div>
            </div>
        `;
    }

    const content = `
        <div class="space-y-6">
            <h2 class="text-2xl font-black text-yellow-400 flex items-center gap-2"><span>🛡</span> Admin Dashboard</h2>
            
            <div class="flex space-x-2 border-b border-gray-800 pb-3 overflow-x-auto text-xs">
                <a href="/admin?tab=users" class="px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap shadow transition-all ${tab === 'users' ? 'bg-emerald-600 text-white shadow-emerald-500/20' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}">Users</a>
                <a href="/admin?tab=deposits" class="px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap shadow transition-all ${tab === 'deposits' ? 'bg-blue-600 text-white shadow-blue-500/20' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}">Deposits</a>
                <a href="/admin?tab=withdrawals" class="px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap shadow transition-all ${tab === 'withdrawals' ? 'bg-purple-600 text-white shadow-purple-500/20' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}">Withdrawals</a>
                <a href="/admin?tab=products" class="px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap shadow transition-all ${tab === 'products' ? 'bg-yellow-600 text-white shadow-yellow-500/20' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}">Products</a>
                <a href="/admin?tab=send-funds" class="px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap shadow transition-all ${tab === 'send-funds' ? 'bg-cyan-600 text-white shadow-cyan-500/20' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}">Funds & Msg</a>
            </div>

            <div class="bg-gray-900/90 backdrop-blur-xl p-5 rounded-2xl border border-gray-800 shadow-2xl">
                ${activeTabContent}
            </div>
        </div>
    `;
    res.send(renderLayout('Admin Panel', content, req.session.user, req));
});

app.post('/admin/add-product', async (req, res) => {
    if (!req.session.user || !req.session.user.is_admin) return res.redirect('/login');
    const { name, price, returnAmount, durationValue, durationType, imageUrl } = req.body;
    
    let durationMinutes = parseInt(durationValue);
    if (durationType === 'hours') {
        durationMinutes = durationMinutes * 60;
    }

    await Product.create({
        _id: 'prod_' + Date.now(),
        name,
        price: parseFloat(price),
        returnAmount: parseFloat(returnAmount),
        durationMinutes,
        imageUrl: imageUrl || ''
    });
    res.redirect('/admin?tab=products');
});

app.post('/admin/delete-product', async (req, res) => {
    if (!req.session.user || !req.session.user.is_admin) return res.redirect('/login');
    const { productId } = req.body;
    await Product.deleteOne({ _id: productId });
    res.redirect('/admin?tab=products');
});

app.post('/admin/add-balance', async (req, res) => {
    if (!req.session.user || !req.session.user.is_admin) return res.redirect('/login');
    const { username, amount } = req.body;
    let user = await User.findOne({ username });
    if (user) {
        user.rechargeBalance = (user.rechargeBalance || 0) + parseFloat(amount);
        await user.save();
    }
    res.redirect('/admin?tab=users');
});

app.post('/admin/action-deposit', async (req, res) => {
    if (!req.session.user || !req.session.user.is_admin) return res.redirect('/login');
    const { userId, index, action } = req.body;
    let user = await User.findById(userId);
    if (user && user.deposits && user.deposits[index]) {
        let deposit = user.deposits[index];
        if (deposit.status === 'Pending') {
            if (action === 'approve') {
                deposit.status = 'Completed';
                user.rechargeBalance = (user.rechargeBalance || 0) + deposit.amount;

                if (user.referredBy) {
                    let referrer = await User.findOne({ uid: user.referredBy });
                    if (referrer) {
                        let bonus = deposit.amount * 0.01;
                        referrer.rechargeBalance = (referrer.rechargeBalance || 0) + bonus;
                        if (!referrer.notifications) referrer.notifications = [];
                        referrer.notifications.push({
                            id: 'notif_' + Date.now(),
                            user_id: referrer.uid,
                            title: 'Referral Bonus Received',
                            message: `You received a 1% referral deposit bonus of ₹${bonus.toFixed(2)} from UID: ${user.uid}`,
                            is_read: false,
                            created_at: new Date().toISOString()
                        });
                        await referrer.save();
                    }
                }
            } else if (action === 'reject') {
                deposit.status = 'Failed';
            }
            await user.save();
        }
    }
    res.redirect('/admin?tab=deposits');
});

app.post('/admin/action-withdrawal', async (req, res) => {
    if (!req.session.user || !req.session.user.is_admin) return res.redirect('/login');
    const { userId, index, action } = req.body;
    let user = await User.findById(userId);
    if (user && user.withdrawals && user.withdrawals[index]) {
        let withdrawal = user.withdrawals[index];
        if (withdrawal.status === 'Pending') {
            if (action === 'approve') {
                withdrawal.status = 'Completed';
            } else if (action === 'reject') {
                withdrawal.status = 'Failed';
                user.withdrawBalance = (user.withdrawBalance || 0) + withdrawal.amount;
            }
            await user.save();
        }
    }
    res.redirect('/admin?tab=withdrawals');
});

app.post('/admin/send-funds', async (req, res) => {
    if (!req.session.user || !req.session.user.is_admin) return res.redirect('/login');
    const { username, amount } = req.body;
    let user = await User.findOne({ username });
    if (user) {
        let amt = parseFloat(amount);
        user.rechargeBalance = (user.rechargeBalance || 0) + amt;
        if (!user.deposits) user.deposits = [];
        user.deposits.push({
            amount: amt,
            utr: 'SYSTEM_CREDIT_' + Math.floor(Math.random() * 900000 + 100000),
            gateway: 'System Name',
            status: 'Completed',
            date: new Date().toLocaleString()
        });
        await user.save();
    }
    res.redirect('/admin?tab=send-funds');
});

app.post('/admin/send-message', async (req, res) => {
    if (!req.session.user || !req.session.user.is_admin) return res.redirect('/login');
    const { username, message } = req.body;
    let user = await User.findOne({ username });
    if (user) {
        if (!user.notifications) user.notifications = [];
        user.notifications.push({
            id: 'notif_' + Date.now(),
            user_id: user.uid,
            title: 'SystemNotification',
            message: message,
            is_read: false,
            created_at: new Date().toISOString()
        });
        await user.save();
    }
    res.redirect('/admin?tab=send-funds');
});

app.listen(PORT, async () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    await setupTelegramWebhook();
});
