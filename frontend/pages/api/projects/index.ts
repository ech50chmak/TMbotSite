// pages/api/projects/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getIronSession(req, res, sessionOptions);
  const user = session.user;

  if (!user) {
    return res.status(401).json({ message: "Не авторизован" });
  }

  try {
    if (req.method === "GET") {
      // Получаем все проекты пользователя
      const projects = await prisma.project.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      });
      return res.json({ projects });
    }

    if (req.method === "POST") {
      const { name } = req.body;

      if (!name) {
        return res.status(400).json({ message: "Название проекта обязательно" });
      }

      // Создаём проект без svg (добавим позже отдельным эндпоинтом)
      const project = await prisma.project.create({
        data: {
          name,
          userId: user.id,
        },
      });

      return res.status(201).json({ project });
    }

    return res.status(405).json({ message: "Метод не поддерживается" });
  } catch (error) {
    console.error("Ошибка в /api/projects:", error);
    return res.status(500).json({ message: "Ошибка сервера" });
  }
}

