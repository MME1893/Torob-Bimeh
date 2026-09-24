"""FastAPI app and static laboratory pages served from the same origin."""

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .routers.azki import router as azki_router
from .routers.bimeh import router as bimeh_router
from .routers.bimebazar import router as bimebazar_router
from .routers.sabim import router as sabim_router
from .routers.search import router as search_router


ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / "backend" / ".env")

app = FastAPI(title="Torob Bimeh API", version="0.1.0")
app.include_router(azki_router)
app.include_router(bimeh_router)
app.include_router(bimebazar_router)
app.include_router(sabim_router)
app.include_router(search_router)
app.mount("/labs", StaticFiles(directory=ROOT / "frontend" / "labs"), name="labs")
DIST = ROOT / "frontend" / "dist"
if DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/", include_in_schema=False)
def home():
    if (DIST / "index.html").is_file():
        return FileResponse(DIST / "index.html")
    return RedirectResponse(url="/labs/azki.html")


@app.get("/logo.png", include_in_schema=False)
def logo():
    return FileResponse(ROOT / "frontend" / "public" / "logo.png")
