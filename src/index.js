import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import { pendingByUser } from "./state.js";
import {
  formatRecipeWithTags,
  renderRecipeForTelegram,
  transcribeAudio
} from "./recipeFormatter.js";
import { saveRecipeToGoogleSheet } from "./sheets.js";

const requiredEnv = ["TELEGRAM_BOT_TOKEN", "OPENAI_API_KEY"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

function getUserKey(ctx) {
  return String(ctx.from?.id || "unknown");
}

function getDisplayName(ctx) {
  return (
    ctx.from?.first_name ||
    ctx.from?.username ||
    `${ctx.from?.id || "unknown-user"}`
  );
}

async function downloadTelegramFileBuffer(ctx, fileId) {
  const link = await ctx.telegram.getFileLink(fileId);
  const response = await fetch(link.href);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function getTelegramFileUrl(ctx, fileId) {
  const link = await ctx.telegram.getFileLink(fileId);
  return link.href;
}

function getLargestPhoto(photos = []) {
  return photos.reduce((best, current) => {
    if (!best) return current;
    const bestArea = (best.width || 0) * (best.height || 0);
    const currentArea = (current.width || 0) * (current.height || 0);
    return currentArea > bestArea ? current : best;
  }, null);
}

function hasGreeting(text = "") {
  const normalized = text.toLowerCase();
  return /\b(hello|hi|hey|привет|здравствуй|здравствуйте)\b/u.test(normalized);
}

function hasBotMention(ctx) {
  const text = ctx.message?.text || "";
  const entities = ctx.message?.entities || [];
  const botUsername = (ctx.botInfo?.username || "").toLowerCase();
  const normalizedText = text.toLowerCase();

  const mentionedInEntities = entities.some((entity) => {
    if (entity.type === "mention") {
      const mentionText = text
        .slice(entity.offset, entity.offset + entity.length)
        .toLowerCase();
      return botUsername ? mentionText === `@${botUsername}` : mentionText.startsWith("@");
    }
    if (entity.type === "text_mention") {
      return (
        String(entity.user?.id || "") === String(ctx.botInfo?.id || "") ||
        String(entity.user?.username || "").toLowerCase() === botUsername
      );
    }
    return false;
  });

  if (mentionedInEntities) {
    return true;
  }

  // Fallback: some clients/message shapes may not include mention entities reliably.
  return botUsername ? normalizedText.includes(`@${botUsername}`) : false;
}

function shouldSendGreetingIntro(ctx) {
  const text = ctx.message?.text || "";
  if (!hasGreeting(text)) {
    return false;
  }

  const chatType = ctx.chat?.type || "";
  if (chatType === "private") {
    return true;
  }

  return hasBotMention(ctx);
}

async function generateAndPreviewRecipe(ctx, userState, userText) {
  const recipe = await formatRecipeWithTags(userText, "auto");
  userState.formattedRecipe = recipe;
  userState.rawInput = userText;
  userState.stage = "awaiting_approval";
  pendingByUser.set(userState.userId, userState);

  await ctx.replyWithMarkdown(
    `${renderRecipeForTelegram(recipe)}\n\nIs everything correct?`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback("Yes, save it", "recipe_yes"),
        Markup.button.callback("No, edit", "recipe_no")
      ]
    ])
  );
}

bot.start(async (ctx) => {
  await ctx.reply(
    "Send a dish photo to start. I will collect recipe text or voice in RU/EN, normalize it, tag it, and ask for confirmation before saving."
  );
});

bot.on("photo", async (ctx) => {
  const largest = getLargestPhoto(ctx.message.photo || []);
  if (!largest) {
    await ctx.reply("I could not read that photo. Please try again.");
    return;
  }

  const userId = getUserKey(ctx);
  let photoUrl = "";
  try {
    photoUrl = await getTelegramFileUrl(ctx, largest.file_id);
  } catch (error) {
    console.warn("Could not resolve Telegram photo URL:", error);
  }

  pendingByUser.set(userId, {
    userId,
    stage: "awaiting_recipe_input",
    photoFileId: largest.file_id,
    photoUrl,
    formattedRecipe: null,
    rawInput: ""
  });

  await ctx.reply(
    "Great photo. Now send ingredients and instructions in one message.\n\nYou can send text or voice memo in Russian or English."
  );
});

