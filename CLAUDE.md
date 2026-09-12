# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

MentoBot is a Discord bot for **MentoPoker**, a poker school. It bridges the WooCommerce/WordPress membership platform with Discord by managing role assignment. It has two independently runnable applications plus several utility scripts.

## Running the Applications

```bash
# Install dependencies (root)
npm install

# Run the interactive bot (main entry point)
node bot/daily.js

# Run the webhook API server (port 3010)
node api/api.js

# Utility scripts (run manually or on a schedule)
node bot/roleSync.js     # V4-backed role sync for the whole guild (runs every 2h internally)
node bot/support.js      # Daily: nudges stale support tickets (>3 days inactive)
```

There are no tests (`npm test` exits with an error by default).

For local RabbitMQ (optional, for future worker use):
```bash
cd docker && docker compose up -d
```

## Architecture

The project is split into two applications that each create their own Discord client and connect independently:

### `bot/daily.js` — Interactive Bot
- Listens for messages in specific Discord channels (`permisosChannelID`, `soporteChannelID`, deals channel `1104058780645335171`)
- Commands: `!email <email>` links a user's email to their Discord ID in MySQL; `!sub` assigns Discord roles based on active WooCommerce memberships
- Reads config from `../config/config.json`

### `api/api.js` — Webhook Server (Express + Discord)
- Express app on port `3010`
- `/api/subUpdated` — WooCommerce membership webhook (HMAC-SHA256, base64); adds/removes roles on `active`/`expired` status changes
- `/api/rankUpdated` — myCRED rank webhook (HMAC-SHA256, hex); adds Discord role on promotion
- `/api/orderUpdated` — WooCommerce order webhook; posts new order notifications to a "pedidos" channel in a dev server (`mentoDevGuildId`)
- `/healthz` — health check
- Reads config from `./config.json` (i.e., `api/config.json`)

### Config Files
Each app has its own `config.json`:
- `config/config.json` — used by `bot/daily.js` and `bot/roleSync.js`
- `api/config.json` — used by `api/api.js`
- `bot/config.json` — retired: was a stale duplicate read by `bot/purgeRoles.js`/`bot/removeRoles.js`/`bot/changeRoles.js`/`bot/bot_aux.js`, all now deleted. Nothing in the repo reads it any more; the file itself is gitignored and gets deleted by hand on the production server.

The config schema includes: `token`, `clientId`, `guildId`, `webhookSecret`, `adminRole`, channel IDs, MySQL credentials, table names (`userTable`, `membershipTable`), `plans` (WooCommerce plan IDs), and `roles` (Discord role ID map).

### Database (MySQL)
- `naw_*` — still used by `bot/daily.js`'s `!subdoble` admin command (`naw_rcp_memberships`) — the only remaining MySQL read/write path in the bot; everything else resolves role/plan state from the V4 API (see `bot/v4Client.js`)
- `ngf_*` — no longer used anywhere in this repo (was read by `bot/bot_aux.js` and `bot/purgeRoles.js`, both removed)

Each query creates and closes a new MySQL connection (no connection pool). The `mysql` package (v2) is used; `mysql2` is also a dependency but not yet used.

### Subscription → Role Mapping
- `bot/daily.js` (`!sub`) and `bot/roleSync.js` share `bot/planRoleMap.js`, keyed by V4 plan slug (e.g. `cash-pro`) — the only mapping either file uses.
- `api/api.js` keeps its own separate `getDiscordRol()` switch, keyed by numeric WooCommerce plan IDs (with string-to-int coercion) — it does not read V4 or `planRoleMap.js`. Key plan IDs: `8230`=cashBasic, `8185`=spinBasic, `8233`=torneosBasic, `14142`=cashPro, `8195`=spinPro, `8234`=torneosPro, `8236`=ploBasic, `8235`=ploPro, `12150`=mentoTotalBasic, `12151`=mentoTotalPro.

### Shared
- `shared/rabbit.js` — RabbitMQ connection singleton (uses env vars; not yet imported by any main script)

### PHP Files in `api/`
- `custom-webhook-mycred.php`, `custom-webhook-payload.php`, `woo-memberships-webhook-discord.php` — WordPress-side PHP scripts that send webhooks to the Node API. Not executed by Node.

## Deployment
- Procfile: `Worker: node daily.js` (Vultr/Heroku-style)
- The bot is deployed on Vultr; GitHub pushes trigger redeploy
