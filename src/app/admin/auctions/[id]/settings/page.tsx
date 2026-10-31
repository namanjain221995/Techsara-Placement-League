"use client";

import { Lock, Save, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuction } from "@/components/admin/auction-context";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Switch } from "@/components/ui/form";
import { Spinner } from "@/components/ui/misc";
import { api, errorMessage, fieldErrors } from "@/lib/api";
import { formatMoney, parseMillions, toMillionsString } from "@/shared/money";
import { maxBid } from "@/shared/rules";
import type { AuctionSettings } from "@/shared/types";

interface Form {
  name: string;
  currencySymbol: string;
  purse: string;
  basePrice: string;
  bidIncrement: string;
  minSquad: string;
  maxSquad: string;
  timerEnabled: boolean;
  timerSeconds: string;
  poolOrder: "RANDOM" | "SEQUENTIAL";
  roles: string[];
}

const toForm = (a: AuctionSettings): Form => ({
  name: a.name,
  currencySymbol: a.currencySymbol,
  purse: toMillionsString(a.purse),
  basePrice: toMillionsString(a.basePrice),
  bidIncrement: toMillionsString(a.bidIncrement),
  minSquad: String(a.minSquad),
  maxSquad: String(a.maxSquad),
  timerEnabled: a.timerEnabled,
  timerSeconds: String(a.timerSeconds),
  poolOrder: a.poolOrder,
  roles: a.roles,
});

