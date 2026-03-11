import { google } from "googleapis";

function isLikelyAppsScriptWebAppUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "script.google.com" &&
      parsed.pathname.includes("/macros/s/") &&
      (parsed.pathname.endsWith("/exec") || parsed.pathname.endsWith("/dev"))
    );
  } catch {
    return false;
  }
}

async function saveRecipeViaAppsScript(payload) {
  const url = process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_URL;
  if (!url) {
    throw new Error("GOOGLE_APPS_SCRIPT_WEBHOOK_URL is missing.");
  }
  if (!isLikelyAppsScriptWebAppUrl(url)) {
    throw new Error(
      "GOOGLE_APPS_SCRIPT_WEBHOOK_URL must be a deployed Apps Script web app URL ending in /exec or /dev."
    );
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_SECRET || "",
      payload,
      // Keep flat fields too for compatibility with custom script variants.
      ...payload
    }),
    redirect: "follow"
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Apps Script save failed: ${response.status} ${text}`);
  }

  const trimmed = text.trim();
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("text/html")) {
    throw new Error(
      "Apps Script webhook returned HTML, not save confirmation. Verify you used a deployment /exec URL."
    );
  }
  if (trimmed) {
    if (trimmed.toLowerCase() === "ok") {
      return;
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed?.ok === true || parsed?.success === true || parsed?.status === "ok") {
        return;
      }
    } catch {
      // Non-JSON body is handled by fallback below.
    }
  }

  throw new Error(
    `Apps Script save response did not confirm success. Expected "ok" or { ok: true }, got: ${trimmed || "<empty response>"}`
  );
}

function getAuthClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!email || !privateKey) {
    throw new Error("Google service account credentials are missing.");
  }

  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
}

export async function saveRecipeToGoogleSheet(payload) {
  if (process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_URL) {
    await saveRecipeViaAppsScript(payload);
    return;
  }

  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || "Recipes";

  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEETS_ID is missing.");
  }

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });

  const photoUrl = payload.photoUrl || "";
  const dishPhotoFormula = photoUrl ? `=IMAGE("${photoUrl.replace(/"/g, '""')}")` : "";
  const row = [
    new Date().toISOString(), // Time stamp
    payload.telegramUserId || "", // Telegram ID
    payload.telegramUsername || "", // Telegram Username
    photoUrl, // Photo URL
    dishPhotoFormula, // Dish Photo (rendered image)
    payload.title || "", // Dish Name
    (payload.ingredients || []).join(" | "), // Ingredients
    (payload.instructions || []).join(" | "), // Instructions
    (payload.tags?.cuisine || []).join(","), // Cuisine Tag
    (payload.tags?.main_ingredients || []).join(","), // Ingredients Tag
    (payload.tags?.meal_type || []).join(",") // Meal Tag
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] }
  });
}
