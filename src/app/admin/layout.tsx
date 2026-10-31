"use client";

import { LogOut, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { ConfirmProvider } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";

interface Me {
  admin: { id: string; username: string; displayName: string };
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me["admin"] | null>(null);

  useEffect(() => {
    api
      .get<Me>("/auth/me")
      .then((r) => setMe(r.admin))
      .catch(() => router.replace(`/login?next=${encodeURIComponent(pathname)}`));
  }, [router, pathname]);

  if (!me) return <Spinner className="min-h-dvh" label="Checking your session…" />;

  const logout = async () => {
    await api.post("/auth/logout").catch(() => undefined);
    router.replace("/login");
  };

  return (
    <ConfirmProvider>
      <div className="stage-bg min-h-dvh">
        <header className="sticky top-0 z-40 border-b border-ink-600/50 bg-ink-900/80 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-6 px-4 sm:px-6">
            <Link href="/admin" aria-label="All auctions">
              <Wordmark />
            </Link>
            <nav className="hidden items-center gap-1 sm:flex">
              <Link
                href="/admin"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-ink-200 hover:bg-ink-700/60 hover:text-white"
              >
                <Trophy className="size-4" /> Auctions
              </Link>
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden text-sm text-ink-300 sm:inline">
                Signed in as <b className="text-ink-100">{me.username}</b>
              </span>
              <Button variant="ghost" size="sm" onClick={logout} aria-label="Sign out">
                <LogOut className="size-4" /> <span className="hidden sm:inline">Sign out</span>
              </Button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">{children}</main>
      </div>
    </ConfirmProvider>
  );
}