bot.on("voice", async (ctx) => {
  const userId = getUserKey(ctx);
  const userState = pendingByUser.get(userId);

  if (!userState || !["awaiting_recipe_input", "awaiting_corrections"].includes(userState.stage)) {
    await ctx.reply("Please send a dish photo first.");
    return;
  }

  await ctx.reply("Got your voice memo. Transcribing and formatting...");

  try {
    const voiceFileId = ctx.message.voice?.file_id;
    if (!voiceFileId) {
      await ctx.reply("Could not read voice memo. Please try again.");
      return;
    }
    const buffer = await downloadTelegramFileBuffer(ctx, voiceFileId);
    const transcript = await transcribeAudio(buffer, "voice.ogg");

    if (!transcript) {
      await ctx.reply("Transcription was empty. Please send text or try voice again.");
      return;
    }

    let textForModel = transcript;
    if (userState.stage === "awaiting_corrections" && userState.formattedRecipe) {
      textForModel = [
        "Current recipe JSON draft:",
        JSON.stringify(userState.formattedRecipe),
        "",
        "User correction instructions:",
        transcript
      ].join("\n");
    }

    await generateAndPreviewRecipe(ctx, userState, textForModel);
  } catch (error) {
    console.error(error);
    await ctx.reply("I hit an error while processing voice. Please try again.");
  }
});

bot.on("text", async (ctx) => {
  const userId = getUserKey(ctx);
  const userState = pendingByUser.get(userId);

  if (shouldSendGreetingIntro(ctx)) {
    await ctx.reply(
      [
        "Hi! I am your Family Cookbook Bot.",
        "I help turn your family dishes into clean, searchable recipes and save them to your cookbook sheet.",
        "",
        "How to use me step by step:",
        "1) Send a photo of the dish.",
        "2) Send ingredients + instructions in one message (or send a voice memo in RU/EN).",
        "3) I format, normalize, and tag the recipe.",
        "4) I show a preview for approval.",
        "5) Tap 'Yes, save it' to save, or 'No, edit' to send corrections.",
        "",
        "Start anytime by sending a dish photo."
      ].join("\n")
    );
    return;
  }

  if (!userState || !["awaiting_recipe_input", "awaiting_corrections"].includes(userState.stage)) {
    return;
  }

  await ctx.reply("Formatting and tagging your recipe...");

  try {
    const text = ctx.message.text || "";
    let textForModel = text;
    if (userState.stage === "awaiting_corrections" && userState.formattedRecipe) {
      textForModel = [
        "Current recipe JSON draft:",
        JSON.stringify(userState.formattedRecipe),
        "",
        "User correction instructions:",
        text
      ].join("\n");
    }
    await generateAndPreviewRecipe(ctx, userState, textForModel);
  } catch (error) {
    console.error(error);
    await ctx.reply("I hit an error while formatting. Please try again.");
  }
});

bot.action("recipe_no", async (ctx) => {
  const userId = getUserKey(ctx);
  const userState = pendingByUser.get(userId);
  if (!userState || userState.stage !== "awaiting_approval") {
    await ctx.answerCbQuery("Nothing pending.");
    return;
  }

  userState.stage = "awaiting_corrections";
  pendingByUser.set(userId, userState);

  await ctx.answerCbQuery();
  await ctx.reply("Please send what should change (text or voice).");
});

bot.action("recipe_yes", async (ctx) => {
  const userId = getUserKey(ctx);
  const userState = pendingByUser.get(userId);
  if (!userState || userState.stage !== "awaiting_approval" || !userState.formattedRecipe) {
    await ctx.answerCbQuery("Nothing to save.");
    return;
  }

  await ctx.answerCbQuery("Saving...");

  try {
    let resolvedPhotoUrl = userState.photoUrl || "";
    if (!resolvedPhotoUrl && userState.photoFileId) {
      try {
        resolvedPhotoUrl = await getTelegramFileUrl(ctx, userState.photoFileId);
      } catch (error) {
        console.warn("Could not resolve Telegram photo URL at save time:", error);
      }
    }

    const r = userState.formattedRecipe;
    await saveRecipeToGoogleSheet({
      submittedBy: getDisplayName(ctx),
      telegramUserId: String(ctx.from?.id || ""),
      telegramUsername: ctx.from?.username || "",
      photoFileId: userState.photoFileId || "",
      photoUrl: resolvedPhotoUrl,
      title: r.title || "",
      story: r.story || "",
      ingredients: r.ingredients || [],
      instructions: r.instructions || [],
      timeMinutes: r.time_minutes || 0,
      servings: r.servings || "",
      tags: r.tags || {},
      sourceLanguage: r.source_language || "",
      rawInput: userState.rawInput || ""
    });

    pendingByUser.delete(userId);
    await ctx.reply("Saved successfully. Send another dish photo anytime.");
  } catch (error) {
    console.error(error);
    await ctx.reply(
      "I could not save to Google Sheets. Check credentials/permissions and ensure Apps Script webhook URL is a deployed /exec endpoint."
    );
  }
});

bot.catch((error) => {
  console.error("Bot error:", error);
});

bot.launch().then(() => {
  console.log("Family cookbook bot is running.");
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
