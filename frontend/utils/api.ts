export async function uploadAndGenerateGrid(file: File, params: {
  tile_w: number;
  tile_h: number;
  seam: number;
  start_x: number;
  start_y: number;
  angle_deg: number;
}): Promise<number[][][]> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("tile_w", params.tile_w.toString());
  formData.append("tile_h", params.tile_h.toString());
  formData.append("seam", params.seam.toString());
  formData.append("start_x", params.start_x.toString());
  formData.append("start_y", params.start_y.toString());
  formData.append("angle_deg", params.angle_deg.toString());

  const res = await fetch("http://localhost:8000/process-dxf/", {
    method: "POST",
    body: formData
  });

  const json = await res.json();
  if (json.status === "error") throw new Error(json.message);
  return json.data;
}
