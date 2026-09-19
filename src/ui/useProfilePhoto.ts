import { useEffect, useState } from "react";

/**
 * Resolves an AUTHENTICATED profile photo into an object URL for <img>. Photo bytes are never public: the host
 * passes the endpoint + auth headers, and `version` (the server's metadata) busts the browser cache after a
 * replacement. `version` null/0 → no request at all (no photo). State is only set from the async callbacks and is
 * keyed by (url, version), so a resolved URL for an older version or a removed photo is never shown; object URLs
 * are revoked on change/unmount.
 */
export function useProfilePhoto(url: string | null, headers: Record<string, string>, version: number | null | undefined): string | null {
  const [photo, setPhoto] = useState<{ key: string; objectUrl: string } | null>(null);
  const headerKey = JSON.stringify(headers);
  const key = url && version ? url + "#" + version : "";
  useEffect(() => {
    if (!key) return;
    let alive = true, created: string | null = null;
    const sep = (url as string).includes("?") ? "&" : "?";
    fetch(url + sep + "v=" + encodeURIComponent(String(version)), { headers: JSON.parse(headerKey) as Record<string, string> })
      .then(async r => {
        if (!alive || !r.ok) return;
        const blob = await r.blob();
        if (!alive) return;
        created = URL.createObjectURL(blob);
        setPhoto({ key, objectUrl: created });
      })
      .catch(() => { /* no photo shown; the preset/default avatar remains */ });
    return () => { alive = false; if (created) URL.revokeObjectURL(created); };
  }, [key, url, headerKey, version]);
  return photo && photo.key === key ? photo.objectUrl : null;
}
