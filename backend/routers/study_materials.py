from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

from requirements_parser import parse_requirements
from study_data.study_config import ANALYSIS_SURVEY

STUDY_DIR = Path(__file__).resolve().parent.parent / "study_data"

router = APIRouter(
    prefix="/api/study/materials",
    tags=["study-materials"]
)

@router.get("/")
def get_study_materials():
    requirements_text = (STUDY_DIR / "requirements.txt").read_text(encoding="utf-8")
    requirements = parse_requirements(requirements_text, ".txt")

    return {
        "requirements": requirements,
        "context": (STUDY_DIR / "context.txt").read_text(encoding="utf-8"),
        "conops": (STUDY_DIR / "conops.txt").read_text(encoding="utf-8"),
        "conops_image_url": "/api/study/materials/conops-image"
    }

@router.get("/conops-image")
def get_conops_image():
    return FileResponse(
        STUDY_DIR / "conops_image.png",
        media_type="image/png"
    )