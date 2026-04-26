# The 1969 — Telegram bot

Listens for verification codes posted in the public group, claims them
against the main app, promotes verified members with the `1969 / VERIFIED`
title (the WL badge).

This is a **separate process** from the main Vercel app — it needs a
long-running container, which Vercel's serverless functions can't
provide. Cheapest option: Railway free tier.

## Local dev

```sh
cd bot
npm install
TELEGRAM_BOT_TOKEN=... \
TELEGRAM_CHAT_ID=-1003498944848 \
APP_BASE_URL=https://the1969.io \
BOT_SHARED_SECRET=... \
PIN_WELCOME_ON_START=1 \
npm start
```

## Railway deploy (5 min, one-time)

1. https://railway.app → **New Project** → **Deploy from GitHub repo** → pick this repo
2. **Root Directory**: `bot`
3. **Build command**: leave empty
4. **Start command**: `npm start`
5. **Variables** (Settings → Variables → Raw Editor):
   ```
   TELEGRAM_BOT_TOKEN=8758370902:AAH...
   TELEGRAM_CHAT_ID=-1003498944848
   APP_BASE_URL=https://the1969.io
   BOT_SHARED_SECRET=<generate a long random string, must match Vercel>
   PIN_WELCOME_ON_START=1
   ```
6. Deploy. Watch the logs — first line should be:
   ```
   [boot] bot=@The1960bot  chat=-1003498944848  app=https://the1969.io
   ```

## Required Telegram permissions

The bot must be a group admin with **Add New Admins** enabled
(`can_promote_members`). All other admin perms can stay off — they
aren't used. Setting custom titles is the only privileged action.

## How it works

```
user → posts "T1Z9KX" in group
bot  → POST /api/tg-verify-claim { code, telegramUserId, telegramUsername }
       (header: x-bot-secret matches BOT_SHARED_SECRET)
app  → validates code → looks up the X user → checks portrait
     → writes users.telegram_user_id → returns customTitle
bot  → promoteChatMember + setChatAdministratorCustomTitle
bot  → replies "✓ @user — welcome to the 1969"
```

Failures get a polite reply in the group with the error reason.

## Vercel side

Set the matching secret on Vercel **Settings → Environment Variables**:

```
BOT_SHARED_SECRET=<same long random string as Railway>
```

Apply to Production / Preview / Development. Redeploy.
