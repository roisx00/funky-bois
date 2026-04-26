# The 1969 — Discord chat bot

Listens to `#general`. Awards BUSTS for qualifying messages by linked
members, server-side capped, server-side validated. Grants the
`@verified` role on first sign of life.

This is a separate process from the main Vercel app — it needs a
long-running container, which Vercel's serverless functions can't
provide. Use Railway / Fly / any Node host.

## One-time Discord side setup

### A. Create the application + bot

1. https://discord.com/developers/applications → **New Application** → name it "The 1969"
2. **OAuth2 → Redirects**: add `https://the1969.io/api/discord-oauth-callback`
3. **Bot tab** → **Reset Token** → copy → save somewhere safe (this is `DISCORD_BOT_TOKEN`)
4. **Bot tab → Privileged Gateway Intents**: toggle ON
   - **Server Members Intent**
   - **Message Content Intent**
5. **OAuth2 → URL Generator**:
   - Scopes: `bot` + `applications.commands`
   - Bot Permissions: `View Channels`, `Send Messages`, `Read Message History`, `Manage Roles`, `Create Instant Invite`
6. Open the generated URL → invite the bot to your server

### B. Create the server skeleton

Roles (top → bottom — Discord's role hierarchy matters):
- `@The Prophet`  (admin = you)
- `@The1969Bot`   (auto-created by invite — drag BELOW The Prophet
                   and ABOVE every other role so it can grant them)
- `@The Monk`     (portrait holder — has built their bust)
- `@The Rebel`    (pre-WL approved — drop-eligible)
- `@The Stranger` (verified = X-linked via the dashboard. Bot grants
                   this one automatically on first link / first chat.
                   `DISCORD_VERIFIED_ROLE_ID` should point at THIS role.)

Channels:
- `#announcements` — `@everyone` can read, ONLY `@The Prophet` posts
- `#general`       — `@The Stranger` posts + reads; `@everyone` can
                     see the channel but cannot send
- `#official-links`— only `@The Monk` reads (post-mint alpha)

### C. Server settings (lockdown)

- Settings → Safety Setup → **Verification Level: Highest**
- Settings → Server Discovery: **OFF**
- `@everyone` permissions: leave only "Read Messages" + "Read Message History"

## Env vars

Set these on Vercel (project → Settings → Environment Variables):

```
DISCORD_CLIENT_ID         (from Developer Portal → General Information)
DISCORD_CLIENT_SECRET     (from Developer Portal → OAuth2)
DISCORD_BOT_TOKEN         (from Bot tab → Reset Token)
DISCORD_GUILD_ID          (right-click server → Copy Server ID; needs Developer Mode in Discord settings)
DISCORD_REDIRECT_URI      = https://the1969.io/api/discord-oauth-callback
BOT_SHARED_SECRET         (any long random string — same as the Telegram one would be fine)
```

Set these on Railway (the bot's own env):

```
DISCORD_BOT_TOKEN         (same as Vercel)
DISCORD_GUILD_ID          (same as Vercel)
DISCORD_GENERAL_ID        (right-click #general → Copy Channel ID)
DISCORD_VERIFIED_ROLE_ID  (right-click @verified role → Copy Role ID — optional)
APP_BASE_URL              = https://the1969.io
BOT_SHARED_SECRET         (same string as Vercel)
```

## Railway deploy (5 min, one-time)

1. https://railway.app → **New Project** → **Deploy from GitHub repo** → pick this repo
2. Settings → **Root Directory** = `bot-discord`
3. Settings → **Start Command** = `npm start`
4. Variables → Raw Editor → paste the Railway env block above
5. Deploy. First log line should be:
   ```
   [boot] bot=The1969Bot#0000 guild=...  general=... app=https://the1969.io
   ```

## Earn rules (server-enforced + bot-enforced)

- 1 BUSTS per qualifying chat message
- 60s cooldown between earns per user
- Min 12 chars per message (no `gm`/`gn` farming)
- 10 BUSTS/hour cap per user (bot-side)
- 100 BUSTS/day cap per user (server-side, in /api/discord-award-busts)
- Pure links / pure emoji / repeated chars → rejected silently

The server-side daily cap is the real ceiling. Bot rules just smooth
the request rate.

## How verification works

1. User clicks "Connect Discord" on /dashboard
2. Site → /api/discord-oauth-init → returns Discord auth URL
3. User authorizes → Discord redirects to /api/discord-oauth-callback
4. Server: exchanges code → fetches their Discord identity → writes
   `users.discord_id` + `users.discord_username` → uses bot token to
   PUT them into the guild via `guilds/{id}/members/{userId}`
5. Bot's GuildMemberAdd handler grants `@verified` automatically
6. Now they can chat in `#general` and earn BUSTS

If they're already in the guild, the bot lazy-grants `@verified` on
their first chat message.
