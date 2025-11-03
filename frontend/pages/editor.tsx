// frontend/pages/editor.tsx
import React, { useState } from "react";
import SvgPreview from "@/components/SvgPreview";

type Point = [number, number];
type Polygon = Point[];

export default function EditorPage() {
  const [data, setData] = useState<Polygon[]>([]); // можно хранить и здесь, если решишь

  return <SvgPreview data={data} onDataChange={setData} projectName="Черновик 1" />;
}
