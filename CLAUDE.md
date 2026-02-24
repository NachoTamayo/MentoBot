# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

MentoBot is a Discord bot for **MentoPoker**, a poker school. It bridges the WooCommerce/WordPress membership platform with Discord by managing role assignment. It has two independently runnable applications plus several utility scripts.

## Running the Applications

```bash
# Install dependencies (root)
npm install

# Run the interactive bot + daily cron (main entry point)
node bot/daily.js

# Run the webhook API server (port 3010)
node api/api.js

# Utility scripts (run manually or on a schedule)
node bot/purgeRoles.js   # Adds roles to all active subs (runs every 2h internally)
node bot/changeRoles.js  # One-time: adds "anuncios" role to members with only @everyone
node bot/support.js      # Daily: nudges stale support tickets (>3 days inactive)
```

There are no tests (`npm test` exits with an error by default).

For local RabbitMQ (optional, for future worker use):
```bash
cd docker && docker compose up -d
```

## Architecture

The project is split into two applications that each create their own Discord client and connect independently:

### `bot/daily.js` — Interactive Bot + Nightly Cron
- Listens for messages in specific Discord channels (`permisosChannelID`, `soporteChannelID`, deals channel `1104058780645335171`)
- Commands: `!email <email>` links a user's email to their Discord ID in MySQL; `!sub` assigns Discord roles based on active WooCommerce memberships
- Nightly cron at `02:00 Europe/Madrid`: queries expired/unchecked memberships and removes the corresponding Discord roles, then marks them `checked = 1`
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
- `config/config.json` — used by `bot/daily.js` (and most bot scripts via `../config/config.json`)
- `api/config.json` — used by `api/api.js`
- `bot/config.json` — used by standalone bot scripts that reference `./config.json`

The config schema includes: `token`, `clientId`, `guildId`, `webhookSecret`, `adminRole`, channel IDs, MySQL credentials, table names (`userTable`, `membershipTable`), `plans` (WooCommerce plan IDs), and `roles` (Discord role ID map).

### Database (MySQL)
Two different table prefixes appear across scripts:
- `naw_*` — used by `bot/daily.js` (`naw_users`, `naw_rcp_memberships`) — older RCP memberships schema
- `ngf_*` — used by `bot/bot_aux.js` and `bot/purgeRoles.js` (`ngf_users`, `ngf_posts` with `post_type = 'wc_user_membership'`) — WooCommerce memberships schema

Each query creates and closes a new MySQL connection (no connection pool). The `mysql` package (v2) is used in most files; `mysql2` is also a dependency but not yet used.

### Subscription → Role Mapping
WooCommerce plan IDs (numeric) map to Discord role IDs. The mapping is duplicated across multiple files:
- `bot/daily.js`: `roleMappings` object (plan DB IDs → role key names) + `CONST_ROLE_NAMES` lookup
- `bot/bot_aux.js`: `getDiscordRol()` switch
- `bot/purgeRoles.js` and `bot/changeRoles.js`: `getRoles()` switch
- `api/api.js`: `getDiscordRol()` switch (with string-to-int coercion)

Key plan IDs: `8230`=cashBasic, `8185`=spinBasic, `8233`=torneosBasic, `14142`=cashPro, `8195`=spinPro, `8234`=torneosPro, `8236`=ploBasic, `8235`=ploPro, `12150`=mentoTotalBasic, `12151`=mentoTotalPro.

### Shared
- `shared/rabbit.js` — RabbitMQ connection singleton (uses env vars; not yet imported by any main script)

### PHP Files in `api/`
- `custom-webhook-mycred.php`, `custom-webhook-payload.php`, `woo-memberships-webhook-discord.php` — WordPress-side PHP scripts that send webhooks to the Node API. Not executed by Node.

## Deployment
- Procfile: `Worker: node daily.js` (Vultr/Heroku-style)
- The bot is deployed on Vultr; GitHub pushes trigger redeploy
