import { processDxfOnClient, CuttingParams } from "@/lib/dxf-processing";

export async function uploadAndGenerateGrid(file: File, params: CuttingParams): Promise<number[][][]> {
  return processDxfOnClient(file, params);
}
