// lib/session.ts
import type { SessionOptions } from "iron-session";

export const sessionOptions: SessionOptions = {
  cookieName: "tmbot_session",
  password: process.env.IRON_SESSION_PASSWORD as string,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
  },
};

export type SessionData = { user?: { id: string; email: string } };
