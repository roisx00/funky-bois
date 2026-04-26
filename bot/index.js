// The 1969 — Telegram verification bot.
//
// Listens to messages in the configured public group. When someone
// posts a 6-character verification code, calls the main app's
// /api/tg-verify-claim with the code + the sender's Telegram user id.
// On success, promotes the sender with a custom title (the WL badge)
// and replies in the group.
//
// What this bot does NOT do:
//   • DM anyone (you said no DMs).
//   • Hold a list of holders (it asks the app per-message).
//   • Restrict joining or messaging — anyone can chat freely.
//
// Env required:
//   TELEGRAM_BOT_TOKEN     — from BotFather
//   TELEGRAM_CHAT_ID       — the supergroup id, e.g. -1003498944848
//   APP_BASE_URL           — e.g. https://the1969.io
//   BOT_SHARED_SECRET      — must match same env var on Vercel
//
// Optional:
//   PIN_WELCOME_ON_START=1 — bot pins a welcome message in the group
//                            on first run (idempotent — won't repin).
//
// Hosting: Railway / Fly / any node host. `node index.js` is enough.
import TelegramBot from 'node-telegram-bot-api';

const TOKEN     = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = String(process.env.TELEGRAM_CHAT_ID || '');
const APP_BASE  = process.env.APP_BASE_URL || 'https://the1969.io';
const SECRET    = process.env.BOT_SHARED_SECRET;
const PIN_WELCOME = process.env.PIN_WELCOME_ON_START === '1';

if (!TOKEN)   { console.error('TELEGRAM_BOT_TOKEN missing'); process.exit(1); }
if (!CHAT_ID) { console.error('TELEGRAM_CHAT_ID missing');   process.exit(1); }
if (!SECRET)  { console.error('BOT_SHARED_SECRET missing');  process.exit(1); }

const CODE_RE = /^[A-Z0-9]{6}$/;
const WELCOME =
`✦ Welcome to The 1969 — public chat for the 1,969.

Built a portrait? Get the verified badge → ${APP_BASE}/verify-tg

Anyone is welcome to lurk and chat. The badge just shows you're a real holder.`;

const bot = new TelegramBot(TOKEN, { polling: true });

bot.on('polling_error', (e) => console.warn('[poll]', e?.message || e));

// Match a verification code anywhere a user posts in the group.
bot.on('message', async (msg) => {
  // Only listen in our group.
  if (String(msg.chat?.id) !== CHAT_ID) return;
  // Only text, not media captions or commands.
  const text = (msg.text || '').trim().toUpperCase();
  if (!CODE_RE.test(text)) return;

  const sender = msg.from || {};
  const tgId   = sender.id;
  const tgUser = sender.username || '';
  if (!tgId) return;

  console.log(`[claim] code=${text} from=${tgId} (@${tgUser})`);

  let result;
  try {
    const r = await fetch(`${APP_BASE}/api/tg-verify-claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bot-secret': SECRET },
      body: JSON.stringify({ code: text, telegramUserId: tgId, telegramUsername: tgUser }),
    });
    result = await r.json();
    if (!r.ok) {
      await replyError(msg, result?.reason || result?.error || 'unknown');
      return;
    }
  } catch (e) {
    console.warn('[claim] network error:', e?.message);
    await replyError(msg, 'network_error');
    return;
  }

  // Promote with custom title (= the WL badge).
  // Telegram requires the user to be promoted to admin (with all
  // permissions OFF) before a custom title can be set. They get no
  // actual moderator power — it's just the visible badge.
  const customTitle = (result.customTitle || '1969 / VERIFIED').slice(0, 16);
  try {
    await bot.promoteChatMember(CHAT_ID, tgId, {
      can_change_info:        false,
      can_post_messages:      false,
      can_edit_messages:      false,
      can_delete_messages:    false,
      can_invite_users:       false,
      can_restrict_members:   false,
      can_pin_messages:       false,
      can_promote_members:    false,
      can_manage_video_chats: false,
      is_anonymous:           false,
    });
    await bot.setChatAdministratorCustomTitle(CHAT_ID, tgId, customTitle);
  } catch (e) {
    console.warn('[promote] failed:', e?.message);
    await bot.sendMessage(CHAT_ID,
      `@${tgUser || 'user'} verified, but I couldn't set the badge — make sure I have "Add New Admins" permission.`,
      { reply_to_message_id: msg.message_id });
    return;
  }

  await bot.sendMessage(CHAT_ID,
    `✓ ${tgUser ? '@' + tgUser : 'verified'} — welcome to the 1969.`,
    { reply_to_message_id: msg.message_id });
});

async function replyError(msg, reason) {
  const map = {
    unknown_code:       "That code doesn't match any pending verification. Generate a fresh one at " + APP_BASE + "/verify-tg",
    code_expired:       "That code expired. Generate a fresh one at " + APP_BASE + "/verify-tg",
    no_portrait:        "You haven't built a portrait yet — head to " + APP_BASE + "/build first.",
    already_verified:   "You're already linked to a different Telegram account. Contact admin to rebind.",
    telegram_id_taken:  "This Telegram account is already verified to a different X handle.",
    suspended:          "This account is suspended.",
    network_error:      "Couldn't reach the server, try again in a sec.",
  };
  const text = map[reason] || `Couldn't verify (${reason}).`;
  await bot.sendMessage(CHAT_ID, text, { reply_to_message_id: msg.message_id });
}

// Optional: pin a welcome message once at startup. Idempotent across
// restarts because we use `disable_notification: true` and skip if a
// pinned message already exists.
async function maybePinWelcome() {
  if (!PIN_WELCOME) return;
  try {
    const chat = await bot.getChat(CHAT_ID);
    if (chat?.pinned_message) {
      console.log('[pin] already pinned, skipping');
      return;
    }
    const sent = await bot.sendMessage(CHAT_ID, WELCOME, { disable_web_page_preview: false });
    await bot.pinChatMessage(CHAT_ID, sent.message_id, { disable_notification: true });
    console.log('[pin] welcome pinned');
  } catch (e) {
    console.warn('[pin] failed:', e?.message);
  }
}

(async () => {
  const me = await bot.getMe().catch(() => null);
  console.log(`[boot] bot=@${me?.username || '?'}  chat=${CHAT_ID}  app=${APP_BASE}`);
  await maybePinWelcome();
})();
