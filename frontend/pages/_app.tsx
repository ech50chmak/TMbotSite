// pages/_app.tsx
import type { AppProps } from "next/app";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import "@/styles/globals.css";

const PUBLIC_ROUTES = ["/", "/login", "/register"];

export default function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const isPublic = PUBLIC_ROUTES.includes(router.pathname);
      if (isPublic) {
        if (mounted) setReady(true);
        return;
      }

      try {
        const res = await fetch("/api/me");
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
      } finally {
        if (mounted) setReady(true);
      }
    })();

    return () => { mounted = false; };
  }, [router.pathname, router]);

  if (!ready) return null;
  return <Component {...pageProps} />;
}
