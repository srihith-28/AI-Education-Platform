import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request

from app.agents.router import router as agents_router
from app.auth.router import router as auth_router
from app.common.config import settings
from app.common.schemas import HealthResponse
from app.database.init_db import init_db
from app.student.router import router as student_router
from app.teacher.router import router as teacher_router
from app.users.router import router as users_router


app = FastAPI(title=settings.app_name, debug=settings.app_debug, version="1.0.0")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
logger = logging.getLogger("ai-education-api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users_router, prefix="/api/v1/users", tags=["users"])
app.include_router(teacher_router, prefix="/api/v1/teacher", tags=["teacher"])
app.include_router(student_router, prefix="/api/v1/student", tags=["student"])
app.include_router(agents_router, prefix="/api/v1/agents", tags=["agents"])


@app.on_event("startup")
def startup_database() -> None:
    init_db()


@app.middleware("http")
async def request_logger(request: Request, call_next):
    response = await call_next(request)
    logger.info("%s %s -> %s", request.method, request.url.path, response.status_code)
    return response


@app.get("/health", response_model=HealthResponse)
def health() -> dict:
    return {"success": True, "status": "ok", "message": "Service is healthy"}


@app.get("/")
def root() -> dict:
    return {
        "success": True,
        "message": "AI Education Platform API is running",
        "docs": "/docs",
        "health": "/health",
    }
