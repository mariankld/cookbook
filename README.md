# Neklyudov's Recipes Bot (MVP)

This project implements your requested flow:

1. Family sends a dish photo in Telegram.
2. Bot asks for ingredients + instructions.
3. User replies in text or voice memo (RU/EN).
4. OpenAI transcribes (if voice), reformats to uniform English recipe, and adds tags.
5. Bot sends final recipe preview and asks for confirmation with **Yes/No** buttons.
6. If **Yes**, recipe is saved to Google Sheets (your dynamic source for later website).

## 1) Create required accounts/keys

### Telegram
- Open [@BotFather](https://t.me/BotFather)
- Create bot (`/newbot`) and copy bot token.
- Add bot to your family group chat.
- Disable privacy mode in BotFather (`/setprivacy` -> `Disable`) so the bot can read messages in group flow.

### OpenAI
- Create API key and copy it.

### Google Sheets (recommended for MVP storage)
- Create a Google Sheet with tab name `Recipes`.
- Create a Google Cloud service account.
- Enable Google Sheets API.
- Generate service account JSON key.
- Share your sheet with the service account email as **Editor**.

If Google blocks service account key creation, use the **Apps Script webhook path** below (no key needed).

## 2) Prepare your sheet columns

The bot appends rows in this order:

1. timestamp
2. telegram_id
3. telegram_username
4. photo_url
5. dish_photo
6. dish_name
7. ingredients
8. instructions
9. cuisine_tag
10. ingredients_tag
11. meal_tag

Put these headers in row 1 for clarity (optional but recommended).

## 3) Configure environment

Copy `.env.example` to `.env` and fill values:

```bash
cp .env.example .env
```

Required:
- `TELEGRAM_BOT_TOKEN`
- `OPENAI_API_KEY`
- Either:
  - Service account mode:
    - `GOOGLE_SHEETS_ID`
    - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
    - `GOOGLE_PRIVATE_KEY`
  - Or Apps Script mode (simpler if key creation is blocked):
    - `GOOGLE_APPS_SCRIPT_WEBHOOK_URL`
    - `GOOGLE_APPS_SCRIPT_WEBHOOK_SECRET` (optional but recommended)

`GOOGLE_PRIVATE_KEY` must keep `\n` line breaks as shown in the example.

## Apps Script fallback (no service account key required)

If you cannot create service-account JSON keys, do this:

1. Open your Google Sheet.
2. `Extensions` -> `Apps Script`.
3. Replace code with:

```javascript
function doPost(e) {
  const cfgSecret = PropertiesService.getScriptProperties().getProperty("WEBHOOK_SECRET") || "";
  const body = JSON.parse(e.postData.contents || "{}");
  const secret = body.secret || "";
  if (cfgSecret && secret !== cfgSecret) {
    return ContentService.createTextOutput("unauthorized").setMimeType(ContentService.MimeType.TEXT);
  }

  const p = body.payload || {};
  const ss = SpreadsheetApp.openById("PUT_SPREADSHEET_ID_HERE");
  const sheet = ss.getSheetByName("Recipes") || ss.insertSheet("Recipes");

  sheet.appendRow([
    new Date().toISOString(),
    p.telegramUserId || "",
    p.telegramUsername || "",
    p.photoUrl || "",
    p.photoUrl ? '=IMAGE("' + p.photoUrl.replace(/"/g, '""') + '")' : "",
    p.title || "",
    (p.ingredients || []).join(" | "),
    (p.instructions || []).join(" | "),
    ((p.tags || {}).cuisine || []).join(","),
    ((p.tags || {}).main_ingredients || []).join(","),
    ((p.tags || {}).meal_type || []).join(",")
  ]);

  return ContentService.createTextOutput("ok").setMimeType(ContentService.MimeType.TEXT);
}
```

4. In Apps Script: `Project Settings` -> `Script Properties` -> add:
   - Key: `WEBHOOK_SECRET`
   - Value: any random secret string
5. `Deploy` -> `New deployment` -> type `Web app`
   - Execute as: `Me`
   - Who has access: `Anyone`
6. Copy the web app URL into:
   - `GOOGLE_APPS_SCRIPT_WEBHOOK_URL=...`
   - `GOOGLE_APPS_SCRIPT_WEBHOOK_SECRET=...`
7. You do not need service-account fields for this mode.

## 4) Install and run

```bash
npm install
npm start
```

If running correctly, terminal prints:

`Family cookbook bot is running.`

## 4.1) Deploy so bot is always live

For 24/7 uptime, deploy as a **background worker** (not a web server).

### Option A: Railway (quickest)

1. Push this project to GitHub.
2. In Railway: `New Project` -> `Deploy from GitHub repo`.
3. Railway detects Node app automatically.
4. Set service `Start Command` to:

```bash
npm start
```

5. Add environment variables from your local `.env`:
   - `TELEGRAM_BOT_TOKEN`
   - `OPENAI_API_KEY`
   - `OPENAI_TEXT_MODEL` (optional)
   - `OPENAI_TRANSCRIBE_MODEL` (optional)
   - `GOOGLE_APPS_SCRIPT_WEBHOOK_URL` + `GOOGLE_APPS_SCRIPT_WEBHOOK_SECRET`
     - OR Google service account vars (`GOOGLE_SHEETS_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`)
6. Deploy and open logs. You should see:
   - `Family cookbook bot is running.`

### Option B: Render Worker

This repo already includes `render.yaml` for one-click worker setup.

1. Push this project to GitHub.
2. In Render: `New` -> `Blueprint` -> select this repo.
3. Render creates `family-cookbook-bot` worker from `render.yaml`.
4. Add the same environment variables in Render dashboard.
5. Deploy and check logs for:
   - `Family cookbook bot is running.`

### Keep it reliable

- Keep only one running instance (Telegram long polling should run once).
- If you change secrets/tokens, restart the worker.
- Keep `.env` local only; store secrets in Railway/Render environment settings.

## 5) Test the exact flow

1. Send photo in the family chat.
2. Bot asks for recipe.
3. Send text in RU/EN or send voice memo.
4. Bot returns standardized English recipe with tags.
5. Click:
   - **Yes, save it** -> saves to Google Sheets
   - **No, edit** -> send corrections, bot regenerates and asks again

## 6) How this becomes a website later

Your Google Sheet becomes the source for:
- Softr (fast no-code website), or
- Glide, or
- custom website (Next.js + Airtable/Sheet sync)

This means your Telegram workflow stays the same while frontend evolves.

## Notes

- Current state is in-memory; if bot restarts, pending unconfirmed submissions are lost.
- For production stability, move state to Redis or a DB.
- If you want direct Google Form submission API instead of Sheet rows, that can be added in phase 2.
