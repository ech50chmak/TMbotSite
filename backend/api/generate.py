# backend/api/generate.py
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Tuple
from backend.logic.grid_generator import generate_cutting_plan

router = APIRouter()

class CuttingInput(BaseModel):
    polygons: List[List[Tuple[float, float]]]
    tile_w: float
    tile_h: float
    seam: float
    start: Tuple[float, float]
    angle_deg: float

@router.post("/generate")
def generate_tiles(data: CuttingInput):
    try:
        result = generate_cutting_plan(
            polygons=data.polygons,
            tile_w=data.tile_w,
            tile_h=data.tile_h,
            seam=data.seam,
            start=data.start,
            angle_deg=data.angle_deg,
        )
        return {"result": result}
    except Exception as e:
        return {"error": str(e)}
