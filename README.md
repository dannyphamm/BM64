# BM64

Discord bot for the BM64 server. Handles music, voice text auto-cleanup, gaming presence tracking, scrapers (Uniqlo / K-drama), LoL match posts, Tidal playlist import, and Palworld update restarts.

## Features

- Music playback via DisTube (YouTube, Spotify, and more)
- Text-in-voice cleanup: messages in voice chat auto-delete after 15 minutes
- Presence / gaming session tracking with daily summaries
- Uniqlo sale trackers, K-drama episode tracker
- League of Legends match tracker (`/lol`) — see [README-LOL-TRACKER.md](README-LOL-TRACKER.md)
- Tidal private playlist import
- Palworld Steam update checks and crash auto-restart via Pelican/Pterodactyl

## Requirements

- [Node.js](https://nodejs.org/en/) 20+
- [Node-GYP](https://github.com/nodejs/node-gyp) (for native voice deps): `npm install -g node-gyp`
- MongoDB

## Getting started

```bash
git clone https://github.com/s3719046/BM64.git
cd BM64/
yarn install
# or: npm install
cp config.json.example config.json
# fill in secrets in config.json
```

### Configuration

Copy `config.json.example` to `config.json` (gitignored) and fill in values.

Important keys:

| Key | Purpose |
| --- | --- |
| `mode` | `"DEV"` skips scheduled jobs / voice automation; anything else runs production jobs |
| `token` / `clientId` / `guildId` | Discord bot credentials |
| `mongodbURI` | MongoDB connection string |
| `ppTracking` | Array of `{ userId, channelId, username }` for gaming tracking |
| `riotApiKey` | Riot API key for LoL tracker |
| `tidalAuthClientID` / `tidalAuthClientSecret` | Tidal device-login app credentials |
| `pelicanUrl` / `pelicanApiKey` / `pelicanServerId` | Palworld server control |
| `palworldCrashDetection` | Auto-start Palworld if Pelican reports offline (default `true`) |
| `palworldCrashCooldownMinutes` | Minutes between start attempts after a crash (default `5`) |
| `palworldCrashQuietStart` | Local time (`HH:MM`) to pause crash auto-start for Pelican's daily restart (default `05:55`) |
| `palworldCrashQuietMinutes` | Quiet-window length in minutes (default `10`) |

### Scripts

```bash
yarn start          # node .
yarn dev            # nodemon .
yarn lint           # eslint
node deploy-commands.js   # sync guild slash commands (uses config.json)
```

Optional: Socket.IO for the Spotify browser bridge binds to `127.0.0.1:3000` by default. Override with `SOCKET_HOST` / `SOCKET_PORT`.

## Gaming features

### Daily gaming summary

Tracks gaming activity for users listed in `ppTracking` and can post daily summaries (playtime + session counts).

### Commands

- `/gamesummary` — current daily gaming stats
- `/yitlpp` — longer-range gaming stats / charts

## Security notes

- Never commit `config.json`. Rotate any credentials that were ever committed to git history.
- Keep the bot host and Socket.IO port off the public internet when possible.
