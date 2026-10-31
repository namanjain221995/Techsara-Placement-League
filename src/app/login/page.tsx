"use client";

import { LogIn } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/login", { username, password });
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="panel w-full max-w-sm space-y-4 p-7">
      <Wordmark className="mb-2" />
      <h1 className="font-display text-2xl tracking-wide text-white uppercase">Organizer sign in</h1>
      <Field label="Username" htmlFor="username">
        <Input id="username" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} required />
      </Field>
      <Field label="Password" htmlFor="password" error={error ?? undefined}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          aria-invalid={!!error}
        />
      </Field>
      <Button type="submit" variant="primary" className="w-full" loading={busy}>
        <LogIn className="size-4" /> Sign in
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="stage-bg flex min-h-dvh items-center justify-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
