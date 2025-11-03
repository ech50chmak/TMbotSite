// pages/api/me.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

export default async function me(req: NextApiRequest, res: NextApiResponse) {
  const session = await getIronSession(req, res, sessionOptions);
  if (!session.user) return res.status(401).json({ message: "Не авторизован" });
  return res.status(200).json({ user: session.user });
}
