# Family Cookbook Bot (Long Polling + Supabase)

This project now follows this flow:

1. Family member sends dish photo and recipe details in Telegram.
2. Bot receives updates from Telegram via long polling.
3. Bot uses OpenAI to transcribe voice (if needed) and parse recipe JSON.
4. Dish photo is uploaded to Supabase Storage.
5. Final recipe is saved to Supabase Database.
6. Next.js website reads from Supabase and renders the cookbook UI.

## Required setup

### Telegram
- Create a bot with [@BotFather](https://t.me/BotFather).
- Copy `TELEGRAM_BOT_TOKEN`.

### OpenAI
- Create and set `OPENAI_API_KEY`.

### Supabase
- Create a project and copy:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Create a storage bucket (default: `recipe-images`).
- Create a table (default: `recipes`) with columns matching payload fields in `src/supabase.js`.

## Environment variables

Copy and fill:

```bash
cp .env.example .env
```

Required:
- `TELEGRAM_BOT_TOKEN`
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:
- `SUPABASE_STORAGE_BUCKET` (default `recipe-images`)
- `SUPABASE_RECIPES_TABLE` (default `recipes`)
- `OPENAI_TEXT_MODEL`
- `OPENAI_TRANSCRIBE_MODEL`

## Run

```bash
npm install
npm start
```

## Notes

- The bot runs in long polling mode (no webhook setup needed).
- Pending in-chat state is still in memory; use Redis/DB for resilient conversational state if needed.
