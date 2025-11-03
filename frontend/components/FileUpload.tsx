// frontend/components/FileUpload.tsx
import React, { useState } from "react";
import { sendDxfAndParams } from "../lib/api";
import SvgPreview from "./SvgPreview";
import { CuttingParams } from "@/lib/dxf-processing";

const FileUpload: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [params, setParams] = useState<CuttingParams>({
    tile_w: 135,
    tile_h: 135,
    seam: 10,
    start_x: 200,
    start_y: 275,
    angle_deg: 30,
  });
  const [cutData, setCutData] = useState<number[][][]>([]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!file) return alert("Загрузите DXF файл");
    try {
      setLoading(true);
      const res = await sendDxfAndParams(file, params);
      setCutData(res.data);
    } catch (error) {
      console.error("Ошибка обработки DXF:", error);
      alert("Ошибка при отправке запроса");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-xl font-bold mb-4">Загрузка DXF и параметры сетки</h1>

      <input
        type="file"
        accept=".dxf"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="mb-4"
      />

      <div className="grid grid-cols-2 gap-2 mb-4">
        {(Object.entries(params) as Array<[keyof CuttingParams, number]>).map(([key, value]) => (
          <label key={key} className="flex flex-col text-sm">
            {key}
            <input
              type="number"
              value={value}
              onChange={(e) =>
                setParams((prev) => ({
                  ...prev,
                  [key]: parseFloat(e.target.value),
                }))
              }
              className="border px-2 py-1 rounded"
            />
          </label>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        disabled={loading}
      >
        {loading ? "Обработка..." : "Построить сетку"}
      </button>

      {cutData.length > 0 && (
        <SvgPreview data={cutData} projectName="Предпросмотр раскладки" />
      )}
    </div>
  );
};

export default FileUpload;
