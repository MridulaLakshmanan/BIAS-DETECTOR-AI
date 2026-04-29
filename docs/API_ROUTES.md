# API Routes — AI Bias Firewall

## Table of Contents
1. [Overview](#overview)
2. [Base URL](#base-url)
3. [Authentication](#authentication)
4. [Auth Routes](#auth-routes)
5. [Chat Routes](#chat-routes)
6. [Bias Routes](#bias-routes)
7. [Dashboard Routes](#dashboard-routes)
8. [Log Routes](#log-routes)
9. [Model Routes](#model-routes)
10. [Retrain Routes](#retrain-routes)
11. [Health Route](#health-route)

---

## Overview

All routes are served by the **Node.js / Express** backend. Every request and response body is `application/json` (except file upload endpoints which use `multipart/form-data`).

**Standard success envelope:**
```json
{ "data": { ... } }
```

**Standard error envelope:**
```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "details": { }
}
```

---

## Base URL

| Environment | URL |
|-------------|-----|
| Development | `http://localhost:3000` |
| Production | `https://api.your-domain.com` |

All route paths below are relative to the base URL.

---

## Authentication

Protected routes require a Supabase JWT in the `Authorization` header:

```
Authorization: Bearer <supabase-access-token>
```

The token is issued by Supabase Auth on login and stored in the frontend as `localStorage.getItem('sb-access-token')`. The backend verifies it using `supabase.auth.getUser(token)`.

**Route protection legend:**
- `[public]` — no auth required
- `[auth]` — valid JWT required
- `[admin]` — JWT + `role: admin` claim required

---

## Auth Routes

### `POST /api/auth/login`
`[public]`

Authenticate a user with email and password via Supabase Auth.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response `200`:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "analyst"
  }
}
```

**Errors:**
| Code | Description |
|------|-------------|
| `400` | Missing email or password |
| `401` | Invalid credentials |

---

### `POST /api/auth/logout`
`[auth]`

Invalidate the current Supabase session.

**Request:** No body required.

**Response `200`:**
```json
{ "message": "Logged out successfully" }
```

---

### `GET /api/auth/me`
`[auth]`

Return the authenticated user's profile.

**Response `200`:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "role": "analyst",
  "created_at": "2024-01-15T10:30:00Z"
}
```

---

### `POST /api/auth/refresh`
`[public]`

Exchange a Supabase refresh token for a new access token.

**Request:**
```json
{
  "refresh_token": "your-refresh-token"
}
```

**Response `200`:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
  "expires_in": 3600
}
```

---

## Chat Routes

### `POST /api/chat/submit`
`[auth]`

Submit a text prompt through the full bias pipeline.

**Request:**
```json
{
  "prompt": "Review this resume and evaluate candidate fit.",
  "model_id": "gpt-4o",
  "session_id": "sess_abc123",
  "force_bias": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | Yes | The user input to send through the pipeline |
| `model_id` | string | Yes | LLM model identifier (matches a `model_configs` record) |
| `session_id` | string | No | Existing session ID to append to; new session created if omitted |
| `force_bias` | boolean | No | Demo mode — simulates a biased response. Only allowed when `ALLOW_FORCE_BIAS=true` |

**Response `200`:**
```json
{
  "session_id": "sess_abc123",
  "response": "Based on qualifications...",
  "pipeline": {
    "input_bias_score": 72.5,
    "output_bias_score": 68.0,
    "confidence_level": "HIGH",
    "wrapper_triggered": true,
    "wrapper_reasoning": "The original response referenced nationality indirectly.",
    "protected_attributes": [
      {
        "attribute": "national_origin",
        "confidence": 0.87,
        "matched_text": "Ramírez",
        "detection_method": "name_origin_classifier"
      }
    ],
    "proxy_variables": [
      {
        "variable": "university_name",
        "mapped_to": "socioeconomic",
        "confidence": 0.74
      }
    ],
    "decision_points": ["Candidate listed an HBCU as their undergraduate institution"],
    "original_response": "The candidate's background suggests cultural fit may be a concern.",
    "latency_ms": 2340
  }
}
```

**Errors:**
| Code | Description |
|------|-------------|
| `400` | Missing required fields or `force_bias` disabled |
| `401` | Invalid or expired token |
| `404` | `model_id` not found or inactive |
| `422` | Request body validation error |
| `503` | LLM provider or bias detector unavailable |

---

### `POST /api/chat/upload`
`[auth]`

Upload a document (PDF, DOCX) and extract text for use as the prompt.

**Request:** `multipart/form-data`

| Field | Type | Description |
|-------|------|-------------|
| `file` | file | PDF or DOCX; max 5MB |
| `model_id` | string | LLM model identifier |
| `session_id` | string | Optional session ID |

**Response `200`:**
```json
{
  "extracted_text": "Applicant: John Martinez, DOB: 1985...",
  "page_count": 2,
  "session_id": "sess_abc123"
}
```

**Errors:**
| Code | Description |
|------|-------------|
| `413` | File exceeds 5MB |
| `415` | Unsupported file type |
| `422` | File is empty or corrupted |

---

### `GET /api/chat/sessions`
`[auth]`

Return paginated list of sessions for the authenticated user.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | `1` | Page number (1-indexed) |
| `limit` | integer | `20` | Items per page (max 100) |

**Response `200`:**
```json
{
  "sessions": [
    {
      "id": "sess_abc123",
      "preview": "Review this resume...",
      "model_id": "gpt-4o",
      "wrapper_triggered": true,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 247,
  "page": 1,
  "limit": 20
}
```

---

## Bias Routes

### `GET /api/bias/report/:session_id`
`[auth]`

Retrieve the full bias report for a specific session.

**Path parameter:** `session_id` — the session UUID.

**Response `200`:**
```json
{
  "session_id": "sess_abc123",
  "input_bias_score": 72.5,
  "output_bias_score": 68.0,
  "confidence_level": "HIGH",
  "wrapper_triggered": true,
  "wrapper_reasoning": "Original response referenced nationality indirectly.",
  "protected_attributes": [
    {
      "attribute": "national_origin",
      "confidence": 0.87,
      "matched_text": "Ramírez",
      "detection_method": "name_origin_classifier"
    }
  ],
  "proxy_variables": [
    {
      "variable": "university_name",
      "mapped_to": "socioeconomic",
      "confidence": 0.74
    }
  ],
  "decision_points": ["Candidate listed an HBCU as undergraduate institution"],
  "original_response": "The candidate'\''s background suggests cultural fit...",
  "final_response": "Based on the listed qualifications and experience...",
  "created_at": "2024-01-15T10:30:00Z"
}
```

**Errors:**
| Code | Description |
|------|-------------|
| `404` | Session not found |
| `403` | Session belongs to another user |

---

### `GET /api/bias/summary`
`[auth]`

Return aggregated bias stats for the authenticated user across all sessions.

**Response `200`:**
```json
{
  "total_sessions": 142,
  "average_input_bias_score": 34.2,
  "average_output_bias_score": 28.7,
  "wrapper_triggered_count": 38,
  "wrapper_trigger_rate": 0.268,
  "most_common_attributes": [
    { "attribute": "gender", "count": 52 },
    { "attribute": "race", "count": 41 }
  ]
}
```

---

## Dashboard Routes

### `GET /api/dashboard/stats`
`[admin]`

Return overall platform-wide stats for the admin dashboard.

**Response `200`:**
```json
{
  "total_sessions": 2847,
  "average_bias_score": 23.4,
  "wrapper_trigger_rate": 0.67,
  "compliance_score": 0.94,
  "active_users_7d": 128,
  "sessions_today": 47
}
```

---

### `GET /api/dashboard/timeseries`
`[admin]`

Bias scores aggregated over time (for chart rendering).

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | string | `7d` | Time window: `24h`, `7d`, `30d`, `90d` |
| `granularity` | string | `day` | Aggregation: `hour`, `day`, `week` |

**Response `200`:**
```json
{
  "labels": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  "datasets": [
    {
      "label": "Avg Bias Score",
      "data": [23, 45, 12, 67, 34, 28, 41]
    },
    {
      "label": "Wrapper Triggers",
      "data": [3, 8, 1, 14, 5, 4, 9]
    }
  ]
}
```

---

### `GET /api/dashboard/attribute-heatmap`
`[admin]`

Return bias scores broken down by protected attribute (heatmap data).

**Response `200`:**
```json
{
  "attributes": [
    {
      "attribute": "gender",
      "detection_count": 412,
      "average_bias_score": 38.2,
      "wrapper_rate": 0.72
    },
    {
      "attribute": "race",
      "detection_count": 388,
      "average_bias_score": 41.7,
      "wrapper_rate": 0.78
    },
    {
      "attribute": "age",
      "detection_count": 195,
      "average_bias_score": 29.4,
      "wrapper_rate": 0.54
    }
  ]
}
```

---

## Log Routes

### `GET /api/logs`
`[admin]`

Return paginated audit log entries.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | `1` | Page number |
| `limit` | integer | `50` | Rows per page (max 200) |
| `wrapper_only` | boolean | `false` | Filter to wrapper-triggered sessions only |
| `confidence` | string | — | Filter: `LOW`, `MEDIUM`, `HIGH` |
| `start_date` | ISO8601 | — | Filter sessions after this date |
| `end_date` | ISO8601 | — | Filter sessions before this date |
| `search` | string | — | Full-text search on prompt preview |

**Response `200`:**
```json
{
  "logs": [
    {
      "session_id": "sess_abc123",
      "user_id": "uuid",
      "prompt_preview": "Review this resume for...",
      "input_bias_score": 72.5,
      "output_bias_score": 68.0,
      "confidence_level": "HIGH",
      "wrapper_triggered": true,
      "protected_attributes": ["national_origin", "race"],
      "model_id": "gpt-4o",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 2847,
  "page": 1,
  "limit": 50
}
```

---

### `GET /api/logs/export`
`[admin]`

Export audit logs as a downloadable JSONL file.

**Query parameters:** Same filter parameters as `GET /api/logs`.

**Response `200`:**
- Content-Type: `application/jsonl`
- Content-Disposition: `attachment; filename="audit_log_2024-01-15.jsonl"`

Each line is a complete JSON record of one pipeline run.

---

## Model Routes

### `GET /api/models`
`[auth]`

List all configured LLM models.

**Response `200`:**
```json
{
  "models": [
    {
      "id": "gpt-4o",
      "display_name": "GPT-4o",
      "provider": "openai",
      "is_active": true,
      "context_window": 128000,
      "cost_per_1k_tokens": 0.005
    },
    {
      "id": "claude-3-5-sonnet",
      "display_name": "Claude 3.5 Sonnet",
      "provider": "anthropic",
      "is_active": true,
      "context_window": 200000,
      "cost_per_1k_tokens": 0.003
    }
  ]
}
```

---

### `POST /api/models`
`[admin]`

Add a new LLM model configuration.

**Request:**
```json
{
  "id": "gpt-4o-mini",
  "display_name": "GPT-4o Mini",
  "provider": "openai",
  "api_key": "sk-...",
  "context_window": 128000,
  "cost_per_1k_tokens": 0.00015,
  "is_active": true
}
```

**Response `201`:**
```json
{
  "id": "gpt-4o-mini",
  "display_name": "GPT-4o Mini",
  "is_active": true,
  "created_at": "2024-01-15T10:30:00Z"
}
```

> The `api_key` is stored AES-256-GCM encrypted in Supabase and never returned in responses.

---

### `PUT /api/models/:id`
`[admin]`

Update a model configuration.

**Request:** Same fields as `POST /api/models` (all optional).

**Response `200`:**
Updated model object (same shape as GET response).

---

### `DELETE /api/models/:id`
`[admin]`

Remove a model configuration.

**Response `200`:**
```json
{ "message": "Model deleted" }
```

**Errors:**
| Code | Description |
|------|-------------|
| `400` | Cannot delete the only active model |
| `404` | Model not found |

---

## Retrain Routes

### `POST /api/retrain/prepare`
`[admin]`

Aggregate all wrapper-triggered interactions into a JSONL training export.

**Request:**
```json
{
  "start_date": "2024-01-01T00:00:00Z",
  "end_date": "2024-01-31T23:59:59Z",
  "min_bias_score": 50,
  "include_proxies": true
}
```

**Response `200`:**
```json
{
  "export_id": "exp_xyz789",
  "record_count": 1247,
  "file_path": "retrain/export_2024-01-31.jsonl",
  "created_at": "2024-01-31T23:59:59Z"
}
```

---

### `GET /api/retrain/exports`
`[admin]`

List all previous retrain exports.

**Response `200`:**
```json
{
  "exports": [
    {
      "id": "exp_xyz789",
      "record_count": 1247,
      "file_path": "retrain/export_2024-01-31.jsonl",
      "created_at": "2024-01-31T23:59:59Z"
    }
  ]
}
```

---

### `GET /api/retrain/exports/:id/download`
`[admin]`

Download a specific retrain export as JSONL.

**Response `200`:**
- Content-Type: `application/jsonl`
- Content-Disposition: `attachment; filename="export_2024-01-31.jsonl"`

---

## Health Route

### `GET /api/health`
`[public]`

Check backend and dependency health.

**Response `200`:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2024-01-15T10:30:00Z",
  "dependencies": {
    "supabase": "connected",
    "bias_detector": "connected",
    "openai": "available"
  }
}
```

**Response `503`:** If any critical dependency is down.
