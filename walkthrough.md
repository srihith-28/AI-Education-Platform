# AI Education Platform - Complete Walkthrough & Deployment Guide

Welcome to the comprehensive walkthrough of the AI Education Platform. This document highlights the core features developed, the architectural decisions made, and a complete guide on how to deploy this stack to production.

## 🌟 Feature Showcase

### 1. Relative Grading System (Bell Curve)
We built an advanced statistical grading engine for teachers. Instead of just static percentages, the platform:
- Computes the **class mean** and **standard deviation** dynamically.
- Assigns a **Z-Score** to each student.
- Translates Z-scores into relative letter grades (A, A-, B, etc.) using a standard bell curve.
- Includes absolute safeguards so high achievers (e.g., >=95%) are guaranteed an 'A' regardless of a skewed class average.

### 2. Dynamic Leaderboards
Gamification drives engagement. We implemented real-time leaderboards for both the teacher and student dashboards:
- Students can see their ranking based on total percentage.
- The relative letter grade (A-F) is prominently displayed with color-coded badges (Emerald, Blue, Amber, Rose).
- Teachers can view class-wide performance at a glance.

### 3. ChatGPT-Style AI Tutor & Teacher Agent
- **Student Side:** A context-aware RAG (Retrieval-Augmented Generation) chat assistant. It strictly answers questions based on the course material uploaded by the teacher.
- **Teacher Side:** An autonomous agent that helps generate quizzes, summarize materials, and orchestrate course structure.

### 4. Interactive Class Calendar
- Full calendar view to track assignments, lectures, and exams.
- Built-in event management directly accessible from the dashboard.

### 5. Production-Grade UI/UX
- A completely responsive, frosted-glass (glassmorphism) interface.
- Vibrant, dynamic gradients and accessible Dark/Light mode toggles.
- Built heavily using Tailwind CSS and Framer Motion for micro-interactions.

---

## 🏗️ Architecture & Migration Summary

To move this project from local development to a scalable production environment, several major migrations were completed:

| Component | Change |
|---|---|
| **Database** | SQLite ➡️ Supabase PostgreSQL |
| **Authentication** | Local JWTs ➡️ Supabase Auth (SSO / SSR ready) |
| **Vector DB (RAG)** | Local ChromaDB ➡️ Qdrant Cloud |
| **LLM Inference** | Local Ollama ➡️ Groq Cloud (Llama 3) |
| **Embeddings** | Local Nomic ➡️ OpenAI Text Embeddings |
| **Deployment** | Localhost ➡️ Vercel (Frontend) & Railway (Backend) |

---

## 🚀 Critical Steps Before Going Live

> [!CAUTION]
> These steps MUST be completed before the app will work end-to-end in production.

### 1. Supabase Configuration (DB & Auth)
1. Go to your Supabase Project Settings > API.
2. Copy the **JWT Secret** and add it to `backend/.env` as `SUPABASE_JWT_SECRET`.
3. Copy the **service_role** key and add it as `SUPABASE_SERVICE_ROLE_KEY`.
4. Copy the **Database Connection String** (pooler URL) and add it as `DATABASE_URL_OVERRIDE`.

### 2. Qdrant Cloud Cluster (Vector Search)
1. Create a free cluster at [cloud.qdrant.io](https://cloud.qdrant.io).
2. Copy your Cluster URL and API Key into `backend/.env` as `QDRANT_URL` and `QDRANT_API_KEY`.

### 3. API Keys (Groq & OpenAI)
1. Get your Groq API key from [console.groq.com](https://console.groq.com) (`GROQ_API_KEY`).
2. Get your OpenAI API key from [platform.openai.com](https://platform.openai.com) (`OPENAI_API_KEY`).

---

## 💻 Running Locally (After Migration)

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Verify the backend is running at: `http://localhost:8000/health`

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Open the platform at: `http://localhost:3000`

---

## 🌐 Production Deployment

### Backend ➡️ Railway
1. Push this repository to GitHub.
2. Create a Railway project and deploy directly from GitHub.
3. Set all environment variables from your `.env.production.example`.
4. Railway will auto-detect the `Procfile` and start the FastAPI server.

### Frontend ➡️ Vercel
1. Import this repository into Vercel.
2. Set the following environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_API_BASE_URL` (Point this to your Railway backend URL)
3. Deploy!

---
*Built with ❤️ for modern education.*
