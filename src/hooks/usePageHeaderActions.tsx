import { useEffect, type ReactNode } from "react";
import { usePageSearchContext } from "@/contexts/PageSearchContext";

export const usePageHeaderActions = (actions: ReactNode | null) => {
  const { setHeaderActions } = usePageSearchContext();

  useEffect(() => {
    setHeaderActions(actions);
    return () => setHeaderActions(null);
  }, [actions, setHeaderActions]);
};
