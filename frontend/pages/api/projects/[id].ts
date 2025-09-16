// pages/api/projects/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getIronSession(req, res, sessionOptions);
  if (!session.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { id } = req.query;

  if (req.method === "GET") {
    const project = await prisma.project.findUnique({
      where: { id: String(id) },
    });
    return res.json({ project });
  }

  if (req.method === "PUT") {
    const { svg, params } = req.body;
    const project = await prisma.project.update({
      where: { id: String(id) },
      data: { svg, params },
    });
    return res.json({ project });
  }

  if (req.method === "DELETE") {
    await prisma.project.delete({
      where: { id: String(id) },
    });
    return res.json({ message: "Проект удалён" });
  }

  return res.status(405).end();
}