export default function SettingsPage() {
  const { id, snapshot, refreshDetail } = useAuction();
  const [edited, setForm] = useState<Form | null>(null);
  const [role, setRole] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const form = edited ?? (snapshot ? toForm(snapshot.auction) : null); // unsaved edits, else the live settings
  if (!snapshot || !form) return <Spinner className="py-20" />;
  const a = snapshot.auction;
  const moneyLocked = a.status !== "DRAFT";
  const done = a.status === "COMPLETED";
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });

  const purse = parseMillions(form.purse);
  const base = parseMillions(form.basePrice);
  const minSquad = Number.parseInt(form.minSquad, 10);
  const preview =
    purse && base && Number.isFinite(minSquad)
      ? maxBid({ purse, spent: 0, squadCount: 0 }, { basePrice: base, bidIncrement: 1, minSquad, maxSquad: 99 })
      : null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const money = { purse, basePrice: base, bidIncrement: parseMillions(form.bidIncrement) };
    for (const [k, v] of Object.entries(money)) if (v === null) errs[k] = "Enter millions, e.g. 1 or 2.5";
    if (Object.keys(errs).length) return setErrors(errs);
    setBusy(true);
    setErrors({});
    try {
      await api.put(`/auctions/${id}/settings`, {
        name: form.name,
        currencySymbol: form.currencySymbol,
        ...money,
        minSquad: Number.parseInt(form.minSquad, 10),
        maxSquad: Number.parseInt(form.maxSquad, 10),
        timerEnabled: form.timerEnabled,
        timerSeconds: Number.parseInt(form.timerSeconds, 10),
        poolOrder: form.poolOrder,
        roles: role.trim() ? [...form.roles, role.trim()] : form.roles,
      });
      setRole("");
      toast.success("Settings saved");
      await refreshDetail();
      setForm(null); // reload from the new snapshot
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-wide text-white uppercase">Settings</h1>
          <p className="text-sm text-ink-300">All amounts are in millions — type 25 for {formatMoney(25000, form.currencySymbol)}.</p>
        </div>
        <Button type="submit" variant="primary" loading={busy} disabled={done} data-testid="save-settings">
          <Save className="size-4" /> Save settings
        </Button>
      </div>

      {moneyLocked && (
        <p className="flex items-center gap-2 rounded-xl bg-volt-500/10 px-4 py-3 text-sm text-volt-400 ring-1 ring-volt-500/30">
          <Lock className="size-4" />{" "}
          {done
            ? "The auction is complete — settings are read-only."
            : "Money and squad rules are locked. Name, countdown, candidate order and roles can still change."}
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="panel space-y-4 p-6">
          <h2 className="text-xs font-bold tracking-widest text-ink-300 uppercase">Event</h2>
          <Field label="Auction name" error={errors.name}>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={80} disabled={done} />
          </Field>
          <Field label="Currency symbol" error={errors.currencySymbol} hint="Shown before every amount ($, ₹, €…).">
            <Input value={form.currencySymbol} onChange={(e) => set("currencySymbol", e.target.value)} maxLength={3} className="w-24" disabled={moneyLocked} />
          </Field>
          <Field label="Candidate roles" hint="Used in the candidate form (e.g. Batsman, Bowler, All-Rounder, Wicket Keeper).">
            <div className="flex flex-wrap gap-2">
              {form.roles.map((r, i) => (
                <span key={r + i} className="inline-flex items-center gap-1 rounded-full bg-ink-700 py-1 pr-1.5 pl-3 text-sm ring-1 ring-ink-500">
                  {r}
                  {!done && form.roles.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove ${r}`}
                      onClick={() =>
                        set(
                          "roles",
                          form.roles.filter((_, j) => j !== i),
                        )
                      }
                      className="rounded-full p-0.5 hover:bg-ink-600"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </span>
              ))}
            </div>
            <Input
              className="mt-2"
              placeholder="Add a role and press Enter"
              value={role}
              disabled={done}
              onChange={(e) => setRole(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (role.trim()) set("roles", [...form.roles, role.trim()]);
                  setRole("");
                }
              }}
            />
          </Field>
        </section>

        <section className="panel space-y-4 p-6">
          <h2 className="text-xs font-bold tracking-widest text-ink-300 uppercase">Money & squads</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Purse per team" error={errors.purse}>
              <MoneyInput
                symbol={form.currencySymbol}
                value={form.purse}
                onChange={(e) => set("purse", e.target.value)}
                disabled={moneyLocked}
                data-testid="purse-input"
              />
            </Field>
            <Field label="Base price" error={errors.basePrice}>
              <MoneyInput symbol={form.currencySymbol} value={form.basePrice} onChange={(e) => set("basePrice", e.target.value)} disabled={moneyLocked} />
            </Field>
            <Field label="Bid step" error={errors.bidIncrement} hint="One tap raises by this.">
              <MoneyInput symbol={form.currencySymbol} value={form.bidIncrement} onChange={(e) => set("bidIncrement", e.target.value)} disabled={moneyLocked} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Minimum candidates per team" error={errors.minSquad} hint="Teams below this when the auction ends are disqualified.">
              <Input type="number" min={0} max={50} value={form.minSquad} onChange={(e) => set("minSquad", e.target.value)} disabled={moneyLocked} />
            </Field>
            <Field label="Maximum candidates per team" error={errors.maxSquad}>
              <Input type="number" min={1} max={50} value={form.maxSquad} onChange={(e) => set("maxSquad", e.target.value)} disabled={moneyLocked} />
            </Field>
          </div>
          <div className="rounded-xl bg-gold-500/10 p-4 text-sm text-gold-300 ring-1 ring-gold-500/30" data-testid="maxbid-preview">
            Max bid for a team that has bought nobody:{" "}
            <b className="font-display text-lg">{preview !== null ? formatMoney(preview, form.currencySymbol) : "—"}</b>
            <span className="block text-xs text-gold-300/80">= purse − base price × (minimum − 1), so every team can still afford its minimum squad.</span>
          </div>
        </section>

        <section className="panel space-y-4 p-6 xl:col-span-2">
          <h2 className="text-xs font-bold tracking-widest text-ink-300 uppercase">Live flow</h2>
          <div className="grid gap-5 md:grid-cols-3">
            <Field
              label="Countdown per candidate"
              hint="Restarts on every bid. At zero the screen shows “time up” — the auctioneer still decides Sold / Unsold."
            >
              <div className="flex items-center gap-3">
                <Switch checked={form.timerEnabled} onChange={(v) => set("timerEnabled", v)} label="Countdown" disabled={done} />
                <Input
                  type="number"
                  min={5}
                  max={600}
                  value={form.timerSeconds}
                  onChange={(e) => set("timerSeconds", e.target.value)}
                  className="w-24"
                  disabled={done || !form.timerEnabled}
                  aria-label="Seconds"
                />
                <span className="text-sm text-ink-300">seconds</span>
              </div>
            </Field>
            <Field label="Next candidate order">
              <Select value={form.poolOrder} onChange={(e) => set("poolOrder", e.target.value as Form["poolOrder"])} disabled={done}>
                <option value="RANDOM">Random from the pool</option>
                <option value="SEQUENTIAL">By candidate number</option>
              </Select>
            </Field>
          </div>
        </section>
      </div>
    </form>
  );
}
