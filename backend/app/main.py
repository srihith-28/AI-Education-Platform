import logging
import logging.config
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.requests import Request

from app.agents.router import router as agents_router
from app.auth.router import router as auth_router
from app.calendar.router import router as calendar_router
from app.classwork.router import router as classwork_router
from app.common.config import settings
from app.common.schemas import HealthResponse
from app.database.init_db import init_db
from app.grades.router import router as grades_router
from app.people.router import router as people_router
from app.student.router import router as student_router
from app.teacher.router import router as teacher_router
from app.users.router import router as users_router


# ── Structured JSON logging ────────────────────────────────────────────────────
LOG_LEVEL = "DEBUG" if settings.app_debug else "INFO"
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("ai-education-api")


# ── Rate limiter ───────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])


# ── Lifespan (replaces deprecated @app.on_event) ──────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting AI Education Platform API (%s env)", settings.app_env)
    try:
        init_db()
        logger.info("Database initialized successfully")
    except Exception:
        logger.exception("Database initialization failed — some features may be unavailable")
    yield
    logger.info("Shutting down AI Education Platform API")


# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.app_name,
    debug=settings.app_debug,
    version="2.0.0",
    description="AI Education Platform — Production API",
    lifespan=lifespan,
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — restrict to configured origins in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users_router, prefix="/api/v1/users", tags=["users"])
app.include_router(teacher_router, prefix="/api/v1/teacher", tags=["teacher"])
app.include_router(student_router, prefix="/api/v1/student", tags=["student"])
app.include_router(agents_router, prefix="/api/v1/agents", tags=["agents"])
app.include_router(calendar_router, prefix="/api/v1/calendar", tags=["calendar"])
app.include_router(classwork_router, prefix="/api/v1/classwork", tags=["classwork"])
app.include_router(people_router, prefix="/api/v1", tags=["people"])
app.include_router(grades_router, prefix="/api/v1/grades", tags=["grades"])


# ── Request logging middleware ─────────────────────────────────────────────────
@app.middleware("http")
async def request_logger(request: Request, call_next):
    response = await call_next(request)
    logger.info(
        "%s %s %s",
        request.method,
        request.url.path,
        response.status_code,
    )
    return response


# ── Health & root ──────────────────────────────────────────────────────────────
@app.get("/health", response_model=HealthResponse, tags=["system"])
def health() -> dict:
    return {"success": True, "status": "ok", "message": "Service is healthy"}


@app.get("/", tags=["system"])
def root() -> dict:
    return {
        "success": True,
        "message": "AI Education Platform API is running",
        "version": "2.0.0",
        "docs": "/docs",
        "health": "/health",
    }
