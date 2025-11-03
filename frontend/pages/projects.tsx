// pages/projects.tsx
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { motion } from "framer-motion";

type Project = { id: number | string; name: string; createdAt: string };

export default function ProjectsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");



  const getErrorMessage = (caught: unknown, fallback: string) => {

    if (caught instanceof Error && caught.message) return caught.message;

    if (typeof caught === "string" && caught) return caught;

    return fallback;

  };



  useEffect(() => {
    let mounted = true;
    (async () => {
      setError("");
      try {
        const me = await fetch("/api/me");
        if (me.status === 401) {
          router.replace("/login");
          return;
        }
        const res = await fetch("/api/projects");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || "Не удалось загрузить проекты");
        }
        const data = await res.json();
        if (mounted) setProjects(data.projects ?? []);
      } catch (error) {

        if (mounted) {

          const message = getErrorMessage(error, "Ошибка загрузки");

          setError(message);

        }

      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  const hasProjects = useMemo(() => projects.length > 0, [projects]);

  const createProject = async () => {
    const name = prompt("Введите название проекта");
    if (!name) return;
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Не удалось создать проект");
      }
      const { project } = await res.json();
      setProjects((prev) => [project, ...prev]);
    } catch (error) {

      alert(getErrorMessage(error, "Ошибка создания проекта"));

    }
  };

  const deleteProject = async (id: string | number) => {
    if (!confirm("Удалить проект?")) return;
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Ошибка удаления");
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (error) {

      alert(getErrorMessage(error, "Ошибка удаления"));

    }
  };

  if (loading) return null;

  return (
    <>
      <Head>
        <title>Проекты — Tiles Markuper Bot</title>
      </Head>

      <main
        className="flex w-full h-screen bg-cover bg-center bg-no-repeat min-h-screen bg-[#0f1533] items-center justify-center relative overflow-hidden"
        style={{ backgroundImage: "url('/background1.png')" }}
      >
        <div className="absolute w-[150%] h-[150%] bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-lime-300 via-green-400 to-blue-300 opacity-30 animate-spin-slow rounded-[28] z-0" />

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 bg-[#1b2060]/80 rounded-[35px] w-full max-w-[550px] max-h-[600px] text-center shadow-2xl flex flex-col gap-6 p-6"
        >
          {/* Заголовок */}
          <div className="flex flex-col gap-[15px] w-full h-[100px] bg-[#1b2060] rounded-[28] items-center justify-center">
            <h1 className="text-3xl md:text-4xl font-bold text-[#A8FF60] justify-center">
              Проекты
            </h1>
          </div>
          <div className="h-[15]"></div>
          {/* Список проектов */}
          <div className="flex-1 overflow-y-auto rounded-[28px] bg-[#1b2060]/60 p-4 h-max-[600px]">
            {error && (
              <p className="text-red-400 pb-3">{error}</p>
            )}
            {!hasProjects ? (
              <p className="text-[#A8FF60] py-[12]">
                Пока нет проектов — создайте первый.
              </p>
            ) : (
              <ul className="space-y-3">
                {projects.map((p) => (
                  <li key={p.id}>
                    <div className="flex items-center justify-between bg-[#252b63] text-[#A8FF60] px-6 h-[48px] rounded-[28]">
                      {/* Кнопка для открытия проекта */}
                      <button
                        onClick={() => router.push(`/projects/${p.id}`)}
                        className="bg-[#252b63] text-[#A8FF60] flex-1 text-left hover:underline text-lg border-0 outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus:ring-transparent"
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="px-[16] opacity-80 text-[15px]">{p.name}</span>
                          <span className="opacity-80 text-[15px] px-[8]">
                            {new Date(p.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </button>

                      {/* Кнопка удаления */}
                      <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 1 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteProject(p.id);
                        }}
                        className="bg-[#1b2060]/100 py-[15px] px-[16] ml-4 text-red-400 hover:text-red-600 text-xl rounded-[28px] border-0 outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus:ring-transparent"
                        title="Удалить проект"
                      >
                        🗑️
                      </button>
                      </motion.div>
                    </div>
                    <div className="h-[12]"></div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="h-[15]"></div>
          {/* Нижние кнопки */}
          <div className="flex justify-center gap-[90px] ">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <button
                onClick={() => router.push("/profile")}
                className="bg-[#D5EA44] text-[#1A1A1A] text-[16px] font-medium px-[30px] py-[10px] rounded-full shadow-md transition border-0 outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus:ring-transparent"
              >
                Назад в профиль
              </button>
            </motion.div>

            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <button
                onClick={createProject}
                className="bg-[#D5EA44] text-[#1A1A1A] text-[16px] font-medium px-[30px] py-[10px] rounded-full shadow-md transition border-0 outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus:ring-transparent"
              >
                Создать проект
              </button>
            </motion.div>
          </div>
        </motion.div>
      </main>
    </>
  );
}
