// frontend/pages/projects/[id].tsx
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Head from "next/head";
import SvgPreview from "@/components/SvgPreview";

type Point = [number, number];
type Polygon = Point[];

type Project = {
  id: string;
  name: string;
  createdAt: string;
  svg?: string | null;
  params?: any;
};

export default function ProjectPage() {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    if (!id) return;
    let mounted = true;

    (async () => {
      try {
        const res = await fetch(`/api/projects/${id}`);
        if (!res.ok) {
          throw new Error("Не удалось загрузить проект");
        }
        const data = await res.json();
        if (mounted) {
          setProject(data.project);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading) return <p className="text-center text-[#A8FF60] mt-20">Загрузка...</p>;
  if (!project) return <p className="text-center text-red-500 mt-20">Проект не найден</p>;

  let polygons: Polygon[] = [];
  try {
    polygons = project.svg ? JSON.parse(project.svg) : [];
  } catch (e) {
    console.warn("Ошибка парсинга svg:", e);
  }

  return (
    <>
      <Head>
        <title>{project.name} — Tiles Markuper Bot</title>
      </Head>

      <SvgPreview
        data={polygons}
        initialParams={project.params || {}}
        projectName={project.name}
      />
    </>
  );
}
