# AI Education Platform — Migration Walkthrough

## What Was Accomplished

The AI Education Platform has been fully migrated from a local development stack to a production-ready cloud architecture across 8 phases.

---

## Supabase Project

- **Project Name**: `ai-education-platform`  
- **Project ID**: `ueecrmnssoubvztdsapi`
- **Region**: `ap-southeast-1` (Singapore)
- **URL**: `https://ueecrmnssoubvztdsapi.supabase.co`
- **Storage Bucket**: `course-materials` (private, signed URLs)

---

## Changes Summary

### Backend

| File | Change |
|---|---|
| `app/common/config.py` | Replaced Ollama/Chroma settings with Supabase, Qdrant, Groq, OpenAI configs |
| `app/common/security.py` | Replaced custom JWT create/verify with Supabase JWT verification only |
| `app/common/deps.py` | Auto-provisions users in DB on first login via `supabase_uid` |
| `app/common/storage.py` | **New** — Supabase Storage service abstraction |
| `app/auth/service.py` | Replaced bcrypt/JWT auth with profile sync helper |
| `app/auth/router.py` | New `/sync` and `/me` endpoints; removed `/login` and `/signup` |
| `app/auth/schemas.py` | Updated schemas for Supabase auth flow |
| `app/database/models.py` | Added `supabase_uid` column to User |
| `app/database/session.py` | Added production pool settings |
| `app/database/init_db.py` | Added `supabase_uid` migration |
| `app/rag/embeddings.py` | Replaced ChromaDB + Ollama → Qdrant Cloud + OpenAI |
| `app/rag/query.py` | Qdrant filter syntax; deprecated `get_relevant_documents` → `invoke` |
| `app/agents/orchestration.py` | Replaced Ollama pool with Groq two-tier model selection |
| `app/agents/teacher_agent.py` | Removed Ollama health check |
| `app/agents/tools.py` | Replaced OllamaLLM with ChatGroq |
| `app/main.py` | Production CORS, rate limiting, lifespan context manager |
| `requirements.txt` | Complete dependency swap |
| `Procfile` | **New** — Railway deployment |
| `railway.toml` | **New** — Railway config with health check |
| `.env` | Updated with all new service credentials (placeholders for secrets) |
| `.env.production.example` | **New** — Production env template |

### Frontend

| File | Change |
|---|---|
| `lib/supabase.ts` | **New** — Supabase browser client singleton |
| `lib/auth.ts` | Replaced localStorage/cookie auth with Supabase session |
| `lib/api.ts` | Async token retrieval; `syncUser` replaces `signup`/`login` |
| `middleware.ts` | Supabase SSR session verification replaces cookie check |
| `app/(auth)/login/page.tsx` | Supabase `signInWithPassword` |
| `app/(auth)/signup/page.tsx` | Supabase `signUp` + backend `syncUser` |
| `package.json` | Added `@supabase/supabase-js`, `@supabase/ssr` |
| `.env.local` | Supabase URL + anon key + backend URL |
| `vercel.json` | **New** — Vercel deployment config with security headers |

---

## Critical Steps Before Going Live

> [!CAUTION]
> These steps MUST be completed before the app will work end-to-end.

### 1. Get Supabase JWT Secret (REQUIRED for backend auth)

1. Go to [https://supabase.com/dashboard/project/ueecrmnssoubvztdsapi/settings/api](https://supabase.com/dashboard/project/ueecrmnssoubvztdsapi/settings/api)
2. Copy **JWT Secret** from the "Project API keys" section
3. Add to `backend/.env`:
   ```
   SUPABASE_JWT_SECRET=<your-jwt-secret>
   ```

### 2. Get Supabase Service Role Key (REQUIRED for storage)

1. On the same API settings page
2. Copy **service_role** key (keep this SECRET — never expose to frontend)
3. Add to `backend/.env`:
   ```
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
   ```

### 3. Get Supabase DB Password + Connection String (REQUIRED for DB)

1. Go to Supabase Dashboard → Project Settings → Database
2. Copy the connection string (use the **pooler** URL for production)
3. Add to `backend/.env`:
   ```
   DATABASE_URL_OVERRIDE=postgresql://postgres.ueecrmnssoubvztdsapi:[password]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
   ```

### 4. Disable Email Confirmation for Development (Optional)

1. Supabase Dashboard → Authentication → Providers → Email
2. Toggle off "Confirm email" for easier testing
3. Re-enable in production

### 5. Create Qdrant Cloud Cluster

1. Go to [https://cloud.qdrant.io](https://cloud.qdrant.io)
2. Create a free cluster
3. Copy Cluster URL and API Key
4. Add to `backend/.env`:
   ```
   QDRANT_URL=https://xxx.us-east4-0.gcp.cloud.qdrant.io
   QDRANT_API_KEY=<key>
   ```

### 6. Get Groq API Key

1. Go to [https://console.groq.com/keys](https://console.groq.com/keys)
2. Create API key
3. Add to `backend/.env`:
   ```
   GROQ_API_KEY=gsk_...
   ```

### 7. Get OpenAI API Key

1. Go to [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create API key
3. Add to `backend/.env`:
   ```
   OPENAI_API_KEY=sk-...
   ```

---

## Running Locally (After Filling Credentials)

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Verify: `curl http://localhost:8000/health`

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open: [http://localhost:3000](http://localhost:3000)

---

## Auth Flow (New)

```
User fills signup form
       ↓
supabase.auth.signUp(email, password, { data: { name, role } })
       ↓
Supabase creates user with app_metadata.role
       ↓
Frontend calls POST /api/v1/auth/sync { name, role }
       ↓
Backend verifies Supabase JWT, upserts User in PostgreSQL
       ↓
User redirected to /dashboard/{role}
```

```
User fills login form
       ↓
supabase.auth.signInWithPassword(email, password)
       ↓
Supabase returns session with access_token (JWT)
       ↓
Frontend stores session (auto-managed by Supabase SDK)
       ↓
All API calls use session.access_token as Bearer token
       ↓
FastAPI verifies Supabase JWT → gets supabase_uid → fetches User from DB
```

---

## Deployment

### Backend → Railway

1. Push to GitHub
2. Create Railway project → Deploy from GitHub
3. Set all environment variables from `.env.production.example`
4. Railway auto-detects `Procfile` and starts the server
5. Health check: `https://your-app.railway.app/health`

### Frontend → Vercel

1. Push to GitHub
2. Import project in Vercel
3. Set environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_API_BASE_URL` (Railway backend URL)
4. Deploy

---

## Architecture After Migration

```
┌─────────────────┐     JWT (Supabase)     ┌──────────────────────┐
│   Next.js       │ ◄──────────────────── │    Supabase Auth     │
│   (Vercel)      │ ──────────────────────►│    (Email Auth)      │
└────────┬────────┘                        └──────────────────────┘
         │ Bearer token                              │
         ▼                                    user metadata
┌─────────────────┐                        ┌──────────────────────┐
│   FastAPI       │ ◄──────────────────── │  Supabase PostgreSQL │
│   (Railway)     │    SQLAlchemy ORM      │  (User, Course, etc) │
└────────┬────────┘                        └──────────────────────┘
         │                                          │
    ┌────┴────┐                              ┌──────┴──────┐
    │         │                              │             │
    ▼         ▼                              ▼             ▼
┌───────┐ ┌──────┐                    ┌──────────┐  ┌──────────┐
│ Groq  │ │OpenAI│                    │  Qdrant  │  │ Supabase │
│  LLM  │ │Embed │                    │  Cloud   │  │ Storage  │
└───────┘ └──────┘                    └──────────┘  └──────────┘
```
