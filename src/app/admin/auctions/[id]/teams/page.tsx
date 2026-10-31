"use client";

import { ArrowDown, ArrowUp, ImagePlus, Pencil, Plus, Trash2, UsersRound, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuction } from "@/components/admin/auction-context";
import { TeamLogo } from "@/components/media";
import { Button } from "@/components/ui/button";
import { Dialog, useConfirm } from "@/components/ui/dialog";
import { Field, Input, MoneyInput } from "@/components/ui/form";
import { EmptyState, Spinner } from "@/components/ui/misc";
import { api, errorMessage, fieldErrors } from "@/lib/api";
import { formatMoney, parseMillions, toMillionsString } from "@/shared/money";
import type { TeamView } from "@/shared/types";

const SWATCHES = ["#F5B83D", "#2F7DF6", "#E5484D", "#14B8A6", "#8B5CF6", "#F97316", "#22C55E", "#EC4899", "#0EA5E9", "#A3A3A3"];

interface Draft {
  id?: string;
  name: string;
  shortName: string;
  color: string;
  members: string[];
  purse: string;
  logoUrl: string | null;
}

export default function TeamsPage() {
  const { id, snapshot } = useAuction();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [memberInput, setMemberInput] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  if (!snapshot) return <Spinner className="py-20" />;
  const a = snapshot.auction;
  const isDraft = a.status === "DRAFT";
  const money = (k: number) => formatMoney(k, a.currencySymbol);
  const teams = snapshot.teams;

  const openNew = () => {
    setDraft({ name: "", shortName: "", color: SWATCHES[teams.length % SWATCHES.length], members: [], purse: toMillionsString(a.purse), logoUrl: null });
    setLogoFile(null);
    setErrors({});
    setMemberInput("");
  };
  const openEdit = (t: TeamView) => {
    setDraft({ id: t.id, name: t.name, shortName: t.shortName, color: t.color, members: t.members, purse: toMillionsString(t.purse), logoUrl: t.logoUrl });
    setLogoFile(null);
    setErrors({});
    setMemberInput("");
  };

  const addMember = () => {
    const m = memberInput.trim();
    if (!m || !draft) return;
    setDraft({ ...draft, members: [...draft.members, m].slice(0, 12) });
    setMemberInput("");
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const members = memberInput.trim() ? [...draft.members, memberInput.trim()] : draft.members;
    const purse = parseMillions(draft.purse);
    if (isDraft && purse === null) return setErrors({ purse: "Enter the purse in millions, e.g. 25" });
    setBusy(true);
    try {
      const body = { name: draft.name, shortName: draft.shortName, color: draft.color, members, ...(isDraft ? { purse } : {}) };
      const res = draft.id
        ? await api.put<{ team: { id: string } }>(`/teams/${draft.id}`, body)
        : await api.post<{ team: { id: string } }>(`/auctions/${id}/teams`, body);
      if (logoFile) await api.upload(`/teams/${res.team.id}/logo`, logoFile);
      toast.success(draft.id ? "Team updated" : "Team added");
      setDraft(null);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: TeamView) => {
    if (!(await confirm({ title: `Delete ${t.name}?`, tone: "danger", confirmLabel: "Delete" }))) return;
    api.del(`/teams/${t.id}`).then(
      () => toast.success("Team deleted"),
      (e) => toast.error(errorMessage(e)),
    );
  };
  const removeLogo = async () => {
    if (!draft?.id) return;
    await api.del(`/teams/${draft.id}/logo`).then(
      () => setDraft({ ...draft, logoUrl: null }),
      (e) => toast.error(errorMessage(e)),
    );
  };
  const move = (i: number, dir: -1 | 1) => {
    const ids = teams.map((t) => t.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    api.post(`/auctions/${id}/teams/reorder`, { ids }).catch((e) => toast.error(errorMessage(e)));
  };

  const previewLogo = logoFile ? URL.createObjectURL(logoFile) : (draft?.logoUrl ?? null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-wide text-white uppercase">Teams</h1>
          <p className="text-sm text-ink-300">
            Each team starts with {money(a.purse)}. Names, colours, logos and members stay editable at any time{isDraft ? "" : "; purses are locked"}.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={openNew}
          disabled={!isDraft}
          title={isDraft ? undefined : "Unlock the configuration to add teams"}
          data-testid="add-team"
        >
          <Plus className="size-4" /> Add team
        </Button>
      </div>

      {teams.length === 0 ? (
        <EmptyState
          icon={<UsersRound className="size-10" />}
          title="No teams yet"
          body="Add the teams that will bid — e.g. five teams with two members each."
          action={
            <Button variant="primary" onClick={openNew}>
              Add the first team
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {teams.map((t, i) => (
            <article key={t.id} className="panel overflow-hidden" data-testid="team-card">
              <div className="h-2" style={{ background: t.color }} />
              <div className="p-5">
                <div className="flex items-center gap-4">
                  <TeamLogo team={t} className="size-16" />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-display text-xl font-semibold tracking-wide text-white uppercase">{t.name}</h2>
                    <p className="truncate text-sm text-ink-300">{t.members.length ? t.members.join(" & ") : "No members added"}</p>
                  </div>
                  <span className="rounded-md bg-ink-850 px-2 py-1 font-display text-sm text-ink-200 ring-1 ring-ink-600">{t.shortName}</span>
                </div>
                <dl className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
                  {[
                    ["Purse", money(t.remaining)],
                    ["Spent", money(t.spent)],
                    ["Max bid", money(t.maxBid)],
                    ["Squad", `${t.squadCount}/${a.maxSquad}`],
                  ].map(([l, v]) => (
                    <div key={l} className="rounded-lg bg-ink-850 py-2 ring-1 ring-ink-600/60">
                      <dt className="font-bold tracking-widest text-ink-400 uppercase">{l}</dt>
                      <dd className="font-display text-base font-semibold text-white">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 flex items-center gap-1">
                  <Button size="sm" onClick={() => openEdit(t)}>
                    <Pencil className="size-4" /> Edit
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Move down" disabled={i === teams.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="ml-auto" aria-label="Delete team" disabled={!isDraft} onClick={() => remove(t)}>
                    <Trash2 className="size-4 text-loss-400" />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)} title={draft?.id ? "Edit team" : "Add team"} size="md">
        {draft && (
          <form onSubmit={save} className="space-y-4">
            <div className="flex items-center gap-4">
              <TeamLogo
                team={{ name: draft.name || "Team", shortName: draft.shortName || "TM", color: draft.color, logoUrl: previewLogo }}
                className="size-20"
              />
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-ink-700 px-3 py-2 text-sm font-semibold text-ink-100 ring-1 ring-ink-500 hover:bg-ink-600">
                  <ImagePlus className="size-4" /> {previewLogo ? "Change logo" : "Upload logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                {draft.logoUrl && !logoFile && (
                  <Button size="sm" variant="ghost" onClick={removeLogo}>
                    Remove logo
                  </Button>
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
              <Field label="Team name" error={errors.name}>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={60} required autoFocus />
              </Field>
              <Field label="Short name" error={errors.shortName}>
                <Input value={draft.shortName} onChange={(e) => setDraft({ ...draft, shortName: e.target.value.toUpperCase() })} maxLength={6} required />
              </Field>
            </div>
            <Field label="Theme colour" error={errors.color}>
              <div className="flex flex-wrap items-center gap-2">
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    onClick={() => setDraft({ ...draft, color: c })}
                    className="size-8 rounded-lg ring-2 ring-offset-2 ring-offset-ink-800"
                    style={{ background: c, ["--tw-ring-color" as string]: draft.color.toLowerCase() === c.toLowerCase() ? "#fff" : "transparent" }}
                  />
                ))}
                <input
                  type="color"
                  value={draft.color}
                  onChange={(e) => setDraft({ ...draft, color: e.target.value.toUpperCase() })}
                  className="h-8 w-12 cursor-pointer rounded-lg bg-transparent"
                  aria-label="Custom colour"
                />
              </div>
            </Field>
            <Field label="Team members (who plays for this team)" hint="Press Enter after each name.">
              <div className="flex flex-wrap gap-2">
                {draft.members.map((m, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full bg-ink-700 py-1 pr-1.5 pl-3 text-sm ring-1 ring-ink-500">
                    {m}
                    <button
                      type="button"
                      aria-label={`Remove ${m}`}
                      onClick={() => setDraft({ ...draft, members: draft.members.filter((_, j) => j !== i) })}
                      className="rounded-full p-0.5 hover:bg-ink-600"
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                ))}
              </div>
              <Input
                className="mt-2"
                placeholder="e.g. Aarav"
                value={memberInput}
                onChange={(e) => setMemberInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addMember();
                  }
                }}
              />
            </Field>
            <Field label="Purse" error={errors.purse} hint={isDraft ? "Usually the same for every team." : "Locked after the configuration is locked."}>
              <MoneyInput symbol={a.currencySymbol} value={draft.purse} onChange={(e) => setDraft({ ...draft, purse: e.target.value })} disabled={!isDraft} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={busy} data-testid="save-team">
                {draft.id ? "Save changes" : "Add team"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
