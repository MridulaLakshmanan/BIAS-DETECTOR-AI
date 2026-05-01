# 🚀 AI Bias Firewall  
### *Real-Time Fairness Layer for AI Systems*

> 🛡️ Detect. Audit. Correct. — Before AI reaches the user.

---

## 🌍 Problem

AI systems are increasingly used in **hiring, finance, and healthcare**, but they often inherit **hidden biases** from training data.

These biases:
- Are **invisible to users**
- Lead to **unfair decisions**
- Reduce **trust in AI systems**

---

## 💡 Solution

**AI Bias Firewall** is a **real-time fairness layer** that sits between users and AI models to ensure every response is:

✅ Monitored  
✅ Audited  
✅ Corrected  

— *before it reaches the user*

---

## ⚙️ How It Works

Our system uses a **4-stage bias mitigation pipeline**:

<img width="575" height="239" alt="Screenshot 2026-05-01 at 8 34 45 PM" src="https://github.com/user-attachments/assets/fa61dd05-408c-4ed4-a740-8aa971f9db44" />


---

## 🔥 Key Features

- 🧠 **Real-Time Bias Detection**
- ⚖️ **Automatic Bias Correction (Wrapper Engine)**
- 📊 **Live Bias Score & Confidence Indicators**
- 🔍 **Transparent Audit Logs & Reasoning**
- 📈 **Dashboard for Bias Trends & Analysis**
- 🧪 **Demo Mode (Force Bias Simulation)**

---

## 🖥️ Product Overview

### 💬 Chat Interface
- Accepts prompts & documents  
- Shows **live bias pipeline in action**  
- Displays:
  - Bias score  
  - Confidence level  
  - Wrapper applied indicator  

### 📊 Dashboard
- Tracks:
  - Bias trends over time  
  - High-risk attributes  
  - Wrapper usage rate  
- Enables:
  - Dataset preparation for retraining  
  - Full audit inspection  

---

## 🎯 Demo

🚨 **Biased Output Detected → Automatically Corrected**

The system:
1. Detects bias in real-time  
2. Flags it with a score  
3. Regenerates a **fair and neutral response**

---
<img width="1470" height="838" alt="Screenshot 2026-04-28 at 10 33 16 PM" src="https://github.com/user-attachments/assets/5575acd7-9080-4440-a1f0-8081fa636074" />

---
<img width="1464" height="838" alt="Screenshot 2026-04-28 at 10 38 24 PM" src="https://github.com/user-attachments/assets/70e47804-e1ef-4320-987c-baa7125f34d4" />
---
<img width="1470" height="834" alt="Screenshot 2026-04-28 at 10 35 39 PM" src="https://github.com/user-attachments/assets/88882d04-d408-45d0-8f83-a5809e961975" />
---
## 🏗️ Tech Stack

### Frontend
- Vanilla HTML + Vanilla js  
- Tailwind CSS + shadcn/ui  
- Zustand (State Management)  
- Recharts (Visualization)  
- WebSockets (Real-time updates)

### Backend
- FastAPI (Python)  
- spaCy + scikit-learn (Bias Detection)  
- Multi-LLM Support (Gemini AI api , nvidia llm)  
- PostgreSQL + Redis  
- Celery (Async tasks)

---

## 📂 Project Structure
frontend/ → HTML, Tailwind CSS, Js (Chat + Dashboard)
backend/ → FastAPI + Bias Pipeline
data/ → Logs & retraining datasets
