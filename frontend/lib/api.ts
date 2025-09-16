// frontend/lib/api.ts
export async function sendDxfAndParams(
  file: File,
  params: {
    tile_w: number;
    tile_h: number;
    seam: number;
    start_x: number;
    start_y: number;
    angle_deg: number;
  }
): Promise<{ status: string; data: any[] }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("tile_w", String(params.tile_w));
  formData.append("tile_h", String(params.tile_h));
  formData.append("seam", String(params.seam));
  formData.append("start_x", String(params.start_x));
  formData.append("start_y", String(params.start_y));
  formData.append("angle_deg", String(params.angle_deg));

  const res = await fetch("http://127.0.0.1:8000/process-dxf/", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error("Ошибка при отправке запроса");

  return res.json();
}
