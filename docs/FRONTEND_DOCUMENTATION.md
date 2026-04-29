# Frontend Documentation — AI Bias Firewall

## Table of Contents
1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Pages & Views](#pages--views)
5. [JavaScript Modules](#javascript-modules)
6. [Styling System](#styling-system)
7. [API Integration](#api-integration)
8. [UI/UX Design Decisions](#uiux-design-decisions)
9. [Environment Variables](#environment-variables)
10. [Build & Development](#build--development)

---

## Overview

The frontend is a multi-page vanilla HTML/CSS/JavaScript application. It consists of three distinct pages, each served as a static HTML file and bundled with Vite.

| Page | File | Purpose |
|------|------|---------|
| **Landing Page** | `index.html` | Marketing page; hero, features, use-case showcase |
| **Chat Interface** | `chat.html` | End-user facing; accepts prompts, shows real-time bias pipeline results |
| **Dashboard** | `dashboard.html` | Admin/analyst view; bias metrics, audit logs, heatmaps, export controls |

The system is a "Fairness Firewall" — the frontend communicates every phase of the bias pipeline to the user in real-time using animated indicators and bias score overlays on each message bubble.

---

## Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Pages | Vanilla HTML5 (3 pages) | No framework overhead; fast static delivery |
| JavaScript | Vanilla ES Modules (`type="module"`) | Native browser modules, no bundler lock-in |
| Styling | Tailwind CSS v4 (`@import "tailwindcss"`) | Utility-first, custom theme via `@theme {}` |
| Build Tool | Vite 5 | Fast HMR in dev, optimized static bundle in prod |
| Fonts | Google Fonts — Inter (400–800) | Clean, modern sans-serif consistent with design |
| State | Module-level JS variables | Lightweight — no external state library needed |
| API Client | Native `fetch` | No extra dependency; used in each JS module |
| Auth | Supabase Auth (JWT) | Managed auth; tokens stored in `localStorage` |

---

## Project Structure

```
frontend/
├── index.html              # Landing / marketing page
├── chat.html               # End-user chat interface
├── dashboard.html          # Admin analytics dashboard
│
├── js/
│   ├── chat.js             # Chat page logic (pipeline, sessions, bias modal)
│   ├── dashboard.js        # Dashboard charts, heatmap, audit log table
│   └── landing.js          # Scroll reveal, navbar blur, hero typing animation
│
├── styles/
│   └── main.css            # Tailwind CSS v4 + custom utilities & theme
│
├── public/                 # Static assets (favicons, images)
│
├── vite.config.js          # Vite build configuration
└── package.json            # Dev dependencies (vite, tailwindcss)
```

### `package.json` (dev dependencies only)

```json
{
  "devDependencies": {
    "@tailwindcss/vite": "^4.x",
    "tailwindcss": "^4.x",
    "vite": "^5.x"
  }
}
```

There are **no runtime JS dependencies** — all interactivity uses native browser APIs.

---

## Pages & Views

### 1. Landing Page (`index.html`)

Marketing and product overview page. Loaded by default at `/`.

**Sections:**
- **Navbar** — Logo, nav links (How It Works, Features, Use Cases, Chat, Dashboard), CTA buttons
- **Hero** — Headline, sub-headline, CTA buttons, live demo preview panel with typing animation showing a bias interception
- **How It Works** — 4-phase pipeline visualized as connected steps (Input Guard → Inference → Audit → Wrapper)
- **Features** — Cards for real-time detection, wrapper engine, audit logs, compliance reporting
- **Use Cases** — Hiring, loan applications, customer support, content moderation
- **Footer** — Links and branding

**JavaScript (`landing.js`):**
- `IntersectionObserver` for scroll-reveal animations (`.reveal` class)
- Navbar blur on scroll past 50px
- Hero typing animation — simulates a biased AI response being typed, then intercepted

---

### 2. Chat Page (`chat.html`)

The primary end-user interface. Full-screen chat layout with a collapsible session history sidebar.

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│ NAVBAR [Logo] [Model Selector ▼]  [LIVE] [Dashboard] │
├──────────────┬───────────────────────────────────────┤
│  SIDEBAR     │  MAIN CHAT AREA                       │
│              │                                        │
│  [Sessions]  │  ┌────────────────────────────────┐   │
│  ─────────── │  │ USER: "Evaluate this resume"  │   │
│  Resume Rev  │  └────────────────────────────────┘   │
│  Loan App    │                                        │
│  Hiring Dec  │  ┌────────────────────────────────┐   │
│  Cust Supp   │  │ AI [78% HIGH] [Wrapper ✓]     │   │
│              │  │ "Based on qualifications..."   │   │
│  ─────────── │  │ [View Bias Details →]          │   │
│  Force Bias  │  └────────────────────────────────┘   │
│  [toggle]    │                                        │
│              │  [📎] [Type a message...        ] [▶] │
└──────────────┴───────────────────────────────────────┘
```

**Key UI elements:**

| Element | DOM ID | Description |
|---------|--------|-------------|
| Model selector | `#model-select` | `<select>` with GPT-4, Claude 3, Llama 3 options |
| Session sidebar | `#sessions-list` | Rendered by `renderSessions()` |
| New session button | `#new-session-btn` | Creates a new blank session |
| Force Bias toggle | `#force-bias-toggle` | Demo mode — simulates biased AI for live demos |
| Chat messages area | `#chat-messages` | Messages injected as HTML strings |
| Message form | `#chat-form` | Text input + submit button |
| File attach button | `#upload-btn` | Triggers file input for document upload |
| Status indicator | `#status-indicator` | Pulsing LIVE badge |
| Bias details modal | `#bias-modal` | Right-side slide-in panel with full bias report |

**Message Flow States (animated in the chat thread):**
```
Uploading → Bias Scanning → Inferring → Auditing → Wrapping → Done
```
Each stage shows as a pipeline indicator inline in the chat before the final response renders.

**Bias Details Modal:**
Clicking "View Bias Details" on any AI bubble opens a right-side slide-in showing:
- Input bias score + output bias score
- Protected attributes detected (with confidence scores)
- Decision points
- Wrapper reasoning (if triggered)
- Original biased response vs. corrected response

---

### 3. Dashboard Page (`dashboard.html`)

Analytics and audit view for admins/analysts.

**Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│ NAVBAR  [Logo] / Dashboard              [LIVE]  [Chat]        │
├──────────────────────────────────────────────────────────────┤
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌───────────┐ │
│  │ 2,847      │ │ 23%        │ │ 67%        │ │ 94%       │ │
│  │ Sessions   │ │ Avg Bias   │ │ Wrapper    │ │ Compliance│ │
│  └────────────┘ └────────────┘ └────────────┘ └───────────┘ │
├───────────────────────────┬──────────────────────────────────┤
│  Bias Score Over Time     │  Bias Type Distribution          │
│  [Bar chart]              │  [Horizontal bars]               │
├───────────────────────────┴──────────────────────────────────┤
│  Bias Heatmap by Protected Attribute                         │
│  [Grid of colored cells: Gender, Race, Age, Religion, ...]   │
├──────────────────────────────────────────────────────────────┤
│  Audit Log                              [Search] [Export]    │
│  Session ID | Prompt | Bias | Wrapper | Attributes | Time    │
│  SES-2847   | Resume | HIGH | Applied | race, origin | 2m   │
└──────────────────────────────────────────────────────────────┘
```

**Dashboard Widgets:**

| Widget | DOM ID | Data Source |
|--------|--------|------------|
| Total Sessions | `#stat-sessions` | `GET /api/dashboard/stats` |
| Avg Bias Score | inline | `GET /api/dashboard/stats` |
| Wrapper Rate | inline | `GET /api/dashboard/stats` |
| Compliance Score | inline | `GET /api/dashboard/stats` |
| Bias Over Time chart | `#bias-chart` | `GET /api/dashboard/timeseries` |
| Bias Distribution | `#bias-distribution` | `GET /api/dashboard/attribute-heatmap` |
| Heatmap grid | `#heatmap-grid` | `GET /api/dashboard/attribute-heatmap` |
| Audit log table | `#audit-log-body` | `GET /api/logs` |

---

## JavaScript Modules

### `js/chat.js`

Handles all Chat page interactivity. Loaded as `<script type="module">`.

**Module-level state:**
```js
let forceBiasMode = false;
let currentSessionId = 'session-1';
const sessions = [ ... ];   // Array of { id, title, time }
```

**Key functions:**

| Function | Purpose |
|----------|---------|
| `renderSessions()` | Injects session list HTML into `#sessions-list`; highlights active session |
| `addMessage(role, content, biasData)` | Appends a message bubble to `#chat-messages` |
| `showPipelineIndicator(stage)` | Renders animated stage step inline in the chat thread |
| `openBiasModal(biasData)` | Populates and opens the `#bias-modal` slide-in panel |
| `simulatePipeline(forceBias)` | Cycles through pipeline stages with timeouts, then renders the final response |

**Force Bias toggle logic:**
```js
forceBiasToggle.addEventListener('click', () => {
  forceBiasMode = !forceBiasMode;
  // Toggles visual state (color + knob position)
  // When active, the next submit uses biasedResponses[] mock data
});
```

**Bias badge color mapping:**
```
0–30   → bias-low    (green)
31–60  → bias-medium (amber)
61–100 → bias-high   (red)
```

---

### `js/dashboard.js`

Handles all Dashboard page interactivity. Loaded as `<script type="module">`.

**Key functions:**

| Function | Purpose |
|----------|---------|
| `renderChart()` | Builds bias-over-time bar chart from `chartData[]` |
| `renderDistribution()` | Renders horizontal bar chart of bias type percentages |
| `renderHeatmap()` | Creates protected attribute heatmap grid cells with color-coded intensity |
| `renderAuditLog()` | Injects styled audit log rows into `#audit-log-body` |

**Heatmap intensity logic:**
```
avgBias > 30 → accent-red
avgBias > 20 → accent-amber
avgBias > 10 → accent-cyan
otherwise    → accent-green
opacity = clamp(avgBias / 50, 0.1, 0.7)
```

---

### `js/landing.js`

Handles landing page animations. Loaded as `<script type="module">`.

**Key behaviors:**
- `IntersectionObserver` — adds `.visible` class to `.reveal` elements when they enter viewport
- Navbar blur — adds `navbar-blur` class after scrolling 50px
- Hero typing animation — types out a sample biased AI response character by character; hides cursor after completion

---

## Styling System

All styles are in `styles/main.css` using Tailwind CSS v4.

### Custom Theme (`@theme {}`)

```css
@theme {
  --color-navy-950: #0a0e1a;   /* Page background */
  --color-navy-900: #0f1629;   /* Panel / card background */
  --color-navy-800: #151d3b;
  --color-accent-blue: #3b82f6;
  --color-accent-cyan: #06b6d4;
  --color-accent-green: #10b981;
  --color-accent-amber: #f59e0b;
  --color-accent-red: #ef4444;
}
```

### Custom Utilities (`@utility`)

| Utility class | Description |
|---------------|-------------|
| `glass-panel` | Frosted glass card (semi-transparent bg + border + backdrop blur) |
| `glow-blue` | Blue box-shadow glow effect |
| `gradient-text` | Blue-to-cyan gradient text (uses `-webkit-background-clip`) |
| `btn-glow` | Animated glow bloom on button hover |
| `bg-grid` | Subtle dot-grid background pattern |
| `reveal` | Scroll-reveal: `opacity: 0 + translateY(30px)` → `.visible` restores |
| `navbar-blur` | Backdrop blur + navy overlay for scrolled navbar state |
| `bias-low` | Green badge styling (0–30%) |
| `bias-medium` | Amber badge styling (31–60%) |
| `bias-high` | Red badge styling (61–100%) |
| `pipeline-connector` | Animated gradient flow line between pipeline stage nodes |
| `status-live` | CSS animation: pulsing green dot |

---

## API Integration

All API calls use the native `fetch` API. The Node.js backend URL is injected at build time via Vite environment variables.

### Authentication

All protected requests include the Supabase JWT in the `Authorization` header:

```js
const token = localStorage.getItem('sb-access-token');

const res = await fetch(`${API_BASE}/api/chat/submit`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify(payload),
});
```

### Chat Submission (`chat.js`)

```js
async function submitToAPI(payload) {
  const res = await fetch(`${API_BASE}/api/chat/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`,
    },
    body: JSON.stringify({
      prompt: payload.prompt,
      model_id: payload.modelId,
      session_id: payload.sessionId,
      force_bias: payload.forceBias,
    }),
  });
  return res.json();
}
```

### Dashboard Data (`dashboard.js`)

```js
async function loadDashboardStats() {
  const res = await fetch(`${API_BASE}/api/dashboard/stats`, {
    headers: { 'Authorization': `Bearer ${getToken()}` },
  });
  const data = await res.json();
  document.getElementById('stat-sessions').textContent =
    data.total_sessions.toLocaleString();
}
```

---

## UI/UX Design Decisions

| Decision | Rationale |
|----------|-----------|
| Three separate HTML pages (not SPA) | Simpler routing, no framework bundle overhead, faster initial load |
| Bias pipeline shown inline in chat | Users see the firewall working in real time, not hidden in a separate panel |
| Color-coded bias badges | Immediate visual signal — green/amber/red matches user intuition |
| Force Bias Toggle in sidebar | Demo/presentation requirement — shows the wrapper catching bias live |
| Slide-in bias details modal | Default chat view stays clean; power users can inspect the full report on demand |
| Glassmorphism design system | Dark navy + frosted glass cards create a high-trust, technical aesthetic |
| Pulsing `status-live` dot | Continuously reassures users the bias detection pipeline is active |

---

## Environment Variables

```env
# .env (Vite injects VITE_-prefixed vars into the client bundle)

VITE_API_BASE_URL=http://localhost:3000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_APP_TITLE="AI Bias Firewall"
VITE_BIAS_THRESHOLD=30        # Wrapper trigger threshold (%)
VITE_ENABLE_FORCE_BIAS=true   # Show Force Bias toggle in UI
```

> Variables are accessed in JS modules as `import.meta.env.VITE_API_BASE_URL`.

---

## Build & Development

```bash
# Install dev dependencies
npm install

# Start development server with HMR
npm run dev

# Build for production (outputs to dist/)
npm run build

# Preview the production build locally
npm run preview
```

**Recommended Node version:** 20 LTS

**Vite output:** All three HTML pages are built as separate entry points with hashed asset filenames for cache-busting. The `@tailwindcss/vite` plugin handles CSS compilation — no separate PostCSS config is required.

---

## Demo Mode: Force Bias Toggle

Located in the sidebar on `chat.html`. When enabled:
- The next submitted message uses a pre-built `biasedResponses[]` entry from the mock data array
- The pipeline simulation activates the `Auditing` and `Wrapping` stages
- The AI message bubble renders a `[HIGH]` badge and `Wrapper Applied` indicator
- Clicking "View Bias Details" shows the full bias breakdown with protected attributes, decision points, and the corrected response

This is the primary demo flow for showing the firewall catching and correcting biased AI output in real time.
