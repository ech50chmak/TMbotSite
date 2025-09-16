# backend/logic/grid_generator.py
from typing import List, Tuple
import math
from shapely.geometry import Polygon, MultiPolygon

def generate_cutting_plan(
        polygons: List[List[Tuple[float, float]]],
        tile_w: float,
        tile_h: float,
        seam: float,
        start: Tuple[float, float],
        angle_deg: float
) -> List[List[Tuple[float, float]]]:
    result = []
    angle_rad = math.radians(angle_deg)

    dx = (tile_w + seam) * math.cos(angle_rad)
    dy = (tile_w + seam) * math.sin(angle_rad)
    vx = (tile_h + seam) * math.sin(angle_rad)
    vy = -(tile_h + seam) * math.cos(angle_rad)

    origin_x, origin_y = start

    # Проверка на пустые полигоны
    area_polygons = [Polygon(poly) for poly in polygons if len(poly) >= 3]
    if not area_polygons:
        raise ValueError("Нет корректных полигонов из DXF")

    try:
        full_area = (
            area_polygons[0]
            if len(area_polygons) == 1
            else area_polygons[0].union(*area_polygons[1:])
        )
    except Exception as e:
        raise ValueError(f"Ошибка объединения полигонов: {e}")

    bounds = full_area.bounds  # (minx, miny, maxx, maxy)
    max_dim = max(bounds[2] - bounds[0], bounds[3] - bounds[1])

    num_tiles = int((max_dim * 2) / min(tile_w + seam, tile_h + seam)) + 10

    for row in range(-num_tiles, num_tiles):
        for col in range(-num_tiles, num_tiles):
            cx = origin_x + dx * col + vx * row
            cy = origin_y + dy * col + vy * row

            corners = []
            for (ox, oy) in [(0, 0), (tile_w, 0), (tile_w, tile_h), (0, tile_h)]:
                x = cx + ox * math.cos(angle_rad) - oy * math.sin(angle_rad)
                y = cy + ox * math.sin(angle_rad) + oy * math.cos(angle_rad)
                corners.append((x, y))

            tile_poly = Polygon(corners)
            if not tile_poly.intersects(full_area):
                continue

            clipped = tile_poly.intersection(full_area)
            if clipped.is_empty:
                continue

            # 🔥 фикс: MultiPolygon → берём каждую часть
            if isinstance(clipped, Polygon):
                coords = list(clipped.exterior.coords)
                result.append([(round(x, 2), round(y, 2)) for x, y in coords])
            elif isinstance(clipped, MultiPolygon):
                for geom in clipped.geoms:
                    coords = list(geom.exterior.coords)
                    result.append([(round(x, 2), round(y, 2)) for x, y in coords])

    return result
