// pages/api/register.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export default async function register(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ message: "Метод не разрешён" });

  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
  if (!email || !password) return res.status(400).json({ message: "Email и пароль обязательны" });
  if (password.length < 6) return res.status(400).json({ message: "Пароль минимум 6 символов" });

  try {
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hash },
      select: { id: true, email: true },
    });

    // сразу логиним
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    session.user = { id: user.id, email: user.email };
    await session.save();

    return res.status(200).json({ message: "ok" });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return res.status(409).json({ message: "Такой email уже зарегистрирован" });
    }
    console.error("Register error:", error);
    return res.status(500).json({ message: "Внутренняя ошибка" });
  }
}

