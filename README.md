# AI Education Platform 🚀

A modern, production-ready full-stack AI education system designed to bridge the gap between traditional learning and next-generation artificial intelligence. Built with a focus on stunning aesthetics, deep analytics, and seamless AI integration.

## ✨ Key Features & Highlights

### 🎨 Stunning, Modern UX/UI
- **Glassmorphism Design:** Beautiful, frosted-glass components with vibrant, dynamic gradients.
- **Dark/Light Mode:** Seamless theme toggling for accessible and comfortable viewing at any hour.
- **Responsive Animations:** Micro-interactions built with Framer Motion and Tailwind CSS.

### 🧠 Advanced AI Capabilities
- **ChatGPT-Style AI Tutor:** A dedicated AI chat window utilizing RAG (Retrieval-Augmented Generation) to answer student queries contextually based on uploaded course material.
- **Teacher AI Agent:** An autonomous LangChain-powered agent to help teachers generate quizzes, grade assignments, and orchestrate course material.
- **Local AI Models:** Powered by local Ollama (`llama3.1` and `nomic-embed-text`) ensuring privacy and zero token costs, integrated with ChromaDB for fast vector search.

### 📊 Advanced Grading & Analytics
- **Spreadsheet-Style Grading Dashboard:** A highly interactive, real-time grading interface for teachers with auto-saving cells and CSV exports.
- **Relative Z-Score Grading (Bell Curve):** An advanced statistical grading algorithm that automatically calculates class means, variances, and standard deviations to assign relative letter grades (A, A-, B, etc.). Includes absolute safeguards to ensure top performers are perfectly rewarded.
- **Dynamic Leaderboards:** Real-time leaderboards for both teachers and students, displaying overall percentages and relative grades to encourage healthy gamification.

### 🔐 Enterprise-Grade Infrastructure
- **Supabase Integration:** Secure, scalable PostgreSQL database and seamless Authentication management.
- **Modular FastAPI Backend:** Clean, maintainable architecture separating authentication, users, RAG, agents, and database models.
- **Next.js App Router:** Optimized, server-rendered frontend for lightning-fast performance and SEO.

---

## 🛠️ Tech Stack

**Frontend:** Next.js (App Router), React, Tailwind CSS, Framer Motion, TypeScript, Lucide Icons  
**Backend:** Python 3.11, FastAPI, SQLAlchemy, Supabase, PostgreSQL  
**AI Layer:** LangChain, ChromaDB, Ollama, HuggingFace  

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- Python 3.11
- PostgreSQL (via Supabase)
- Ollama (running locally)

### 1. Setup Local AI Models
```bash
ollama pull llama3.1
ollama pull nomic-embed-text
```

### 2. Backend Setup
```bash
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Configure your environment variables (.env) with your Supabase credentials
copy .env.example .env

# Run database migrations
python -m app.database.init_db

# Start the server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Frontend Setup
```bash
cd frontend
npm install

# Configure your environment variables
copy .env.example .env.local

# Start the dev server
npm run dev
```

Open your browser to `http://localhost:3000` to view the platform!

---

## 🛡️ Security & Best Practices
- **Never commit `.env.local` or `.env` files.**
- Role-based access control (RBAC) ensures students cannot access teacher grading dashboards.
- Database operations are securely handled via Supabase Row Level Security (RLS) and FastAPI dependencies.
