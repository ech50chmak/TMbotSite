// pages/register.tsx
import Head from "next/head";
import Link from "next/link";
import { motion } from "framer-motion";
import { useState } from "react";
import { useRouter } from "next/router";

export default function Register() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email || !password || !confirm) {
      setError("Пожалуйста, заполните все поля.");
      return;
    }
    if (password !== confirm) {
      setError("Пароли не совпадают.");
      return;
    }
    if (password.length < 6) {
      setError("Минимальная длина пароля — 6 символов.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.message || "Ошибка регистрации");
        setLoading(false);
        return;
      }

      setSuccess("Регистрация успешна! Открываю профиль…");
      setTimeout(() => router.push("/profile"), 600);
    } catch (error) {
      console.error("Register error:", error);
      setError("Произошла ошибка сервера. Попробуйте позже.");
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Регистрация — Tiles Markuper Bot</title>
      </Head>

      <main
        className="flex w-full h-screen bg-cover bg-center bg-no-repeat min-h-screen bg-[#0f1533] items-center justify-center relative overflow-hidden"
        style={{ backgroundImage: "url('/backgroundPhone1.png')" }}
      >
        <div className="absolute w-[150%] h-[150%] bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-lime-300 via-green-400 to-blue-300 opacity-30 animate-spin-slow rounded-full z-0"></div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 bg-[#1b2060]/80 rounded-[30px] w-full max-w-[550px] text-center shadow-2xl flex flex-col gap-6 p-6"
        >
          <div className="py-6 flex flex-col gap-[5] w-full h-full bg-[#1b2060] rounded-[30px] items-center justify-center">
          <div className="h-[5]"></div>
            <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold text-[#A8FF60]">
              Tiles Markuper Bot
            </h1>
            <hr className="border-[#A8FF60] border-t-2 w-2/3 mx-auto" />
          <div className="h-[10]"></div>
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-[20px] text-center items-center justify-center"
          >
            <input
              type="email"
              placeholder="Email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="text-center block w-[105%] sm:w-auto bg-[#D5EA44] text-[#1A1A1A] text-[18px] sm:text-[18px] font-medium px-[6] sm:px-[10] py-[2%] sm:py-[4] rounded-full shadow-md transition"
            />
            <input
              type="password"
              placeholder="Пароль"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="text-center block w-[105%] sm:w-auto bg-[#D5EA44] text-[#1A1A1A] text-[18px] sm:text-[18px] font-medium px-[6] sm:px-[10] py-[2%] sm:py-[4] rounded-full shadow-md transition"
            />
            <input
              type="password"
              placeholder="Повторите пароль"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="text-center block w-[105%] sm:w-auto bg-[#D5EA44] text-[#1A1A1A] text-[18px] sm:text-[18px] font-medium px-[6] sm:px-[10] py-[2%] sm:py-[4] rounded-full shadow-md transition"
            />
            </form>
            <div className="h-[]"></div>
          </div>

            <div className="h-[40]"></div>
            <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-[35px] text-center items-center justify-center"
          >
            <button
              type="submit"
              disabled={loading}
              className="block sm:w-auto bg-[#D5EA44] text-[#1A1A1A] text-[20px] sm:text-2xl font-medium px-[12] sm:px-[10] py-[1%] sm:py-[4] rounded-full shadow-md transition border-0 outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus:ring-transparent"
            >
              {loading ? "Создаю аккаунт…" : "Зарегистрироваться"}
            </button>
            </form>
            <div className="h-[10]"></div>
          {error && <p className="text-red-300 text-sm">{error}</p>}
          {success && <p className="text-[#66CDAA] text-sm">{success}</p>}

          <p className="text-[#A8FF60] text-[18px] mt-2 h-[28]">
            Уже есть аккаунт?{" "}
            <Link href="/login" className="underline hover:text-lime-300">
              Войти
            </Link>
          </p>
        </motion.div>
      </main>
    </>
  );
}

