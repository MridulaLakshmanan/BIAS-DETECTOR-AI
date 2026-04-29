'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },

  llm: {
    nvidiaApiKey: process.env.NVIDIA_API_KEY,
    githubApiKey: process.env.GITHUB_API_KEY,
    googleApiKey: process.env.GOOGLE_API_KEY,
  },

  encryptionSecret: process.env.ENCRYPTION_SECRET,
  biasDetectorUrl: process.env.BIAS_DETECTOR_URL || 'http://localhost:5001',
  biasThreshold: parseInt(process.env.BIAS_THRESHOLD || '30', 10),
  allowForceBias: process.env.ALLOW_FORCE_BIAS === 'true',
};
