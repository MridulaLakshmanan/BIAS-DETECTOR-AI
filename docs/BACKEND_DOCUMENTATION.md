# Backend Documentation — AI Bias Firewall

## Table of Contents
1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [System Architecture & Data Flow](#system-architecture--data-flow)
5. [Core Pipeline Phases](#core-pipeline-phases)
   - [Phase 1 — Input Guard (Bias Monitoring)](#phase-1--input-guard-bias-monitoring)
   - [Phase 2 — Inference Engine](#phase-2--inference-engine)
   - [Phase 2b — Output Auditor](#phase-2b--output-auditor)
   - [Phase 3 — Wrapper Engine](#phase-3--wrapper-engine)
   - [Phase 4 — JSONL Logger](#phase-4--jsonl-logger)
6. [Service Layer](#service-layer)
7. [Bias Detection Tool (Python Microservice)](#bias-detection-tool-python-microservice)
8. [Supabase Integration](#supabase-integration)
9. [Configuration & Secrets](#configuration--secrets)
10. [Environment Variables](#environment-variables)
11. [Error Handling Strategy](#error-handling-strategy)

---

## Overview

The backend is the core intelligence layer of the Fairness Firewall. It is a **Node.js REST API** that orchestrates the full 4-phase bias pipeline and persists results to **Supabase** (PostgreSQL). The **bias detection logic** is a separate Python service (`bias_detector_tool/`) called via HTTP from the Node.js backend.

```
User Input
    │
    ▼
[Phase 1] Input Guard       ← Python bias_detector_tool (HTTP call from Node.js)
    │
    ▼
[Phase 2] Inference         ← Selected Cloud LLM (OpenAI, Anthropic, Gemini, Mistral)
    │
    ▼
[Phase 2b] Output Auditor   ← Auditor LLM checks for bias in response
    │
    ├─── Bias < Threshold ──► Return response to user
    │
    └─── Bias ≥ Threshold ──► [Phase 3] Wrapper Engine
                                        │
                                        ▼
                              Meta-Prompter LLM generates fix
                                        │
                                        ▼
                              Re-run inference with wrapper prompt
                                        │
                                        ▼
                              [Phase 4] Log to Supabase + JSONL
                                        │
                                        ▼
                              Return neutral response to user
```

---

## Tech Stack

| Component | Technology | Reason |
|-----------|-----------|--------|
| Runtime | Node.js 20 LTS | Fast async I/O; strong ecosystem for REST APIs |
| Web Framework | Express.js | Lightweight, well-documented, wide middleware support |
| Database | Supabase (PostgreSQL) | Managed Postgres + REST API + Auth + Storage in one |
| DB Client | `@supabase/supabase-js` | Official JS client; typed queries, real-time support |
| Auth | Supabase Auth | JWT-based; handles signup, login, session refresh |
| File Storage | Supabase Storage | Uploaded documents stored as bucket objects |
| LLM Clients | `openai`, `@anthropic-ai/sdk`, `@google/generative-ai` | Multi-provider LLM support |
| Bias Detection | Python microservice (`bias_detector_tool/`) | spaCy NER + sklearn; called via HTTP from Node.js |
| Input Validation | `zod` | Schema validation for request bodies |
| Environment | `dotenv` | Loads `.env` config at startup |
| Logging | `winston` or `pino` | Structured JSON logging |
| Process Manager | `pm2` (production) | Cluster mode, auto-restart, log management |

---

## Project Structure

```
backend/
├── app/
│   ├── main.py / index.js         # Entry point
│   ├── config.js                  # Config from env vars
│   ├── dependencies.js            # Shared middleware (auth guard, etc.)
│   │
│   ├── api/                       # Route handlers (thin controllers)
│   │   ├── routes_auth.js         # POST /api/auth/login, /logout
│   │   ├── routes_chat.js         # POST /api/chat/submit, upload
│   │   ├── routes_bias.js         # GET /api/bias/report/:id
│   │   ├── routes_dashboard.js    # GET /api/dashboard/stats, timeseries, heatmap
│   │   ├── routes_logs.js         # GET /api/logs
│   │   ├── routes_models.js       # CRUD /api/models
│   │   ├── routes_retrain.js      # POST /api/retrain/prepare
│   │   └── routes_health.js       # GET /api/health
│   │
│   ├── pipeline/                  # Core 4-phase bias pipeline
│   │   ├── orchestrator.js        # Coordinates all phases
│   │   ├── input_guard.js         # Phase 1: calls Python bias detector HTTP API
│   │   ├── inference_engine.js    # Phase 2: routes to cloud LLM provider
│   │   ├── output_auditor.js      # Phase 2b: auditor LLM checks output
│   │   ├── wrapper_engine.js      # Phase 3: meta-prompter + re-inference
│   │   └── jsonl_logger.js        # Phase 4: logs to Supabase + JSONL file
│   │
│   ├── providers/                 # LLM provider abstraction
│   │   ├── base_provider.js       # Abstract interface
│   │   ├── openai_provider.js     # OpenAI (GPT-4o, GPT-4o-mini)
│   │   ├── anthropic_provider.js  # Anthropic (Claude 3.5 Sonnet, Haiku)
│   │   ├── gemini_provider.js     # Google Gemini 1.5 Pro
│   │   └── mistral_provider.js    # Mistral Large / 7B
│   │
│   ├── services/                  # Business logic
│   │   ├── auth_service.js        # Supabase Auth wrappers
│   │   ├── session_service.js     # Session CRUD via Supabase
│   │   ├── log_service.js         # Audit log read/write
│   │   ├── model_service.js       # Model config CRUD
│   │   ├── retrain_service.js     # Dataset export aggregation
│   │   └── file_service.js        # Document parsing (PDF, DOCX → text)
│   │
│   ├── db/
│   │   └── supabase_client.js     # Supabase JS client singleton
│   │
│   ├── schemas/                   # Zod validation schemas
│   │   ├── chat_schemas.js
│   │   ├── bias_schemas.js
│   │   └── model_schemas.js
│   │
│   └── utils/
│       ├── encryption.js          # AES-256-GCM for API key storage
│       ├── sanitizer.js           # Input sanitization
│       ├── text_extraction.js     # PDF/DOCX → plain text
│       └── token_counter.js       # Token budget management
│
├── data/
│   └── logs/
│       └── bias_interactions.jsonl   # Running JSONL audit log
│
├── bias_detector_tool/            # Python microservice (separate process)
│   ├── detector.py                # HTTP server entry (Flask/FastAPI)
│   ├── attribute_extractor.py     # spaCy NER + rule-based attribute detection
│   ├── proxy_detector.py          # Proxy variable detection
│   ├── bias_scorer.py             # Aggregated 0–100 bias probability
│   └── models/                    # Saved ML model artifacts (.pkl)
│
├── package.json
├── .env.example
└── README.md
```

---

## System Architecture & Data Flow

### Request Flow (Synchronous)

```
POST /api/chat/submit
        │
        ▼
   Express route handler (routes_chat.js)
        │   validates with Zod schema
        ▼
   orchestrator.js
        │
        ├─► input_guard.js
        │       └─ HTTP POST → bias_detector_tool/detector.py
        │              returns { input_bias_score, protected_attributes,
        │                        proxy_variables, decision_points }
        │
        ├─► inference_engine.js
        │       └─ [selected_provider].complete(prompt)
        │              returns { response_text, tokens_used, latency_ms }
        │
        ├─► output_auditor.js
        │       └─ auditor_provider.complete(audit_prompt)
        │              returns { output_bias_score, confidence_level,
        │                        biased_phrases, wrapper_reasoning }
        │
        ├─► [if output_bias_score > BIAS_THRESHOLD]
        │       wrapper_engine.js
        │           ├─ wrapper_provider.complete(meta_prompt)
        │           └─ inference_engine.js re-run with wrapper prompt
        │
        ├─► jsonl_logger.js  (always runs)
        │       ├─ supabase.from('sessions').insert(...)
        │       ├─ supabase.from('bias_reports').insert(...)
        │       └─ append JSON line to bias_interactions.jsonl
        │
        └─► Return ChatResponse JSON to client
```

---

## Core Pipeline Phases

### Phase 1 — Input Guard (Bias Monitoring)

**File:** `app/pipeline/input_guard.js`

**Responsibility:** Analyze the raw input for bias signals before sending to any LLM.

The Node.js input guard makes an HTTP request to the Python `bias_detector_tool` microservice:

```js
async function analyzeInput(text, context = 'general') {
  const res = await fetch(`${BIAS_DETECTOR_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, context }),
  });
  return res.json();
  // Returns: { input_bias_score, protected_attributes, proxy_variables, decision_points }
}
```

The Python service detects:

| Attribute | Detection Method |
|-----------|-----------------|
| Gender | Pronoun analysis, name gender inference, "childcare/maternity" keywords |
| Age | Date of birth math, graduation year, "senior"/"entry-level" keywords |
| Race / Ethnicity | Name origin classifier, HBCU detection, language markers |
| Socioeconomic | Zip code lookup, school prestige rank |
| Family Status | "Gap year", "maternity leave", "caregiver" keywords |

**Proxy variable mapping:**

| Proxy Variable | Correlated Protected Attribute |
|----------------|-------------------------------|
| `zip_code` | race / socioeconomic |
| `university_name` | socioeconomic / race |
| `employment_gap` | gender / family_status |
| `graduation_year` | age |
| `hobbies` | gender / religion / culture |
| `neighborhood` | race / socioeconomic |

---

### Phase 2 — Inference Engine

**File:** `app/pipeline/inference_engine.js`

**Responsibility:** Route the prompt to the user-selected cloud LLM.

```js
async function infer({ prompt, modelId, systemPrompt = null, forceBias = false }) {
  const provider = providerRegistry.get(modelId);
  const result = await provider.complete({ prompt, systemPrompt, forceBias });
  return {
    responseText: result.text,
    modelUsed: result.model,
    tokensUsed: result.usage.total_tokens,
    latencyMs: result.latency,
  };
}
```

Supported providers: `openai_provider.js`, `anthropic_provider.js`, `gemini_provider.js`, `mistral_provider.js`.

---

### Phase 2b — Output Auditor

**File:** `app/pipeline/output_auditor.js`

**Responsibility:** Run a second LLM call to check the first response for bias.

```js
async function auditOutput({ originalResponse, inputText, decisionPoints }) {
  const auditPrompt = buildAuditPrompt(originalResponse, inputText, decisionPoints);
  const result = await auditorProvider.complete({ prompt: auditPrompt });
  // Parses JSON from audit response
  return {
    outputBiasScore: result.bias_score,      // 0–100
    confidenceLevel: result.confidence,      // LOW | MEDIUM | HIGH
    biasedPhrases: result.biased_phrases,
    wrapperReasoning: result.reasoning,
  };
}
```

**Confidence level derivation:**
```
outputBiasScore 0–20   → LOW
outputBiasScore 21–60  → MEDIUM
outputBiasScore 61–100 → HIGH
outputBiasScore = -1   → UNKNOWN (audit failed)
```

**Wrapper trigger:** If `outputBiasScore >= BIAS_THRESHOLD` (default: 30), Phase 3 runs.

---

### Phase 3 — Wrapper Engine

**File:** `app/pipeline/wrapper_engine.js`

**Responsibility:** Generate a neutralizing meta-prompt and re-run inference.

```js
async function applyWrapper({ inputText, originalResponse, biasReport }) {
  // Step 1: Generate the wrapper prompt
  const metaPrompt = buildWrapperPrompt(inputText, originalResponse, biasReport);
  const wrapperResult = await wrapperProvider.complete({ prompt: metaPrompt });

  // Step 2: Re-run inference with the wrapper system prompt
  const neutralResult = await inferenceEngine.infer({
    prompt: inputText,
    modelId: biasReport.modelId,
    systemPrompt: wrapperResult.text,
  });

  return {
    wrapperPrompt: metaPrompt,
    finalResponse: neutralResult.responseText,
    wrapperModelUsed: wrapperResult.model,
  };
}
```

---

### Phase 4 — JSONL Logger

**File:** `app/pipeline/jsonl_logger.js`

**Responsibility:** Persist every pipeline run to Supabase and append to the local JSONL audit file.

```js
async function logInteraction(pipelineResult) {
  // 1. Insert session record
  const { data: session } = await supabase
    .from('sessions')
    .insert({ input_text, model_config_id, wrapper_triggered, final_response, ... })
    .select()
    .single();

  // 2. Insert bias report
  await supabase.from('bias_reports').insert({
    session_id: session.id,
    input_bias_score,
    output_bias_score,
    confidence_level,
    ...
  });

  // 3. Insert protected attribute findings
  for (const attr of protectedAttributes) {
    await supabase.from('protected_attribute_findings').insert({
      bias_report_id: report.id, ...attr
    });
  }

  // 4. Append to JSONL file (for retraining exports)
  const logLine = JSON.stringify({ session_id: session.id, ...fullPipelineSnapshot });
  await fs.appendFile(JSONL_LOG_PATH, logLine + '\n');
}
```

---

## Service Layer

| Service | File | Responsibility |
|---------|------|---------------|
| `auth_service.js` | Supabase Auth wrappers | Login, logout, token verification, role check |
| `session_service.js` | Supabase `sessions` table | Fetch sessions list, session detail, user-scoped filtering |
| `log_service.js` | Supabase `log_entries` + JSONL | Read paginated logs, filter by confidence/wrapper/date |
| `model_service.js` | Supabase `model_configs` table | Add/remove/enable models; encrypt/decrypt API keys |
| `retrain_service.js` | Supabase `log_entries` | Aggregate wrapper-triggered entries, generate JSONL export |
| `file_service.js` | Local / Supabase Storage | Parse PDF/DOCX → plain text for pipeline input |

---

## Bias Detection Tool (Python Microservice)

The `bias_detector_tool/` is a standalone Python service that runs alongside the Node.js backend. Node.js calls it via HTTP.

**Entry point:** `bias_detector_tool/detector.py` — a Flask or FastAPI server listening on `localhost:5001`.

```python
# detector.py (example endpoint)
@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    attrs = attribute_extractor.extract(req.text)
    proxies = proxy_detector.detect(req.text)
    score = bias_scorer.calculate(attrs, proxies, req.context)
    return {
        "input_bias_score": score,
        "protected_attributes": [a.dict() for a in attrs],
        "proxy_variables": [p.dict() for p in proxies],
        "decision_points": extract_decision_points(req.text),
    }
```

**Python dependencies (in `requirements.txt`):**
```
spacy>=3.7
scikit-learn>=1.4
sentence-transformers>=2.6
fastapi
uvicorn
```

**Attribute Extractor (`attribute_extractor.py`):**
- Uses spaCy `en_core_web_lg` for NER
- Custom rule-based extensions for gender/family-status keywords
- Name origin classifier for race/national origin inference

**Proxy Detector (`proxy_detector.py`):**
- Rule-based mappings (zip_code → race, employment_gap → gender, etc.)
- Sentence embedding similarity for fuzzy proxy detection

**Bias Scorer (`bias_scorer.py`):**
```python
def calculate_input_bias_score(
    protected_count: int,
    proxy_count: int,
    high_risk_keywords: int,
    context_sensitivity: float = 1.0
) -> float:
    base = (protected_count * 15) + (proxy_count * 10) + (high_risk_keywords * 8)
    return round(min(base * context_sensitivity, 100.0), 2)
```

---

## Supabase Integration

**Client setup (`db/supabase_client.js`):**

```js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY   // Service role key for server-side operations
);

export default supabase;
```

> The `service_role` key is used server-side (Node.js) and bypasses Row Level Security.  
> The `anon` key is only sent to the frontend.

**Auth verification middleware:**

```js
export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing token' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });

  req.user = user;
  next();
}
```

**Data access pattern (example — sessions list):**

```js
export async function getUserSessions(userId, { page = 1, limit = 20 } = {}) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabase
    .from('sessions')
    .select('*, bias_reports(*)', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw error;
  return { sessions: data, total: count, page, limit };
}
```

---

## Configuration & Secrets

| Secret | Storage | Notes |
|--------|---------|-------|
| `SUPABASE_URL` | `.env` | Project URL from Supabase dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env` | Never exposed to the client |
| `SUPABASE_ANON_KEY` | `.env` + Vite build | Sent to frontend; Row Level Security restricts access |
| LLM API keys | Supabase `model_configs` table | Stored AES-256-GCM encrypted; `ENCRYPTION_KEY` in `.env` |
| `BIAS_DETECTOR_URL` | `.env` | URL for the Python microservice (e.g., `http://localhost:5001`) |
| `BIAS_THRESHOLD` | `.env` | Wrapper trigger threshold (default: `30`) |
| `ALLOW_FORCE_BIAS` | `.env` | Set `true` only in dev/demo environments |

**API key encryption (`utils/encryption.js`):**

```js
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';

export function encrypt(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, Buffer.from(process.env.ENCRYPTION_KEY, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { encrypted, iv, tag };   // All stored as Base64 in Supabase
}

export function decrypt({ encrypted, iv, tag }) {
  const decipher = createDecipheriv(ALGO, Buffer.from(process.env.ENCRYPTION_KEY, 'hex'), iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}
```

---

## Environment Variables

```env
# Node.js backend .env

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# Python bias detector microservice
BIAS_DETECTOR_URL=http://localhost:5001

# Encryption (32-byte hex key for AES-256-GCM)
ENCRYPTION_KEY=your-64-char-hex-string

# Pipeline settings
BIAS_THRESHOLD=30
ALLOW_FORCE_BIAS=false

# LLM defaults (overridden per-request by model_config_id)
DEFAULT_AUDITOR_MODEL=gpt-4o-mini
DEFAULT_WRAPPER_MODEL=gpt-4o-mini

# Server
PORT=3000
NODE_ENV=development

# JSONL log file path
JSONL_LOG_PATH=./data/logs/bias_interactions.jsonl
```

---

## Error Handling Strategy

| Scenario | HTTP Code | Response |
|----------|-----------|----------|
| Validation error (bad request body) | `422` | Zod error details |
| Missing / invalid JWT | `401` | `{ "error": "Unauthorized" }` |
| Insufficient role (e.g., viewer accessing admin route) | `403` | `{ "error": "Forbidden" }` |
| Session/resource not found | `404` | `{ "error": "Not found" }` |
| LLM provider unavailable | `503` | `{ "error": "LLM provider error", "provider": "openai" }` |
| Bias detector service down | `503` | `{ "error": "Bias detection service unavailable" }` |
| File too large | `413` | `{ "error": "File exceeds 5MB limit" }` |
| Unsupported file type | `415` | `{ "error": "Unsupported file type" }` |
| `force_bias` when disabled | `400` | `{ "error": "force_bias is disabled in this environment" }` |

**Error response format (all routes):**
```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "details": { }
}
```

All unhandled errors are caught by an Express global error handler and logged with `winston`/`pino` before returning a `500` response.
