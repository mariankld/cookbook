import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import { pendingByChat } from "./state.js";
import {
  formatRecipeWithTags,
  renderRecipeForTelegram,
  transcribeAudio
} from "./recipeFormatter.js";
import { saveRecipeToSupabase, uploadRecipeImage } from "./supabase.js";

const requiredEnv = ["TELEGRAM_BOT_TOKEN", "OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

function getChatKey(ctx) {
  return String(ctx.chat?.id || ctx.from?.id || "unknown");
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

async function getTelegramFileMeta(ctx, fileId) {
  const file = await ctx.telegram.getFile(fileId);
  return {
    filePath: file.file_path || "",
    fileSize: file.file_size || 0
  };
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

function extractServingsCount(text = "") {
  const match = text.match(/\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const numeric = Number(match[0].replace(",", "."));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric);
}

function buildRecipeInputWithServings(recipeInput, servingsCount) {
  return [
    recipeInput,
    "",
    `Confirmed servings from user: ${servingsCount}`
  ].join("\n");
}

async function generateAndPreviewRecipe(ctx, userState, userText) {
  const recipe = await formatRecipeWithTags(userText, "auto", userState.photoUrl || "");
  userState.formattedRecipe = recipe;
  userState.rawInput = userText;
  userState.pendingRecipeInput = "";
  userState.stage = "awaiting_approval";
  pendingByChat.set(userState.chatId, userState);

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

  const chatId = getChatKey(ctx);
  const senderId = String(ctx.from?.id || "");
  let uploadedPhotoUrl = "";
  try {
    const [photoBuffer, photoMeta] = await Promise.all([
      downloadTelegramFileBuffer(ctx, largest.file_id),
      getTelegramFileMeta(ctx, largest.file_id)
    ]);
    uploadedPhotoUrl = await uploadRecipeImage({
      userId: senderId || chatId,
      fileId: largest.file_id,
      filePath: photoMeta.filePath,
      buffer: photoBuffer
    });
  } catch (error) {
    console.warn("Could not upload photo to Supabase storage:", error);
  }

  pendingByChat.set(chatId, {
    chatId,
    stage: "awaiting_recipe_input",
    photoFileId: largest.file_id,
    photoUrl: uploadedPhotoUrl,
    formattedRecipe: null,
    rawInput: "",
    pendingRecipeInput: ""
  });

  await ctx.reply(
    "Great photo. Now send ingredients and instructions in one message.\n\nYou can send text or voice memo in Russian or English."
  );
});

bot.on("voice", async (ctx) => {
  const chatId = getChatKey(ctx);
  const userState = pendingByChat.get(chatId);

  if (
    !userState ||
    !["awaiting_recipe_input", "awaiting_corrections", "awaiting_servings"].includes(userState.stage)
  ) {
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

    if (userState.stage === "awaiting_recipe_input") {
      userState.pendingRecipeInput = transcript;
      userState.stage = "awaiting_servings";
      pendingByChat.set(chatId, userState);
      await ctx.reply('How many servings did this recipe produce? Please respond with a number ex "2"');
      return;
    }

    if (userState.stage === "awaiting_servings") {
      const servingsCount = extractServingsCount(transcript);
      if (!servingsCount) {
        await ctx.reply('I could not find a servings number. Please respond with a number ex "2".');
        return;
      }
      await ctx.reply("Great, formatting and tagging your recipe...");
      const textForModel = buildRecipeInputWithServings(
        userState.pendingRecipeInput || "",
        servingsCount
      );
      await generateAndPreviewRecipe(ctx, userState, textForModel);
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
  const chatId = getChatKey(ctx);
  const userState = pendingByChat.get(chatId);

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

  if (!userState) {
    return;
  }

  try {
    const text = ctx.message.text || "";

    if (userState.stage === "awaiting_recipe_input") {
      userState.pendingRecipeInput = text;
      userState.stage = "awaiting_servings";
      pendingByChat.set(chatId, userState);
      await ctx.reply('How many servings did this recipe produce? Please respond with a number ex "2"');
      return;
    }

    if (userState.stage === "awaiting_servings") {
      const servingsCount = extractServingsCount(text);
      if (!servingsCount) {
        await ctx.reply('I could not find a servings number. Please respond with a number ex "2".');
        return;
      }
      await ctx.reply("Formatting and tagging your recipe...");
      const textForModel = buildRecipeInputWithServings(
        userState.pendingRecipeInput || "",
        servingsCount
      );
      await generateAndPreviewRecipe(ctx, userState, textForModel);
      return;
    }

    if (userState.stage !== "awaiting_corrections") {
      return;
    }

    await ctx.reply("Formatting and tagging your recipe...");
    let textForModel = text;
    if (userState.formattedRecipe) {
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
  const chatId = getChatKey(ctx);
  const userState = pendingByChat.get(chatId);
  if (!userState || userState.stage !== "awaiting_approval") {
    await ctx.answerCbQuery("Nothing pending.");
    return;
  }

  userState.stage = "awaiting_corrections";
  pendingByChat.set(chatId, userState);

  await ctx.answerCbQuery();
  await ctx.reply("Please send what should change (text or voice).");
});

bot.action("recipe_yes", async (ctx) => {
  const chatId = getChatKey(ctx);
  const userState = pendingByChat.get(chatId);
  if (!userState || userState.stage !== "awaiting_approval" || !userState.formattedRecipe) {
    await ctx.answerCbQuery("Nothing to save.");
    return;
  }

  await ctx.answerCbQuery("Saving...");

  try {
    const r = userState.formattedRecipe;
    await saveRecipeToSupabase({
      submittedBy: getDisplayName(ctx),
      telegramUserId: String(ctx.from?.id || ""),
      telegramUsername: ctx.from?.username || "",
      photoFileId: userState.photoFileId || "",
      photoUrl: userState.photoUrl || "",
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

    pendingByChat.delete(chatId);
    await ctx.reply("Saved successfully. Send another dish photo anytime.");
  } catch (error) {
    console.error(error);
    await ctx.reply("I could not save to Supabase. Check your storage bucket/table permissions and env keys.");
  }
});

bot.catch((error) => {
  console.error("Bot error:", error);
});

bot
  .launch()
  .then(() => {
    console.log("Family cookbook bot is running in long polling mode.");
  })
  .catch((error) => {
    console.error("Failed to launch bot:", error);
    process.exit(1);
  });

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
