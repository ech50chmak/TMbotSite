// pages/profile.tsx
import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { motion } from "framer-motion";

export default function Profile() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/me");
        if (!mounted) return;
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const { user } = await res.json();
        setEmail(user?.email ?? "");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [router]);

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
  };

  if (loading) return null;

  return (
    <>
      <Head>
        <title>Профиль — Tiles Markuper Bot</title>
      </Head>

      <main
        className="flex w-full h-screen bg-cover bg-center bg-no-repeat min-h-screen bg-[#0f1533] items-center justify-center relative overflow-hidden"
        style={{ backgroundImage: "url('/backgroundPhone2.png')" }}
      >
        <div className="absolute w-[150%] h-[150%] bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-lime-300 via-green-400 to-blue-300 opacity-30 animate-spin-slow rounded-full z-0" />

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 bg-[#1b2060]/80 rounded-[35px] w-full max-w-[550px] text-center shadow-2xl flex flex-col gap-6 p-6"
        >
        <div className="py-6 flex flex-col gap-[5] w-full h-full bg-[#1b2060]/0 rounded-[30px] items-center justify-center">
          <div className="w-[100%] h-[110px] rounded-[35px] bg-[#1b2060] flex items-center justify-center overflow-hidden">
              <div className="w-[60px] h-[60px] rounded-[35px] bg-[white] flex items-center justify-center overflow-hidden px-[12]">
                {/* До подключения Google OAuth показываем плейсхолдер */}
                <span className="text-[#1b2060] text-xl font-bold">?</span>
              </div>
              <h1 className="text-3xl font-bold text-[#A8FF60] px-[16]">{email}</h1>
          </div>

          <div className="h-[5]"></div>
          <hr className="border-[#A8FF60] border-t-2 w-2/3" />
          <div className="h-[5]"></div>
          <div className="flex flex-col gap-[20] w-2/3 items-center font-size-[200%]">
            <button
              onClick={() => router.push("/projects")}
              className="hover:brightness-105 h-[80px] text-center text-[24px] px-[10px] w-[150%] py-[6px] rounded-[35px] bg-[#1b2060] text-[#A8FF60] placeholder:text-[#0f1533] focus:outline-none border-0 outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus:ring-transparent"
            >
              Проекты
            </button>
            <button
              onClick={() => router.push("/send-layout")}
              className="hover:brightness-105 h-[80px] text-center text-[24px] px-[10px] w-[150%] py-[6px] rounded-[35px] bg-[#1b2060] text-[#A8FF60] placeholder:text-[#0f1533] focus:outline-none border-0 outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus:ring-transparent"
            >
              Отправка подрезки
            </button>
            <button
              onClick={() => router.push("/bind-robot")}
              className="hover:brightness-105 h-[80px] text-center text-[24px] px-[10px] w-[150%] py-[6px] rounded-[35px] bg-[#1b2060] text-[#A8FF60] placeholder:text-[#0f1533] focus:outline-none border-0 outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus:ring-transparent"
            >
              Привязка робота
            </button>
          </div>
          <div className="h-[200]"></div>
          <button
            onClick={handleLogout}
            className="hover:brightness-105 h-[70px] text-center text-[21px] px-[10px] w-[66%] py-[6px] rounded-[35px] bg-[#1b2060] text-[#A8FF60] placeholder:text-[#0f1533] focus:outline-none border-0 outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus:ring-transparent"
          >
            Покинуть аккаунт
          </button>
          </div>
        </motion.div>
      </main>
    </>
  );
}
