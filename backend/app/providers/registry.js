'use strict';
/**
 * Provider registry — resolves a model ID to the correct provider.
 */
const nvidia = require('./nvidia_provider');
const github = require('./github_provider');
const google = require('./google_provider');

const registry = new Map([
  ...nvidia.supportedModels.map((id) => [id, nvidia]),
  ...github.supportedModels.map((id) => [id, github]),
  ...google.supportedModels.map((id) => [id, google]),
]);

function getProvider(modelId) {
  const provider = registry.get(modelId);
  if (!provider) throw new Error(`Unknown model: ${modelId}`);
  return provider;
}

function listModels() {
  return [
    ...nvidia.supportedModels.map((id) => ({ id, provider: 'nvidia' })),
    ...github.supportedModels.map((id) => ({ id, provider: 'github' })),
    ...google.supportedModels.map((id) => ({ id, provider: 'google' })),
  ];
}

module.exports = { getProvider, listModels };
