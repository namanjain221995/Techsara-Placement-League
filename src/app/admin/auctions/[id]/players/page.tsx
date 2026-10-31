"use client";

import { Download, FileSpreadsheet, ImagePlus, LayoutGrid, List, MoreHorizontal, Pencil, Plus, Search, Trash2, Upload, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuction } from "@/components/admin/auction-context";
import { Description } from "@/components/description";
import { PlayerPhoto } from "@/components/media";
import { Button } from "@/components/ui/button";
import { Dialog, useConfirm } from "@/components/ui/dialog";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { Badge, EmptyState, PlayerStatusBadge, Spinner } from "@/components/ui/misc";
import { api, ApiError, errorMessage, fieldErrors } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatMoney, parseMillions, toMillionsString } from "@/shared/money";
import type { PlayerStatus, PlayerView } from "@/shared/types";

type Filter = "ALL" | PlayerStatus;
interface Draft {
  id?: string;
  name: string;
  role: string;
  description: string;
  basePrice: string;
  photoUrl: string;
  currentPhoto: string | null;
}

export default function PlayersPage() {
  const { id, snapshot, version } = useAuction();
  const confirm = useConfirm();
  const [players, setPlayers] = useState<PlayerView[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [view, setView] = useState<"list" | "cards">("list");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [fixing, setFixing] = useState<PlayerView | null>(null);

  const load = useCallback(() => api.get<{ players: PlayerView[] }>(`/auctions/${id}/players`).then((r) => setPlayers(r.players)), [id]);
  useEffect(() => {
    load().catch((e) => toast.error(errorMessage(e)));
  }, [load, version]);

  const shown = useMemo(
    () =>
      (players ?? []).filter(
        (p) =>
          (filter === "ALL" || p.status === filter) &&
          (!q.trim() ||
            p.name.toLowerCase().includes(q.toLowerCase()) ||
            String(p.number) === q.trim() ||
            p.description.toLowerCase().includes(q.toLowerCase())),
      ),
    [players, q, filter],
  );

  if (!snapshot) return <Spinner className="py-20" />;
  const a = snapshot.auction;
  const isDraft = a.status === "DRAFT";
  const canFix = a.status === "LOCKED" || a.status === "LIVE" || a.status === "PAUSED";
  const money = (k: number | null) => formatMoney(k, a.currencySymbol);
  const teamName = (tid: string | null) => snapshot.teams.find((t) => t.id === tid)?.name ?? "";
  const counts = (s: Filter) => (players ?? []).filter((p) => s === "ALL" || p.status === s).length;

  const openNew = () => {
    setDraft({ name: "", role: a.roles[0] ?? "All-Rounder", description: "", basePrice: "", photoUrl: "", currentPhoto: null });
    setPhotoFile(null);
    setErrors({});
  };
  const openEdit = (p: PlayerView) => {
    const uploaded = p.photoUrl?.startsWith("/api/uploads/") ? p.photoUrl : null;
    setDraft({
      id: p.id,
      name: p.name,
      role: p.role,
      description: p.description,
      basePrice: p.basePrice ? toMillionsString(p.basePrice) : "",
      photoUrl: uploaded ? "" : (p.photoUrl ?? ""),
      currentPhoto: p.photoUrl,
    });
    setPhotoFile(null);
    setErrors({});
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const base = draft.basePrice.trim() ? parseMillions(draft.basePrice) : null;
    if (draft.basePrice.trim() && base === null) return setErrors({ basePrice: "Enter millions, e.g. 1.5" });
    setBusy(true);
    try {
      const body = {
        name: draft.name,
        role: draft.role,
        description: draft.description,
        ...(draft.photoUrl.trim()
          ? { photoUrl: draft.photoUrl.trim() }
          : draft.id && !draft.currentPhoto?.startsWith("/api/uploads/")
            ? { photoUrl: null }
            : {}),
        ...(isDraft ? { basePrice: base } : {}),
      };
      const res = draft.id
        ? await api.put<{ player: PlayerView }>(`/players/${draft.id}`, body)
        : await api.post<{ player: PlayerView }>(`/auctions/${id}/players`, body);
      if (photoFile) await api.upload(`/players/${res.player.id}/photo`, photoFile);
      toast.success(draft.id ? "Candidate updated" : "Candidate added");
      setDraft(null);
      load();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: PlayerView) => {
    if (!(await confirm({ title: `Delete ${p.name}?`, tone: "danger", confirmLabel: "Delete" }))) return;
    api.del(`/players/${p.id}`).then(
      () => (toast.success("Candidate deleted"), load()),
      (e) => toast.error(errorMessage(e)),
    );
  };
  const removePhoto = async () => {
    if (!draft?.id) return;
    await api.del(`/players/${draft.id}/photo`).then(
      () => setDraft({ ...draft, currentPhoto: null, photoUrl: "" }),
      (e) => toast.error(errorMessage(e)),
    );
  };

  const previewPhoto = photoFile ? URL.createObjectURL(photoFile) : draft?.photoUrl.trim() || draft?.currentPhoto || null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-wide text-white uppercase">Candidates</h1>
          <p className="text-sm text-ink-300">The people teams bid on. Descriptions keep your points, bullets and line breaks exactly as typed.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/api/players-template.xlsx">
            <Button variant="ghost" size="sm">
              <Download className="size-4" /> Template
            </Button>
          </a>
          <Button size="sm" onClick={() => setImportOpen(true)} disabled={!isDraft}>
            <Upload className="size-4" /> Import
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={openNew}
            disabled={!isDraft}
            title={isDraft ? undefined : "Unlock the configuration to add candidates"}
            data-testid="add-player"
          >
            <Plus className="size-4" /> Add candidate
          </Button>
        </div>
      </div>

      <div className="panel flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
          <Input className="pl-9" placeholder="Search name, number or description…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1" role="tablist">
          {(["ALL", "POOL", "SOLD", "UNSOLD", "DISQUALIFIED"] as Filter[]).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-bold tracking-wide uppercase",
                filter === f ? "bg-gold-500/15 text-gold-300 ring-1 ring-gold-500/40" : "text-ink-300 hover:text-white",
              )}
            >
              {f === "ALL" ? "All" : f === "POOL" ? "In pool" : f.toLowerCase()} {counts(f)}
            </button>
          ))}
        </div>
        <div className="ml-auto flex rounded-lg ring-1 ring-ink-600">
          <button aria-label="List view" onClick={() => setView("list")} className={cn("p-2", view === "list" ? "bg-ink-700 text-white" : "text-ink-400")}>
            <List className="size-4" />
          </button>
          <button aria-label="Card view" onClick={() => setView("cards")} className={cn("p-2", view === "cards" ? "bg-ink-700 text-white" : "text-ink-400")}>
            <LayoutGrid className="size-4" />
          </button>
        </div>
      </div>

      {!players ? (
        <Spinner className="py-16" />
      ) : players.length === 0 ? (
        <EmptyState
          icon={<Users className="size-10" />}
          title="No candidates yet"
          body="Add candidates one by one or import them from the Excel template."
          action={
            isDraft ? (
              <Button variant="primary" onClick={openNew}>
                Add the first candidate
              </Button>
            ) : undefined
          }
        />
      ) : view === "list" ? (
        <div className="panel divide-y divide-ink-600/50 overflow-hidden" data-testid="player-list">
          {shown.map((p) => (
            <div key={p.id} className="flex gap-4 p-4">
              <PlayerPhoto name={p.name} url={p.photoUrl} className="size-16 shrink-0" rounded="rounded-xl" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-lg font-semibold text-white">
                    #{p.number} {p.name}
                  </span>
                  <Badge tone="blue">{p.role}</Badge>
                  <PlayerStatusBadge status={p.status} />
                  {p.status === "SOLD" && (
                    <span className="text-sm text-win-400">
                      {money(p.soldPrice)} → {teamName(p.soldToTeamId)}
                    </span>
                  )}
                  {p.basePrice && <Badge>Base {money(p.basePrice)}</Badge>}
                </div>
                <Description text={p.description} className="mt-1.5 text-sm text-ink-200" />
              </div>
              <div className="flex shrink-0 items-start gap-1">
                <Button size="icon" variant="ghost" aria-label={`Edit ${p.name}`} onClick={() => openEdit(p)}>
                  <Pencil className="size-4" />
                </Button>
                {canFix && (
                  <Button size="icon" variant="ghost" aria-label={`Corrections for ${p.name}`} onClick={() => setFixing(p)}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                )}
                {isDraft && (
                  <Button size="icon" variant="ghost" aria-label={`Delete ${p.name}`} onClick={() => remove(p)}>
                    <Trash2 className="size-4 text-loss-400" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {shown.length === 0 && <p className="p-8 text-center text-sm text-ink-400">No candidates match.</p>}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" data-testid="player-cards">
          {shown.map((p) => (
            <article key={p.id} className="panel flex flex-col overflow-hidden">
              <div className="relative">
                <PlayerPhoto name={p.name} url={p.photoUrl} className="aspect-[4/3] w-full" rounded="rounded-none" />
                <span className="absolute top-2 left-2 rounded-md bg-ink-950/80 px-2 py-0.5 font-display text-sm text-white">#{p.number}</span>
                <span className="absolute top-2 right-2">
                  <PlayerStatusBadge status={p.status} />
                </span>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate font-display text-lg font-semibold text-white uppercase">{p.name}</h3>
                  <Badge tone="blue">{p.role}</Badge>
                </div>
                <Description text={p.description} className="mt-2 flex-1 text-sm text-ink-200" />
                <div className="mt-3 flex gap-1">
                  <Button size="sm" onClick={() => openEdit(p)}>
                    <Pencil className="size-4" /> Edit
                  </Button>
                  {canFix && (
                    <Button size="sm" variant="ghost" onClick={() => setFixing(p)}>
                      Corrections
                    </Button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------ edit dialog */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)} title={draft?.id ? "Edit candidate" : "Add candidate"} size="lg">
        {draft && (
          <form onSubmit={save} className="grid gap-5 md:grid-cols-[200px_1fr]">
            <div className="space-y-2">
              <PlayerPhoto name={draft.name || "New candidate"} url={previewPhoto} className="aspect-[3/4] w-full" />
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-ink-700 px-3 py-2 text-sm font-semibold text-ink-100 ring-1 ring-ink-500 hover:bg-ink-600">
                <ImagePlus className="size-4" /> Upload photo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                  data-testid="photo-input"
                />
              </label>
              {draft.currentPhoto?.startsWith("/api/uploads/") && !photoFile && (
                <Button size="sm" variant="ghost" className="w-full" onClick={removePhoto}>
                  Remove photo
                </Button>
              )}
              <p className="text-[11px] text-ink-400">PNG, JPG, WEBP or GIF · max 3 MB. Without a photo a portrait with initials is shown.</p>
            </div>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                <Field label="Name" error={errors.name}>
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={80} required autoFocus />
                </Field>
                <Field label="Role" error={errors.role}>
                  <Select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
                    {[...new Set([...a.roles, draft.role])].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field
                label="Description"
                error={errors.description}
                hint="Write it point-wise: numbers, bullets (•, -) and new lines appear on the screen exactly like this."
              >
                <Textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  minRows={6}
                  maxLength={4000}
                  placeholder={"• Experience: 5 years\n• Niche: AI/ML — NLP, computer vision\n• Current interview: final round"}
                  data-testid="description-input"
                />
              </Field>
              <div className="rounded-xl bg-ink-950/70 p-3 ring-1 ring-ink-600">
                <div className="mb-1 text-[11px] font-bold tracking-widest text-gold-400 uppercase">Preview (as on the live screen)</div>
                <Description text={draft.description} className="text-sm text-ink-100" empty="Nothing to preview yet." />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Base price (optional)"
                  error={errors.basePrice}
                  hint={isDraft ? `Empty = auction base ${money(a.basePrice)}` : "Locked after the configuration is locked."}
                >
                  <MoneyInput
                    symbol={a.currencySymbol}
                    value={draft.basePrice}
                    onChange={(e) => setDraft({ ...draft, basePrice: e.target.value })}
                    placeholder={toMillionsString(a.basePrice)}
                    disabled={!isDraft}
                  />
                </Field>
                <Field label="Photo URL (optional)" error={errors.photoUrl} hint="Instead of uploading, link an https image.">
                  <Input value={draft.photoUrl} onChange={(e) => setDraft({ ...draft, photoUrl: e.target.value })} placeholder="https://…" />
                </Field>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={busy} data-testid="save-player">
                  {draft.id ? "Save changes" : "Add candidate"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </Dialog>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} auctionId={id} onDone={load} />
      {fixing && <CorrectionsDialog player={fixing} onClose={() => setFixing(null)} onDone={load} />}
    </div>
  );
}

function ImportDialog({ open, onOpenChange, auctionId, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; auctionId: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<{ row: number; message: string }[]>([]);
  const run = async () => {
    if (!file) return;
    setBusy(true);
    setProblems([]);
    try {
      const r = await api.upload<{ imported: number }>(`/auctions/${auctionId}/players/import`, file);
      toast.success(`${r.imported} candidate(s) imported`);
      onOpenChange(false);
      setFile(null);
      onDone();
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.details)) setProblems(e.details as { row: number; message: string }[]);
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import candidates"
      description="Upload the Excel template (or a CSV with the same columns). Nothing is imported unless every row is valid."
      footer={
        <>
          <a href="/api/players-template.xlsx" className="mr-auto">
            <Button variant="ghost" size="sm">
              <Download className="size-4" /> Download template
            </Button>
          </a>
          <Button variant="primary" onClick={run} loading={busy} disabled={!file}>
            <FileSpreadsheet className="size-4" /> Import
          </Button>
        </>
      }
    >
      <input
        type="file"
        accept=".xlsx,.csv"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm text-ink-200 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-700 file:px-3 file:py-2 file:font-semibold file:text-ink-100"
      />
      <p className="mt-3 text-xs text-ink-400">
        Columns: Number (optional), Name, Role, Description (line breaks kept), Base Price (M, optional), Photo URL (optional).
      </p>
      {problems.length > 0 && (
        <ul className="mt-4 max-h-56 space-y-1 overflow-y-auto rounded-lg bg-loss-500/10 p-3 text-xs text-loss-400 ring-1 ring-loss-500/30">
          {problems.map((p, i) => (
            <li key={i}>
              {p.row ? `Row ${p.row}: ` : ""}
              {p.message}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/** Manual corrections (organizer override) — every action is audit-logged and re-validated by the server. */
function CorrectionsDialog({ player, onClose, onDone }: { player: PlayerView; onClose: () => void; onDone: () => void }) {
  const { snapshot } = useAuction();
  const [teamId, setTeamId] = useState(snapshot!.teams[0]?.id ?? "");
  const [amount, setAmount] = useState(toMillionsString(player.basePrice ?? snapshot!.auction.basePrice));
  const [busy, setBusy] = useState<string | null>(null);
  const sym = snapshot!.auction.currencySymbol;
  const team = snapshot!.teams.find((t) => t.id === teamId);
  const send = async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    try {
      await api.post(`/players/${player.id}/override`, body);
      toast.success("Correction applied");
      onDone();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Corrections — ${player.name}`}
      description="Use only to fix mistakes. Purses and max bids are recalculated automatically."
      size="sm"
    >
      <div className="space-y-5">
        {(player.status === "POOL" || player.status === "UNSOLD") && (
          <div className="space-y-3 rounded-xl bg-ink-850 p-4 ring-1 ring-ink-600">
            <div className="text-sm font-semibold text-white">Assign to a team</div>
            <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {snapshot!.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (max {formatMoney(t.maxBid, sym)})
                </option>
              ))}
            </Select>
            <MoneyInput symbol={sym} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Button
              variant="primary"
              className="w-full"
              loading={busy === "assign"}
              disabled={!team || parseMillions(amount) === null}
              onClick={() => send({ action: "ASSIGN", teamId, amount: parseMillions(amount) }, "assign")}
            >
              Assign for {formatMoney(parseMillions(amount), sym)}
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {player.status !== "POOL" && (
            <Button loading={busy === "pool"} onClick={() => send({ action: "RETURN_TO_POOL" }, "pool")}>
              Return to pool{player.status === "SOLD" ? " (refund purse)" : ""}
            </Button>
          )}
          {(player.status === "POOL" || player.status === "UNSOLD") && (
            <Button variant="danger" loading={busy === "dq"} onClick={() => send({ action: "DISQUALIFY" }, "dq")}>
              Disqualify
            </Button>
          )}
          {player.status === "DISQUALIFIED" && (
            <Button variant="success" loading={busy === "re"} onClick={() => send({ action: "REINSTATE" }, "re")}>
              Reinstate
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
