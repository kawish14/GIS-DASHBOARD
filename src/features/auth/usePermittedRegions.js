import { useMemo } from "react";
import { useAuth } from "./AuthContext";

/**
 * The regions this user is allowed to see, sorted for display.
 *
 * Shared so the left sidebar's region tabs and the active-users list can't
 * disagree about the set -- they used to derive it separately, one of them by
 * being handed a copy as a prop.
 *
 * Guarded because `user` is briefly null while the session check is in flight
 * and again after logout.
 */
export function usePermittedRegions() {
  const { user } = useAuth();
  return useMemo(() => {
    const regions = user?.permissions?.regions ?? [];
    return [...regions].sort((a, b) => b.localeCompare(a)); // descending, by request
  }, [user?.permissions?.regions]);
}
