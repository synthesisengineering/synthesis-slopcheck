# Slopcheck Slack Bot (self-hosted)

A Python Slack bot that runs slopcheck when you @-mention it in a channel or DM it. Replies in-thread with the analysis.

## Why self-hosted

Slack's app distribution model assumes either a single-workspace install or a published app reviewed by Slack. For newsrooms, agencies, and internal teams, self-host is the simplest path: each team runs their own bot, pointing at the public slopcheck hosted-tier API or their own BYOK key.

## Quick install

```sh
cd integrations/slack
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export SLACK_BOT_TOKEN=xoxb-...
export SLACK_SIGNING_SECRET=...
export SLACK_APP_TOKEN=xapp-...  # required for Socket Mode

# Optional — BYOK instead of hosted tier:
# export SLOPCHECK_BYOK_PROVIDER=anthropic
# export SLOPCHECK_BYOK_KEY=sk-ant-...

python slopcheck_slack_bot.py
```

The bot uses Slack's Socket Mode, so no public URL or webhook reverse-proxy is required. The bot runs as a long-lived process that maintains an outbound websocket connection to Slack.

## One-time Slack app setup

1. Go to https://api.slack.com/apps and click **Create New App** → **From scratch**.
2. Name it `Slopcheck` (or your team's preferred name).
3. Pick the workspace to install in.
4. Under **Socket Mode**: enable. Click **Generate Token and Scopes**, name it `socket`, add the `connections:write` scope. Save the `xapp-...` token as `SLACK_APP_TOKEN`.
5. Under **OAuth & Permissions** → **Bot Token Scopes**, add:
   - `app_mentions:read`
   - `chat:write`
   - `im:history`
   - `im:read`
   - `im:write`
   - `channels:history` (for reading thread parents)
6. Click **Install to Workspace**. Approve. Copy the `xoxb-...` bot token as `SLACK_BOT_TOKEN`.
7. Under **Basic Information**, copy the **Signing Secret** as `SLACK_SIGNING_SECRET`.
8. Under **Event Subscriptions**: enable. Subscribe to bot events:
   - `app_mention`
   - `message.im`

## Deployment

For a long-lived process, deploy to any platform that runs Python:

- **Fly.io** (free tier): `flyctl launch` with this directory.
- **Render**: connect this directory as a "Background Worker."
- **Railway**: same.
- **Your own server**: `tmux` + `python slopcheck_slack_bot.py`.

Set the three environment variables in your platform's secret store.

## Testing

In any channel where the bot is added, post:

```
@Slopcheck Here's my draft article: [paste content here]
```

Or DM the bot directly with the content. The bot replies in-thread (channel mention) or in the DM (direct message) with the structured slopcheck analysis.

## What this bot stores

Nothing. The bot is stateless. Slack itself keeps the messages in your workspace; this bot does not duplicate that storage.

## License

MIT. Open source: https://github.com/synthesisengineering/synthesis-slopcheck.
