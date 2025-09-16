// pages/index.tsx
import Link from "next/link";
import Head from "next/head";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <>
      <Head>
        <title>Tiles Markuper Bot</title>
      </Head>
      <main
        className="min-h-screen bg-[#0f1533] flex items-center justify-center relative overflow-hidden px-4"
        style={{
          backgroundImage: "url('/backgroundPhone1.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute w-[150%] h-[150%] bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-lime-300 via-green-400 to-blue-300 opacity-30 animate-spin-slow rounded-full z-0" />

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 bg-[#1b2060]/80 rounded-[30px] w-full max-w-[550px] text-center shadow-2xl flex flex-col gap-6 p-6"
        >
          <div className="py-6 flex flex-col gap-[10] w-full h-full bg-[#1b2060] rounded-[30px] items-center justify-center">
          <div className="h-[5]"></div>
            <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold text-[#A8FF60]">
              Tiles Markuper Bot
            </h1>
            <hr className="border-[#A8FF60] border-t-2 w-2/3 mx-auto" />
            <p className="text-[#A8FF60] text-lg sm:text-2xl">
              Мы рады видеть вас на нашем сайте! <br />
              Перейдите в свой профиль для продолжения работы
            </p>
            <div className="h-[5]"></div>
          </div>
          <div className="h-[50]"></div>
          <div className="flex justify-center gap-[30%]">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                href="/login"
                className="block w-[215%] sm:w-auto bg-[#D5EA44] text-[#1A1A1A] text-lg sm:text-2xl font-medium px-[6] sm:px-[10] py-[10%] sm:py-[4] rounded-full shadow-md transition"
              >
                Вход
              </Link>
            </motion.div>

            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                href="/register"
                className="block w-[105%] sm:w-auto bg-[#D5EA44] text-[#1A1A1A] text-lg sm:text-2xl font-medium px-[6] sm:px-[10] py-[5%] sm:py-[4] rounded-full shadow-md transition"
              >
                Регистрация
              </Link>
            </motion.div>
          </div>
          <div className="h-[5]"></div>
        </motion.div>
      </main>
    </>
  );
}
