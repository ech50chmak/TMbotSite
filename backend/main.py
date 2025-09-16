# backend/main.py
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import shutil
import os
import uuid
from backend.logic.dxf_parser import dxf_to_polygons
from backend.logic.grid_generator import generate_cutting_plan

app = FastAPI()

# CORS (для связи с фронтом)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.post("/process-dxf/")
async def process_dxf(
    file: UploadFile = File(...),
    tile_w: float = Form(...),
    tile_h: float = Form(...),
    seam: float = Form(...),
    start_x: float = Form(...),
    start_y: float = Form(...),
    angle_deg: float = Form(...),
):
    try:
        # Сохраняем DXF-файл
        temp_filename = f"{uuid.uuid4()}.dxf"
        file_path = os.path.join(UPLOAD_DIR, temp_filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Парсим DXF в полигоны
        polygons = dxf_to_polygons(file_path)

        # Генерируем план подрезки
        cutting_plan = generate_cutting_plan(
            polygons, tile_w, tile_h, seam, (start_x, start_y), angle_deg
        )

        return JSONResponse(content={"status": "ok", "data": cutting_plan})

    except Exception as e:
        return JSONResponse(content={"status": "error", "message": str(e)})
