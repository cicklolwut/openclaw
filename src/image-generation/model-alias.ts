import type { OpenClawConfig } from "../config/config.js";

export type ImageGenerationModelAlias = {
  alias: string;
  provider: string;
  model: string;
};

export type ImageGenerationModelAliasIndex = {
  byAlias: Map<string, ImageGenerationModelAlias>;
};

function normalizeAliasKey(alias: string): string {
  return alias.trim().toLowerCase();
}

/**
 * Build an alias index from `agents.defaults.imageGenerationModels` config.
 *
 * Config shape:
 * ```yaml
 * agents:
 *   defaults:
 *     imageGenerationModels:
 *       "comfyui/wai":
 *         alias: wai
 *       "comfyui/porncraft":
 *         alias: porncraft
 * ```
 */
export function buildImageGenerationModelAliasIndex(
  cfg: OpenClawConfig,
): ImageGenerationModelAliasIndex {
  const byAlias = new Map<string, ImageGenerationModelAlias>();

  const rawModels = cfg.agents?.defaults?.imageGenerationModels ?? {};
  for (const [keyRaw, entry] of Object.entries(rawModels)) {
    const alias = entry?.alias?.trim();
    if (!alias) {
      continue;
    }

    // Key must be "provider/model"
    const slashIndex = keyRaw.indexOf("/");
    if (slashIndex <= 0 || slashIndex === keyRaw.length - 1) {
      continue;
    }

    const provider = keyRaw.slice(0, slashIndex).trim();
    const model = keyRaw.slice(slashIndex + 1).trim();
    if (!provider || !model) {
      continue;
    }

    const aliasKey = normalizeAliasKey(alias);
    byAlias.set(aliasKey, { alias, provider, model });
  }

  return { byAlias };
}

/**
 * Resolve a user-provided image model string.
 * If it contains a slash, treat as provider/model directly.
 * If bare, check the alias index.
 * Returns { provider, model } or null if unresolvable.
 */
export function resolveImageGenerationModelRef(
  raw: string,
  aliasIndex: ImageGenerationModelAliasIndex,
): { provider: string; model: string; alias?: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  // Explicit provider/model
  const slashIndex = trimmed.indexOf("/");
  if (slashIndex > 0 && slashIndex < trimmed.length - 1) {
    return {
      provider: trimmed.slice(0, slashIndex).trim(),
      model: trimmed.slice(slashIndex + 1).trim(),
    };
  }

  // Try alias
  const aliasKey = normalizeAliasKey(trimmed);
  const match = aliasIndex.byAlias.get(aliasKey);
  if (match) {
    return { provider: match.provider, model: match.model, alias: match.alias };
  }

  // Bare model name with no alias match — can't resolve provider
  return null;
}
