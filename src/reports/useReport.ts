import { useContext, useEffect, useState } from "react";
import { reportGet, isAbortError, isSessionExpired } from "./api";
import { ReportSessionContext } from "./session";

/**
 * Report fetch hook with stale-response protection: data is stored WITH the params key it was fetched for, so
 * the moment the params change the exposed `data` is null (old rows never show against new filters), and a
 * late response for an older key is discarded (cancelled on cleanup and key-checked on arrival). Phase R-2: the
 * superseded request is also ABORTED on the wire, and a 401 ends the teacher session (ReportSessionContext).
 * Phase R-5a: moved out of ReportViews unchanged, so the hub overview shares it without loading the report views.
 */
export function useReport<T>(token: string, params: Record<string, string> | null) {
  const key = params ? JSON.stringify(params) : "";
  const [stored, setStored] = useState<{ key: string; data: T | null; error: string }>({ key: "", data: null, error: "" });
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const onSessionExpired = useContext(ReportSessionContext);
  useEffect(() => {
    if (!params) return;
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    reportGet<T>(token, params, controller.signal)
      .then(r => { if (!cancelled) setStored({ key, data: r, error: "" }); })
      .catch(e => {
        if (cancelled || isAbortError(e)) return;
        if (isSessionExpired(e)) onSessionExpired?.();
        setStored({ key, data: null, error: e instanceof Error ? e.message : "تعذر تجهيز التقرير." });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [token, key, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = stored.key === key && key !== "";
  return { data: current ? stored.data : null, error: current ? stored.error : "", loading: !!params && (loading || !current), reload: () => setNonce(n => n + 1) };
}
