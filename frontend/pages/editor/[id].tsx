// pages/editor/[id].tsx
import { useRouter } from "next/router";
import Head from "next/head";
import { useEffect, useState } from "react";
import SvgPreview from "@/components/SvgPreview";

type Project = {
  id: string;
  name: string;
  svg: string | null;
  createdAt: string;
};

export default function EditorPage() {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;

    let mounted = true;
    (async () => {
      try {
        // проверяем авторизацию
        const me = await fetch("/api/me");
        if (me.status === 401) {
          router.replace("/login");
          return;
        }

        // грузим проект
        const res = await fetch(`/api/projects/${id}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || "Не удалось загрузить проект");
        }
        const data = await res.json();
        if (mounted) setProject(data.project);
      } catch (error) {
        if (mounted) {
          const message = error instanceof Error ? error.message : "Ошибка загрузки";
          setError(message || "Ошибка загрузки");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id, router]);

  if (loading) return <p className="text-center text-[#A8FF60]">Загрузка...</p>;
  if (error) return <p className="text-center text-red-500">{error}</p>;
  if (!project) return <p className="text-center text-[#A8FF60]">Проект не найден</p>;

  // Заглушка: парсим SVG данные (если есть)
  let polygons: [number, number][][] = [];
  if (project.svg) {
    try {
      polygons = JSON.parse(project.svg);
    } catch {
      console.warn("Некорректные SVG-данные в проекте");
    }
  }

  return (
    <>
      <Head>
        <title>{project.name} — Tiles Markuper Bot</title>
      </Head>
      <SvgPreview data={polygons} projectName={project.name} />
    </>
  );
}

