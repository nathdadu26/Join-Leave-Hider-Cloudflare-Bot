# Join Leave Hider Telegram Bot (Cloudflare Worker)

A simple Telegram bot deployed on **Cloudflare Workers** that automatically **deletes join and leave messages** in groups to keep chats clean.

## Features
- 🧹 Auto delete **join / leave messages**
- 👤 Save users who start the bot
- 📢 **Broadcast to users**
- 📣 **Broadcast to groups/channels**
- ☁️ Runs on **Cloudflare Workers**
- 🗂 Uses **KV Storage**

## Required KV Namespaces
- `USERS`
- `CHANNELS`
- `BROADCAST_STATE`

## Setup

1. Deploy the Worker.
2. Add KV namespaces to the Worker.
3. Set variables in code:
   - `BOT_TOKEN`
   - `ADMIN_ID`
   - `CHANNEL_LINK`
4. Set webhook:

'''https://your-worker-domain/setup-webhook

## Commands
- `/start` – Start the bot
- `/channel_broadcast` – Broadcast to groups
- `/user_broadcast` – Broadcast to users
- `/cancel` – Cancel broadcast

## How it Works
Add the bot to your group as **Admin with Delete Messages permission** and it will automatically remove **join/leave notifications**.

---

Made with ❤️ using Chat GPT.
