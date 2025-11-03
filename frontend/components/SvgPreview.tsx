// frontend/components/SvgPreview.tsx
import React, { useEffect, useMemo, useState } from "react";
import SvgPreviewDesktop from "./SvgPreviewDesktop";
import SvgPreviewMobile from "./SvgPreviewMobile";

type SvgPreviewProps = {
  data?: number[][][];
  projectName?: string;
};

type InlineSvgPreviewProps = {
  data: number[][][];
  projectName?: string;
  isMobile: boolean;
};

export default function SvgPreview({ data, projectName }: SvgPreviewProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  if (data && data.length > 0) {
    return <InlineSvgPreview data={data} projectName={projectName} isMobile={isMobile} />;
  }

  return isMobile ? <SvgPreviewMobile /> : <SvgPreviewDesktop />;
}

function InlineSvgPreview({ data, projectName, isMobile }: InlineSvgPreviewProps) {
  const { viewBox, preparedPolygons } = useMemo(() => {
    const polygons = data.filter(
      (poly): poly is number[][] =>
        Array.isArray(poly) && poly.every((pt) => Array.isArray(pt) && pt.length >= 2)
    );

    if (!polygons.length) {
      return { viewBox: "0 0 100 100", preparedPolygons: [] as number[][][] };
    }

    const allPoints = polygons.flat();
    let minX = allPoints[0][0];
    let maxX = allPoints[0][0];
    let minY = allPoints[0][1];
    let maxY = allPoints[0][1];

    allPoints.forEach(([x, y]) => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });

    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);
    const padding = Math.max(Math.max(width, height) * 0.1, 10);

    const viewBoxValue = `${minX - padding} ${-maxY - padding} ${
      width + padding * 2
    } ${height + padding * 2}`;

    return { viewBox: viewBoxValue, preparedPolygons: polygons };
  }, [data]);

  if (!preparedPolygons.length) {
    return (
      <p className="mt-4 text-center text-sm text-gray-500">
        Нет данных для отображения предварительного просмотра.
      </p>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {projectName && (
        <h2 className="text-center text-lg font-semibold text-[#1b2060]">{projectName}</h2>
      )}
      <div className="w-full rounded-2xl border border-[#d6e53c]/60 bg-white shadow-md">
        <svg
          viewBox={viewBox}
          className={`w-full ${isMobile ? "h-[260px]" : "h-[460px]"}`}
          role="presentation"
        >
          {preparedPolygons.map((polygon, idx) => {
            const polygonKey = polygon.map((point) => point.join(",")).join("|");
            return (
              <polygon
                key={`${polygonKey}-${idx}`}
                points={polygon.map((point) => `${point[0]},${-point[1]}`).join(" ")}
                fill="#3b82f6"
                stroke="#1f2937"
                strokeWidth={1}
                fillOpacity={0.45}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
