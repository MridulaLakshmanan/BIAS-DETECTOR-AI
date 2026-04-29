'use strict';
/**
 * GitHub Models provider — OpenAI-compatible via Azure AI inference endpoint.
 * Base URL: https://models.inference.ai.azure.com
 */
const OpenAI = require('openai');
const config = require('../config');

const client = new OpenAI({
  apiKey: config.llm.githubApiKey,
  baseURL: 'https://models.inference.ai.azure.com',
});

const MODELS = {
  'gpt-4o': 'gpt-4o',
  'gpt-4o-mini': 'gpt-4o-mini',
  'phi-4': 'Phi-4',
  'llama-3.3-70b': 'Meta-Llama-3.3-70B-Instruct',
};

async function infer(modelId, systemPrompt, userPrompt) {
  const ghModel = MODELS[modelId] || MODELS['gpt-4o'];
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  const completion = await client.chat.completions.create({
    model: ghModel,
    messages,
    max_tokens: 1024,
    temperature: 0.7,
  });

  return completion.choices[0]?.message?.content || '';
}

module.exports = { infer, supportedModels: Object.keys(MODELS) };

