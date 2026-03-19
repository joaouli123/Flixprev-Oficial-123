import { buildApiUrl } from "@/lib/api";

type PlatformEventPayload = {
  userId?: string | null;
  action: string;
  label?: string | null;
  channel?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function trackPlatformEvent(payload: PlatformEventPayload) {
  const userId = String(payload.userId || "").trim();
  if (!userId || !payload.action) {
    return false;
  }

  try {
    const response = await fetch(buildApiUrl("/api/platform-events"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId,
      },
      body: JSON.stringify({
        action: payload.action,
        label: payload.label || null,
        channel: payload.channel || null,
        metadata: payload.metadata || null,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}
