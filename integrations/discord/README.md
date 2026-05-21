# Slopcheck Discord Bot (self-hosted)

A Python Discord bot that runs slopcheck. Two ways to invoke:

- **Slash command:** `/slopcheck text:<your content>`
- **Right-click on any message** → Apps → **Slopcheck this message**

## Quick install

```sh
cd integrations/discord
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export DISCORD_BOT_TOKEN=...

# Optional — BYOK instead of hosted tier:
# export SLOPCHECK_BYOK_PROVIDER=anthropic
# export SLOPCHECK_BYOK_KEY=sk-ant-...

python slopcheck_discord_bot.py
```

## One-time Discord app setup

1. Go to https://discord.com/developers/applications and click **New Application**. Name it `Slopcheck`.
2. **Bot** tab → **Add Bot**. Copy the token as `DISCORD_BOT_TOKEN`.
3. Under **Privileged Gateway Intents**, enable **Message Content Intent**.
4. **OAuth2 → URL Generator**:
   - **Scopes:** `bot`, `applications.commands`
   - **Bot Permissions:** `Send Messages`, `Read Message History`, `Use Slash Commands`
   - Copy the generated URL and open it in a browser; pick the server to install the bot in.
5. Start the bot. It auto-syncs the slash command and context-menu command on first connect.

## Deployment

For a long-lived process:

- **Fly.io** (free tier): `flyctl launch` with this directory.
- **Render / Railway**: connect this directory as a "Background Worker."
- **Your own server**: `tmux` + `python slopcheck_discord_bot.py`.

## What this bot stores

Nothing. The bot is stateless. Discord itself keeps the messages in your server; this bot does not duplicate that storage.

## License

MIT. Open source: https://github.com/synthesisengineering/synthesis-slopcheck.
