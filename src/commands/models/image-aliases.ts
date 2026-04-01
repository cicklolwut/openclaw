import { logConfigUpdated } from "../../config/logging.js";
import type { ImageGenerationModelEntryConfig } from "../../config/types.agent-defaults.js";
import { type RuntimeEnv, writeRuntimeJson } from "../../runtime.js";
import { loadModelsConfig } from "./load-config.js";
import { ensureFlagCompatibility, normalizeAlias, updateConfig } from "./shared.js";

export async function modelsImageAliasesListCommand(
  opts: { json?: boolean; plain?: boolean },
  runtime: RuntimeEnv,
) {
  ensureFlagCompatibility(opts);
  const cfg = await loadModelsConfig({ commandName: "models image-aliases list", runtime });
  const imageModels = cfg.agents?.defaults?.imageGenerationModels ?? {};
  const aliases = Object.entries(imageModels).reduce<Record<string, string>>(
    (acc, [modelKey, entry]) => {
      const alias = entry?.alias?.trim();
      if (alias) {
        acc[alias] = modelKey;
      }
      return acc;
    },
    {},
  );

  if (opts.json) {
    writeRuntimeJson(runtime, { aliases });
    return;
  }
  if (opts.plain) {
    for (const [alias, target] of Object.entries(aliases)) {
      runtime.log(`${alias} ${target}`);
    }
    return;
  }

  runtime.log(`Image generation aliases (${Object.keys(aliases).length}):`);
  if (Object.keys(aliases).length === 0) {
    runtime.log("- none");
    return;
  }
  for (const [alias, target] of Object.entries(aliases)) {
    runtime.log(`- ${alias} -> ${target}`);
  }
}

export async function modelsImageAliasesAddCommand(
  aliasRaw: string,
  modelRaw: string,
  runtime: RuntimeEnv,
) {
  const alias = normalizeAlias(aliasRaw);
  const modelKey = modelRaw.trim();
  if (!modelKey) {
    throw new Error(
      "Model reference cannot be empty. Use provider/model format (e.g. comfyui/anima).",
    );
  }
  // Require provider/model format
  if (!modelKey.includes("/")) {
    throw new Error(
      `Model reference must include provider: "${modelKey}" → use "provider/${modelKey}" format.`,
    );
  }

  await updateConfig((cfg) => {
    const nextImageModels = { ...cfg.agents?.defaults?.imageGenerationModels } as Record<
      string,
      ImageGenerationModelEntryConfig
    >;
    // Check for duplicate alias on a different key
    for (const [key, entry] of Object.entries(nextImageModels)) {
      const existing = entry?.alias?.trim();
      if (existing && existing === alias && key !== modelKey) {
        throw new Error(`Alias "${alias}" already points to ${key}.`);
      }
    }
    const existing = nextImageModels[modelKey] ?? {};
    nextImageModels[modelKey] = { ...existing, alias };
    return {
      ...cfg,
      agents: {
        ...cfg.agents,
        defaults: {
          ...cfg.agents?.defaults,
          imageGenerationModels: nextImageModels,
        },
      },
    };
  });

  logConfigUpdated(runtime);
  runtime.log(`Image alias ${alias} -> ${modelKey}`);
}

export async function modelsImageAliasesRemoveCommand(aliasRaw: string, runtime: RuntimeEnv) {
  const alias = normalizeAlias(aliasRaw);
  const updated = await updateConfig((cfg) => {
    const nextImageModels = { ...cfg.agents?.defaults?.imageGenerationModels } as Record<
      string,
      ImageGenerationModelEntryConfig
    >;
    let found = false;
    for (const [key, entry] of Object.entries(nextImageModels)) {
      if (entry?.alias?.trim() === alias) {
        nextImageModels[key] = { ...entry, alias: undefined };
        found = true;
        break;
      }
    }
    if (!found) {
      throw new Error(`Image alias not found: ${alias}`);
    }
    return {
      ...cfg,
      agents: {
        ...cfg.agents,
        defaults: {
          ...cfg.agents?.defaults,
          imageGenerationModels: nextImageModels,
        },
      },
    };
  });

  logConfigUpdated(runtime);
  if (
    !updated.agents?.defaults?.imageGenerationModels ||
    Object.values(updated.agents.defaults.imageGenerationModels).every(
      (entry) => !entry?.alias?.trim(),
    )
  ) {
    runtime.log("No image generation aliases configured.");
  }
}
