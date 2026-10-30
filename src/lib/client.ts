/** Small fetch wrapper for the browser: JSON in, JSON out, readable errors. */
export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: isForm ? init.headers : { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new ApiError(0, "You appear to be offline. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error || `Request failed (${res.status})`, data.code);
  }
  return data as T;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function timeAgo(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), "day");
  return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}
