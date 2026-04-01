import { resolveAgentModelPrimaryValue } from "../../config/model-input.js";
import { updateSessionStore } from "../../config/sessions/store.js";
import { logVerbose } from "../../globals.js";
import {
  buildImageGenerationModelAliasIndex,
  resolveImageGenerationModelRef,
} from "../../image-generation/model-alias.js";
import type { CommandHandler } from "./commands-types.js";

/**
 * Format the current image model from session entry fields.
 */
function formatCurrentImageModel(provider?: string, model?: string): string | undefined {
  if (!model) {
    return undefined;
  }
  return provider ? `${provider}/${model}` : model;
}

/**
 * Self-contained handler for /image-model command.
 * Does its own parsing + session persistence — not dependent on directive chain.
 */
export const handleImageModelCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }

  const normalized = params.command.commandBodyNormalized.trim();

  // Match /image-model with optional argument
  const match = normalized.match(/^\/image-model(?:\s+([A-Za-z0-9_.:@/-]+))?$/i);
  if (!match) {
    return null;
  }

  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /image-model from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }

  const arg = match[1]?.trim();
  const sessionEntry = params.sessionEntry;
  const sessionKey = params.sessionKey;
  const storePath = params.storePath;

  // Build alias index from config
  const aliasIndex = buildImageGenerationModelAliasIndex(params.cfg);

  // No argument: show current override
  if (!arg) {
    const current =
      formatCurrentImageModel(sessionEntry?.imageModelProvider, sessionEntry?.imageModel) ??
      resolveAgentModelPrimaryValue(params.cfg.agents?.defaults?.imageGenerationModel) ??
      "(config default)";

    // Show available aliases
    const aliases = [...aliasIndex.byAlias.values()];
    const aliasListStr =
      aliases.length > 0
        ? `\nAliases: ${aliases.map((a) => `\`${a.alias}\` → ${a.provider}/${a.model}`).join(", ")}`
        : "";

    return {
      shouldContinue: false,
      reply: {
        text: `Current image generation model: **${current}**\nUsage: \`/image-model <provider/model>\` or \`/image-model <alias>\` or \`/image-model reset\`${aliasListStr}`,
      },
    };
  }

  // Reset/default: clear override
  if (arg === "default" || arg === "reset") {
    if (sessionEntry) {
      delete sessionEntry.imageModel;
      delete sessionEntry.imageModelProvider;
      sessionEntry.updatedAt = Date.now();
      if (params.sessionStore) {
        params.sessionStore[sessionKey] = sessionEntry;
      }
      if (storePath) {
        await updateSessionStore(storePath, (store) => {
          store[sessionKey] = sessionEntry;
        });
      }
    }
    return {
      shouldContinue: false,
      reply: { text: "Image generation model reset to config default." },
    };
  }

  // Resolve via alias or direct provider/model
  const resolved = resolveImageGenerationModelRef(arg, aliasIndex);

  if (!resolved) {
    return {
      shouldContinue: false,
      reply: {
        text: `Unknown image model: **${arg}**. Use \`provider/model\` format or configure an alias in \`agents.defaults.imageGenerationModels\`.`,
      },
    };
  }

  // Set override
  if (sessionEntry) {
    sessionEntry.imageModel = resolved.model;
    sessionEntry.imageModelProvider = resolved.provider;
    sessionEntry.updatedAt = Date.now();
    if (params.sessionStore) {
      params.sessionStore[sessionKey] = sessionEntry;
    }
    if (storePath) {
      await updateSessionStore(storePath, (store) => {
        store[sessionKey] = sessionEntry;
      });
    }
  }

  const display = `${resolved.provider}/${resolved.model}`;
  const aliasNote = resolved.alias ? ` (${resolved.alias})` : "";
  return {
    shouldContinue: false,
    reply: { text: `Image generation model set to **${display}**${aliasNote}.` },
  };
};
