'use strict';
/**
 * Google Gemini provider.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config');

const genAI = new GoogleGenerativeAI(config.llm.googleApiKey);

const MODELS = {
  'gemini-1.5-pro': 'gemini-1.5-pro',
  'gemini-1.5-flash': 'gemini-1.5-flash',
  'gemini-2.0-flash': 'gemini-2.0-flash',
};

async function infer(modelId, systemPrompt, userPrompt) {
  const geminiModel = MODELS[modelId] || MODELS['gemini-1.5-flash'];
  const model = genAI.getGenerativeModel({
    model: geminiModel,
    systemInstruction: systemPrompt || undefined,
  });

  const result = await model.generateContent(userPrompt);
  return result.response.text();
}

module.exports = { infer, supportedModels: Object.keys(MODELS) };

