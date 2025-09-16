import ezdxf
import math
from shapely.geometry import Polygon, LineString
from shapely.ops import linemerge, polygonize
from typing import List, Tuple


def approximate_arc(center, radius, start_angle, end_angle, segments=30):
    """Разбивает дугу на линейные сегменты"""
    # Углы в радианах
    start_rad = math.radians(start_angle)
    end_rad = math.radians(end_angle)

    if end_rad < start_rad:
        end_rad += 2 * math.pi

    delta = (end_rad - start_rad) / segments
    return [
        (
            center[0] + radius * math.cos(start_rad + i * delta),
            center[1] + radius * math.sin(start_rad + i * delta),
        )
        for i in range(segments + 1)
    ]


def dxf_to_polygons(file_path: str) -> List[List[Tuple[float, float]]]:
    """
    Чтение DXF-файла и преобразование в список полигонов
    Возвращает список списков координат [(x1, y1), (x2, y2), ...]
    """
    try:
        doc = ezdxf.readfile(file_path)
        msp = doc.modelspace()
        lines = []

        for entity in msp:
            if entity.dxftype() == "LINE":
                start = entity.dxf.start
                end = entity.dxf.end
                lines.append(LineString([(start.x, start.y), (end.x, end.y)]))

            elif entity.dxftype() in {"POLYLINE", "LWPOLYLINE"}:
                points = [(point[0], point[1]) for point in entity.lwpoints()]
                if len(points) > 1:
                    lines.append(LineString(points))

            elif entity.dxftype() == "SPLINE":
                spline_points = entity.approximate(segments=50)
                points = [(p.x, p.y) for p in spline_points]
                lines.append(LineString(points))

            elif entity.dxftype() == "CIRCLE":
                center = entity.dxf.center
                radius = entity.dxf.radius
                circle = [
                    (
                        center.x + radius * math.cos(2 * math.pi * i / 50),
                        center.y + radius * math.sin(2 * math.pi * i / 50),
                    )
                    for i in range(51)
                ]
                lines.append(LineString(circle))

            elif entity.dxftype() == "ARC":
                center = (entity.dxf.center.x, entity.dxf.center.y)
                radius = entity.dxf.radius
                start_angle = entity.dxf.start_angle
                end_angle = entity.dxf.end_angle
                arc_points = approximate_arc(center, radius, start_angle, end_angle)
                lines.append(LineString(arc_points))

        merged = linemerge(lines)
        polygons = list(polygonize(merged))

        if not polygons:
            raise ValueError("Контур не замкнут или не удалось сформировать полигоны.")

        result = []
        for poly in polygons:
            coords = list(poly.exterior.coords)
            if len(coords) < 4 or coords[0] != coords[-1]:
                raise ValueError("Один из контуров не замкнут или содержит меньше 4 точек.")
            result.append([(round(x, 2), round(y, 2)) for x, y in coords])

        return result

    except Exception as e:
        print(f"Ошибка чтения DXF: {e}")
        raise
