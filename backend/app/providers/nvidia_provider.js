'use strict';
/**
 * NVIDIA NIM provider — uses OpenAI-compatible API.
 * Base URL: https://integrate.api.nvidia.com/v1
 */
const OpenAI = require('openai');
const config = require('../config');

const client = new OpenAI({
  apiKey: config.llm.nvidiaApiKey,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

const MODELS = {
  'nvidia-llama-3.1-70b': 'meta/llama-3.1-70b-instruct',
  'nvidia-llama-3.1-8b': 'meta/llama-3.1-8b-instruct',
  'nvidia-mixtral-8x7b': 'mistralai/mixtral-8x7b-instruct-v0.1',
};

async function infer(modelId, systemPrompt, userPrompt) {
  const nvidiaModel = MODELS[modelId] || MODELS['nvidia-llama-3.1-70b'];
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  const completion = await client.chat.completions.create({
    model: nvidiaModel,
    messages,
    max_tokens: 1024,
    temperature: 0.7,
  });

  return completion.choices[0]?.message?.content || '';
}

module.exports = { infer, supportedModels: Object.keys(MODELS) };

