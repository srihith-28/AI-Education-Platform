# AI Education Platform Monorepo

Production-style full-stack AI education system with:
- Next.js (App Router) + Tailwind + Framer Motion frontend
- FastAPI modular backend
- PostgreSQL for transactional data
- ChromaDB for vector search
- Ollama (`llama3.1`) + `nomic-embed-text`
- LangChain for RAG and AI agents

## Structure

```
/backend
/frontend
```

## Backend Features

- Modular architecture:
  - `auth/`, `users/`, `teacher/`, `student/`, `rag/`, `agents/`, `database/`
- JWT auth with bcrypt password hashing
- RBAC for teacher/student protected routes
- Teacher workflows:
  - course creation
  - material upload endpoint (`/api/v1/teacher/upload-material`)
  - auto-ingestion to Chroma
  - AI quiz generation
- Student workflows:
  - RAG Q&A (`/api/v1/student/ask`)
  - AI-evaluated quizzes
  - progress tracking + leaderboard
  - personalized learning path recommendations
- Teacher AI Agent (LangChain Agent + tools)
- Student AI assistant with conversation memory
- Swagger docs at `/docs`

## Frontend Features

- Landing page
- Login/Signup pages
- Role-based dashboards (Teacher / Student)
- Animated glassmorphism UI + dark/light mode
- Teacher dashboard:
  - course creation
  - file upload with progress indicator
  - teacher AI agent chat panel
- Student dashboard:
  - ChatGPT-style AI tutor
  - leaderboard and progress cards

## Prerequisites

- Python 3.11 (recommended and tested)
- Node.js 20+
- PostgreSQL running locally
- Ollama running locally

Pull models in Ollama:

```powershell
ollama pull llama3.1
ollama pull nomic-embed-text
```

## Backend Setup

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
python -m app.database.init_db
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

If you already created a virtual environment with Python 3.14 or newer, recreate it with Python 3.11 before installing dependencies.

For fully reproducible installs, a locked dependency snapshot is available at `backend/requirements.lock.txt`.

```powershell
pip install -r requirements.lock.txt
```

## Frontend Setup

```powershell
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

Open frontend: `http://localhost:3000`

## Key API Endpoints

- `POST /api/v1/auth/signup`
- `POST /api/v1/auth/login`
- `GET /api/v1/users/me`
- `POST /api/v1/teacher/courses`
- `POST /api/v1/teacher/upload-material`
- `POST /api/v1/teacher/generate-quiz`
- `POST /api/v1/student/ask`
- `POST /api/v1/student/quiz-attempt`
- `POST /api/v1/student/progress`
- `GET /api/v1/student/progress/summary`
- `GET /api/v1/student/leaderboard`
- `GET /api/v1/student/learning-path`
- `POST /api/v1/agents/teacher-chat`

## Notes

- Local file storage is used at `backend/storage/materials`
- Chroma persists in `backend/storage/chroma`
- No Docker is required

## Public Repository Safety

Before pushing this project to a public GitHub repository:

1. Do not commit secrets.
  - Keep runtime secrets only in `backend/.env` and `frontend/.env.local`.
  - Use `backend/.env.example` and `frontend/.env.example` as templates.
2. Ensure local runtime artifacts are not tracked.
  - Python virtualenvs (for example `backend/.venv/`)
  - `frontend/node_modules/`, `frontend/.next/`
  - `backend/storage/` and local DB files
3. Rotate any previously exposed credentials before production use.
  - Database password
  - JWT/app secret keys
4. Verify your git index before first push:

```powershell
git status
git ls-files backend/.venv
git ls-files backend/.env
```

The last two commands should return no files.
