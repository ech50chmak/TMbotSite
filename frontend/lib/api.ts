// frontend/lib/api.ts
import { processDxfOnClient, CuttingParams } from "./dxf-processing";

type ProcessResult = { status: "ok"; data: number[][][] };

export async function sendDxfAndParams(file: File, params: CuttingParams): Promise<ProcessResult> {
  const data = await processDxfOnClient(file, params);
  return { status: "ok", data };
}
