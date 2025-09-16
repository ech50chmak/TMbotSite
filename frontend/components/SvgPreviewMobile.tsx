// components/SvgPreviewMobile.tsx
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";

type Point = [number, number];
type Polygon = Point[];

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export default function SvgPreviewMobile() {
  const router = useRouter();
  const { id } = router.query;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [viewBox, setViewBox] = useState<string>("0 0 1000 1000");

  // Разделы для скролла
  const previewTopRef = useRef<HTMLDivElement | null>(null);
  const paramsRef = useRef<HTMLDivElement | null>(null);

  // Данные проекта
  const [projectName, setProjectName] = useState("Черновик");
  const [polygons, setPolygons] = useState<Polygon[]>([]);
  const [tileW, setTileW] = useState(100);
  const [tileH, setTileH] = useState(100);
  const [seam, setSeam] = useState(2);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [angle, setAngle] = useState(0);
  const [dxfFile, setDxfFile] = useState<File | null>(null);
  const [dxfName, setDxfName] = useState("");

  // Служебные
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Подгружаем проект
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${id}`);
        if (!res.ok) return;
        const { project } = await res.json();

        setProjectName(project.name ?? "Черновик");
        if (project.svg) {
          try {
            setPolygons(JSON.parse(project.svg));
          } catch (e) {
            console.warn("Ошибка парсинга svg:", e);
          }
        }
        if (project.params) {
          const p = project.params as any;
          setTileW(p.tile_w ?? 100);
          setTileH(p.tile_h ?? 100);
          setSeam(p.seam ?? 2);
          setStartX(p.start_x ?? 0);
          setStartY(p.start_y ?? 0);
          setAngle(p.angle_deg ?? 0);
          setDxfName(p.dxfName ?? "");
        }
      } catch (err) {
        console.error("Ошибка загрузки проекта:", err);
      }
    })();
  }, [id]);

  // Файл DXF
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setDxfFile(e.target.files[0]);
      setDxfName(e.target.files[0].name);
    }
  };

  // Создание сетки
  const handleGenerateGrid = async () => {
    if (!id) {
      setMessage("Ошибка: нет ID проекта");
      return;
    }
    if (!dxfFile) {
      setMessage("Выберите DXF файл");
      return;
    }

    try {
      setLoading(true);
      setMessage("Создание сетки...");

      const formData = new FormData();
      formData.append("file", dxfFile);
      formData.append("tile_w", String(tileW));
      formData.append("tile_h", String(tileH));
      formData.append("seam", String(seam));
      formData.append("start_x", String(startX));
      formData.append("start_y", String(startY));
      formData.append("angle_deg", String(angle));

      const res = await fetch(`${API_URL}/process-dxf/`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (json.status !== "ok") throw new Error(json.message || "Ошибка генерации");

      setPolygons(json.data);

      // Сохраняем
      const saveRes = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          svg: JSON.stringify(json.data),
          params: {
            tile_w: tileW,
            tile_h: tileH,
            seam,
            start_x: startX,
            start_y: startY,
            angle_deg: angle,
            dxfName,
          },
        }),
      });
      if (!saveRes.ok) throw new Error("Не удалось сохранить сетку");

      setMessage("Сетка сохранена");

      // После генерации поднимаемся к превью
      setTimeout(() => {
        previewTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (err: any) {
      console.error("Ошибка генерации:", err);
      setMessage("Ошибка генерации: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Автонастройка viewBox
  useEffect(() => {
    if (!polygons || polygons.length === 0) return;
    const allPoints = polygons.flat();
    const minX = Math.min(...allPoints.map((p) => p[0]));
    const minY = Math.min(...allPoints.map((p) => p[1]));
    const maxX = Math.max(...allPoints.map((p) => p[0]));
    const maxY = Math.max(...allPoints.map((p) => p[1]));
    const padding = 50;
    setViewBox(
      `${minX - padding} ${-maxY - padding} ${maxX - minX + padding * 2} ${
        maxY - minY + padding * 2
      }`
    );
  }, [polygons]);

  // --- Pan/Zoom (общие обработчики)
  const [isPanning, setIsPanning] = useState(false);
  const panRef = useRef({
    startClientX: 0,
    startClientY: 0,
    vbStart: [0, 0, 1000, 1000] as [number, number, number, number],
  });
  const pinchRef = useRef<{
    active: boolean;
    startDist: number;
    startMid: { x: number; y: number };
    vbStart: [number, number, number, number];
  }>({
    active: false,
    startDist: 0,
    startMid: { x: 0, y: 0 },
    vbStart: [0, 0, 1000, 1000],
  });

  function parseVB(vbStr: string): [number, number, number, number] {
    const [x, y, w, h] = vbStr.split(" ").map(Number);
    return [x, y, w, h];
  }
  function setVB(x: number, y: number, w: number, h: number) {
    setViewBox(`${x} ${y} ${w} ${h}`);
  }
  function clientToSvg(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { sx: 0, sy: 0 };
    const rect = svg.getBoundingClientRect();
    const [x, y, w, h] = parseVB(viewBox);
    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;
    return { sx: x + nx * w, sy: y + ny * h };
  }
  // wheel zoom (на случай если на мобиле с мышью)
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const [x, y, w, h] = parseVB(viewBox);
    const scale = e.deltaY > 0 ? 1.1 : 0.9;
    const { sx, sy } = clientToSvg(e.clientX, e.clientY);
    const nw = w * scale;
    const nh = h * scale;
    const nx = sx - ((sx - x) / w) * nw;
    const ny = sy - ((sy - y) / h) * nh;
    setVB(nx, ny, nw, nh);
  };
  // touch
  function distance(t1: Touch, t2: Touch) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.hypot(dx, dy);
  }
  function midpoint(t1: Touch, t2: Touch) {
    return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
  }
  const handleTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 1) {
      setIsPanning(true);
      panRef.current.startClientX = e.touches[0].clientX;
      panRef.current.startClientY = e.touches[0].clientY;
      panRef.current.vbStart = parseVB(viewBox);
    } else if (e.touches.length === 2) {
      setIsPanning(false);
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      pinchRef.current.active = true;
      pinchRef.current.startDist = distance(t1, t2);
      pinchRef.current.startMid = midpoint(t1, t2);
      pinchRef.current.vbStart = parseVB(viewBox);
    }
  };
  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (pinchRef.current.active && e.touches.length === 2) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const newDist = distance(t1, t2);
      const mid = midpoint(t1, t2);
      const [sx, sy, sw, sh] = pinchRef.current.vbStart;
      const scale = pinchRef.current.startDist / newDist;
      const nw = sw * scale;
      const nh = sh * scale;
      const { sx: cx, sy: cy } = clientToSvg(mid.x, mid.y);
      const nx = cx - ((cx - sx) / sw) * nw;
      const ny = cy - ((cy - sy) / sh) * nh;
      setVB(nx, ny, nw, nh);
    } else if (isPanning && e.touches.length === 1 && svgRef.current) {
      e.preventDefault();
      const rect = svgRef.current.getBoundingClientRect();
      const [sx, sy, sw, sh] = panRef.current.vbStart;
      const dxPx = e.touches[0].clientX - panRef.current.startClientX;
      const dyPx = e.touches[0].clientY - panRef.current.startClientY;
      const dx = -dxPx * (sw / rect.width);
      const dy = -dyPx * (sh / rect.height);
      setVB(sx + dx, sy + dy, sw, sh);
    }
  };
  const handleTouchEnd = () => {
    pinchRef.current.active = false;
    setIsPanning(false);
  };

  // Скролл к параметрам/превью
  const scrollToParams = () =>
    paramsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const scrollToPreview = () =>
    previewTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat bg-[#0f1533] px-4 py-4"
      style={{ backgroundImage: "url('/background.png')" }}
    >
      {/* Верх: превью */}
      <div
        ref={previewTopRef}
        className="rounded-[24px] bg-[#1b2060]/80 p-3 flex flex-col gap-3"
      >
        <div className="w-full h-[56px] bg-[#1b2060] rounded-full flex items-center justify-center">
          <h2 className="text-lg font-bold text-[#90d67f]">{projectName}</h2>
        </div>

        <div className="h-[48vh] bg-white rounded-xl overflow-hidden">
          {polygons.length > 0 ? (
            <svg
              ref={svgRef}
              viewBox={viewBox}
              width="100%"
              height="100%"
              className="w-full h-full cursor-move"
              style={{ touchAction: "none" }}
              onWheel={handleWheel}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
            >
              {polygons.map((poly, i) => (
                <polygon
                  key={i}
                  points={poly.map((p) => `${p[0]},${-p[1]}`).join(" ")}
                  fill="#3b82f6"
                  stroke="black"
                  strokeWidth={1}
                  fillOpacity={0.5}
                />
              ))}
            </svg>
          ) : (
            <div className="h-full flex items-center justify-center text-[#1b2060] gap-3 flex-col">
              <p>Нет данных для отображения</p>
              <button
                onClick={scrollToParams}
                className="bg-[#d6e53c] text-[#1b2060] font-semibold rounded-full px-6 py-2"
              >
                Изменить сетку
              </button>
            </div>
          )}
        </div>

        {polygons.length > 0 && (
          <div className="flex justify-center">
            <button
              onClick={scrollToParams}
              className="bg-[#d6e53c] text-[#1b2060] font-semibold rounded-full px-6 py-2"
            >
              Изменить параметры
            </button>
          </div>
        )}
      </div>

      {/* Низ: параметры */}
      <div
        ref={paramsRef}
        className="mt-4 rounded-[24px] bg-[#1b2060]/80 p-4 text-[#90d67f] flex flex-col gap-3"
      >
        <div className="w-full h-[56px] bg-[#1b2060] rounded-full flex items-center justify-center">
          <h2 className="text-lg font-bold">Параметры</h2>
        </div>

        <input
          type="file"
          accept=".dxf"
          onChange={handleFileChange}
          className="hidden"
          id="dxfInput"
        />
        <label
          htmlFor="dxfInput"
          className="cursor-pointer w-full bg-[#d6e53c] text-[#1b2060] font-semibold rounded-full px-4 py-3 text-center"
        >
          {dxfName ? `Файл: ${dxfName}` : "Выберите DXF"}
        </label>

        <div>
          <label className="block mb-1">Размер плитки (мм)</label>
          <div className="flex gap-2">
            <input
              value={tileW}
              onChange={(e) => setTileW(Number(e.target.value))}
              type="number"
              placeholder="X"
              className="w-full rounded-full px-3 py-2 bg-[#90d67f] text-[#1b2060] text-center"
            />
            <input
              value={tileH}
              onChange={(e) => setTileH(Number(e.target.value))}
              type="number"
              placeholder="Y"
              className="w-full rounded-full px-3 py-2 bg-[#90d67f] text-[#1b2060] text-center"
            />
          </div>
        </div>

        <div>
          <label className="block mb-1">Старт сетки (мм)</label>
          <div className="flex gap-2">
            <input
              value={startX}
              onChange={(e) => setStartX(Number(e.target.value))}
              type="number"
              placeholder="X"
              className="w-full rounded-full px-3 py-2 bg-[#90d67f] text-[#1b2060] text-center"
            />
            <input
              value={startY}
              onChange={(e) => setStartY(Number(e.target.value))}
              type="number"
              placeholder="Y"
              className="w-full rounded-full px-3 py-2 bg-[#90d67f] text-[#1b2060] text-center"
            />
          </div>
        </div>

        <div>
          <label className="block mb-1">Угол сетки</label>
          <input
            value={angle}
            onChange={(e) => setAngle(Number(e.target.value))}
            type="number"
            className="w-full rounded-full px-3 py-2 bg-[#90d67f] text-[#1b2060] text-center"
          />
        </div>

        <div>
          <label className="block mb-1">Шов (мм)</label>
          <input
            value={seam}
            onChange={(e) => setSeam(Number(e.target.value))}
            type="number"
            className="w-full rounded-full px-3 py-2 bg-[#90d67f] text-[#1b2060] text-center"
          />
        </div>

        <button
          onClick={handleGenerateGrid}
          disabled={loading}
          className="w-full bg-[#d6e53c] text-[#1b2060] font-semibold rounded-full px-4 py-3"
        >
          {loading ? "Загрузка..." : "Создать сетку"}
        </button>

        {message && (
          <p className="text-sm text-center text-[#d6e53c]">{message}</p>
        )}

        <div className="flex gap-2 mt-2">
          <button
            onClick={scrollToPreview}
            className="flex-1 bg-[#d6e53c] text-[#1b2060] font-semibold rounded-full px-4 py-3"
          >
            К превью
          </button>
          <button
            onClick={() => router.push("/projects")}
            className="flex-1 bg-[#d6e53c] text-[#1b2060] font-semibold rounded-full px-4 py-3"
          >
            К проектам
          </button>
        </div>
      </div>
    </div>
  );
}
