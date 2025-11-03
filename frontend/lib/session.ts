// lib/session.ts
import type { IronSessionOptions } from "iron-session";

export const sessionOptions: IronSessionOptions = {
  cookieName: "tmbot_session",
  password: process.env.IRON_SESSION_PASSWORD as string,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
  },
};

declare module "iron-session" {
  interface IronSessionData {
    user?: { id: string; email: string };
  }
}
