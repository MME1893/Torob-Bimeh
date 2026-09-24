"""FastAPI app and static laboratory pages served from the same origin."""

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from .routers.azki import router as azki_router


ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / "backend" / ".env")

app = FastAPI(title="Torob Bimeh API", version="0.1.0")
app.include_router(azki_router)
app.mount("/labs", StaticFiles(directory=ROOT / "frontend" / "labs"), name="labs")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/", include_in_schema=False)
def home():
    return RedirectResponse(url="/labs/azki.html")
