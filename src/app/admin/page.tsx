"use client";

import { Copy, MonitorPlay, Plus, Radio, Settings2, Trash2, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, useConfirm } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { AuctionStatusBadge, EmptyState, Spinner } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/shared/money";
import type { AuctionSettings, AuctionStatus } from "@/shared/types";

type Row = AuctionSettings & { teamCount: number; playerCount: number; soldCount: number };
const FILTERS: { key: "ALL" | AuctionStatus; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "DRAFT", label: "Setup" },
  { key: "LOCKED", label: "Ready" },
  { key: "LIVE", label: "Live" },
  { key: "COMPLETED", label: "Completed" },
];

export default function AuctionsPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("ALL");
  const [dialog, setDialog] = useState<{ mode: "new" } | { mode: "clone"; from: Row } | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get<{ auctions: Row[] }>("/auctions").then((r) => setRows(r.auctions)), []);
  useEffect(() => {
    load().catch((e) => toast.error(errorMessage(e)));
  }, [load]);

  const shown = useMemo(
    () => (rows ?? []).filter((r) => filter === "ALL" || r.status === filter || (filter === "LIVE" && r.status === "PAUSED")),
    [rows, filter],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dialog) return;
    setBusy(true);
    try {
      const r =
        dialog.mode === "new"
          ? await api.post<{ auction: AuctionSettings }>("/auctions", { name })
          : await api.post<{ auction: AuctionSettings }>(`/auctions/${dialog.from.id}/clone`, { name });
      toast.success(dialog.mode === "new" ? "Auction created" : "Auction duplicated with its teams and candidates");
      setDialog(null);
      router.push(`/admin/auctions/${r.auction.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: Row) => {
    if (
      !(await confirm({
        title: `Delete “${r.name}”?`,
        tone: "danger",
        confirmLabel: "Delete forever",
        body: "Teams, candidates, bids and results of this auction are permanently removed.",
      }))
    )
      return;
    try {
      await api.del(`/auctions/${r.id}`);
      toast.success("Auction deleted");
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-wide text-white uppercase">My auctions</h1>
          <p className="mt-1 text-sm text-ink-300">Create an auction, add teams and candidates, lock it, then run it live.</p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setName("TechSara Placement League");
            setDialog({ mode: "new" });
          }}
          data-testid="new-auction"
        >
          <Plus className="size-4" /> New auction
        </Button>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        {FILTERS.map((f) => {
          const n = (rows ?? []).filter((r) => f.key === "ALL" || r.status === f.key || (f.key === "LIVE" && r.status === "PAUSED")).length;
          return (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-bold tracking-wider uppercase ring-1 transition",
                filter === f.key ? "bg-gold-500/15 text-gold-300 ring-gold-500/50" : "text-ink-300 ring-ink-600 hover:text-white",
              )}
            >
              {f.label} <span className="ml-1 text-ink-400">{n}</span>
            </button>
          );
        })}
      </div>

      {!rows ? (
        <Spinner className="py-20" />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<Trophy className="size-10" />}
          title={rows.length ? "Nothing here" : "No auctions yet"}
          body={rows.length ? "No auction has this status." : "Create your first Placement League auction to get started."}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {shown.map((r) => (
            <article key={r.id} className="panel flex flex-col p-5" data-testid="auction-card">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/admin/auctions/${r.id}`} className="min-w-0">
                  <h2 className="truncate font-display text-xl font-semibold tracking-wide text-white uppercase hover:text-gold-300">{r.name}</h2>
                </Link>
                <AuctionStatusBadge status={r.status} />
              </div>
              <p className="mt-1 text-xs text-ink-400">Created {new Date(r.createdAt).toLocaleString()}</p>
              <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                {[
                  ["Teams", r.teamCount],
                  ["Candidates", r.playerCount],
                  ["Sold", r.soldCount],
                  ["Purse", formatMoney(r.purse, r.currencySymbol)],
                ].map(([l, v]) => (
                  <div key={String(l)} className="rounded-lg bg-ink-850 py-2 ring-1 ring-ink-600/60">
                    <dt className="text-[10px] font-bold tracking-widest text-ink-400 uppercase">{l}</dt>
                    <dd className="font-display text-lg font-semibold text-white">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/admin/auctions/${r.id}`}>
                  <Button size="sm">
                    <Settings2 className="size-4" /> Set up
                  </Button>
                </Link>
                <Link href={`/admin/auctions/${r.id}/live`}>
                  <Button size="sm" variant={r.status === "LIVE" || r.status === "PAUSED" ? "danger" : "secondary"}>
                    <Radio className="size-4" /> Control room
                  </Button>
                </Link>
                <a href={`/display/${r.slug}`} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="ghost">
                    <MonitorPlay className="size-4" /> Display
                  </Button>
                </a>
                <div className="ml-auto flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Duplicate"
                    title="Duplicate (copies settings, teams and candidates)"
                    onClick={() => {
                      setName(`${r.name} (Copy)`);
                      setDialog({ mode: "clone", from: r });
                    }}
                  >
                    <Copy className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Delete"
                    title={r.status === "LIVE" || r.status === "PAUSED" ? "End the auction before deleting" : "Delete"}
                    disabled={r.status === "LIVE" || r.status === "PAUSED"}
                    onClick={() => remove(r)}
                  >
                    <Trash2 className="size-4 text-loss-400" />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={!!dialog}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog?.mode === "clone" ? "Duplicate auction" : "New auction"}
        description={
          dialog?.mode === "clone"
            ? "Creates a new setup draft with the same settings, teams and candidates (no bids or results)."
            : "You can change every setting before locking."
        }
        size="sm"
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label="Auction name" htmlFor="auction-name">
            <Input id="auction-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()} data-testid="create-auction">
              {dialog?.mode === "clone" ? "Duplicate" : "Create"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
