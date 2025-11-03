// pages/api/login.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export default async function login(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ message: "Метод не разрешён" });

  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
  if (!email || !password) return res.status(400).json({ message: "Email и пароль обязательны" });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ message: "Неверный email или пароль" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ message: "Неверный email или пароль" });

  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  session.user = { id: user.id, email: user.email };
  await session.save();

  return res.status(200).json({ message: "ok" });
}
