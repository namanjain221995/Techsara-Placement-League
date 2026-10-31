"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useLiveAuction, type ConnState } from "@/lib/live";
import type { AuctionSettings, LiveSnapshot } from "@/shared/types";

export interface AuctionDetail {
  auction: AuctionSettings;
  counts: { teams: number; players: number; pool: number; sold: number; unsold: number; disqualified: number };
  issues: { blocking: string[]; warnings: string[] };
}

interface Ctx {
  id: string;
  snapshot: LiveSnapshot | null;
  detail: AuctionDetail | null;
  conn: ConnState;
  clockOffset: number;
  /** Bumps whenever the server publishes a new version — use as a refetch key. */
  version: number;
  accept: (s: LiveSnapshot) => void;
  refreshDetail: () => Promise<void>;
}

const AuctionCtx = createContext<Ctx | null>(null);

export function AuctionProvider({ id, children }: { id: string; children: React.ReactNode }) {
  const { snapshot, conn, clockOffset, accept, error } = useLiveAuction({ auctionId: id });
  const [detail, setDetail] = useState<AuctionDetail | null>(null);
  const version = snapshot?.version ?? 0;

  const refreshDetail = useCallback(async () => {
    setDetail(await api.get<AuctionDetail>(`/auctions/${id}`));
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    api.get<AuctionDetail>(`/auctions/${id}`).then(
      (d) => !cancelled && setDetail(d),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [id, version]);

  if (error === "NOT_FOUND") {
    return <div className="panel p-10 text-center text-ink-200">This auction does not exist (it may have been deleted).</div>;
  }

  return <AuctionCtx.Provider value={{ id, snapshot, detail, conn, clockOffset, version, accept, refreshDetail }}>{children}</AuctionCtx.Provider>;
}

export function useAuction() {
  const c = useContext(AuctionCtx);
  if (!c) throw new Error("useAuction outside AuctionProvider");
  return c;
}
