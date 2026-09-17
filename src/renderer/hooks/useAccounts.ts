import { useCallback, useEffect, useState } from "react";
import type { AccountSummary } from "@shared/types";

export function useAccounts() {
  const [accounts, setAccounts] = useState<AccountSummary[]>(() => window.api.listAccounts());

  const refresh = useCallback(() => setAccounts(window.api.listAccounts()), []);
  useEffect(() => {
    window.addEventListener("account-label-changed", refresh);
    return () => window.removeEventListener("account-label-changed", refresh);
  }, [refresh]);

  return { accounts, refresh };
}
