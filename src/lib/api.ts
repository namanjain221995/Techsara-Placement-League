"use client";

import type { ApiErrorBody } from "@/shared/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      "x-tpl-request": "1",
      ...(body !== undefined && !isForm ? { "content-type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  const data = text
    ? (() => {
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      })()
    : null;
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      // Hard navigation on purpose: this module is not a component and the session is gone.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/login?next=${next}`;
    }
    throw new ApiError(res.status, err?.code ?? "HTTP_" + res.status, err?.message ?? "Request failed.", err?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  del: <T>(path: string) => request<T>("DELETE", path),
  upload: <T>(path: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<T>("POST", path, fd);
  },
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}

/** Field-level messages from a VALIDATION_FAILED response, keyed by field path. */
export function fieldErrors(e: unknown): Record<string, string> {
  if (!(e instanceof ApiError) || !Array.isArray(e.details)) return {};
  const out: Record<string, string> = {};
  for (const d of e.details as { path?: string; message?: string }[]) if (d.path && d.message && !out[d.path]) out[d.path] = d.message;
  return out;
}
