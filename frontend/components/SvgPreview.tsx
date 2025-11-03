// frontend/components/SvgPreview.tsx
import React, { useEffect, useState } from "react";
import SvgPreviewDesktop from "./SvgPreviewDesktop";
import SvgPreviewMobile from "./SvgPreviewMobile";

export default function SvgPreview() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile ? <SvgPreviewMobile /> : <SvgPreviewDesktop />;
}
