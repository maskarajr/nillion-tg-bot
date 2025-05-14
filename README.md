# Telegram Bot

A standalone Telegram bot for Nillion verification.

## Features
- User verification via HTTP API
- Health check endpoint

## Setup

1. **Install dependencies:**
   ```sh
   npm install
   ```
2. **Configure environment variables:**
   - Copy `.env.example` to `.env` and fill in your `TELEGRAM_BOT_TOKEN` and any other required variables.

3. **Build the project:**
   ```sh
   npm run build
   ```

4. **Run the bot:**
   ```sh
   npm start
   ```
   Or for development:
   ```sh
   npm run dev
   ```

## API Endpoints
- `GET /` — Health check
- `GET /api/verify?userId=...&groupId=...` — Verify user by ID

## Deployment
- Deploy to Railway, Render, or any Node.js hosting platform.
- Set environment variables in your deployment dashboard.
- Use the build/start commands:
  - Build: `npm run build`
  - Start: `npm start`

---

MIT License
