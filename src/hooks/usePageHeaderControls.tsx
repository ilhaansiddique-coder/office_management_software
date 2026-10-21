import { useEffect, type ReactNode } from "react";
import { usePageSearchContext } from "@/contexts/PageSearchContext";

export const usePageHeaderControls = (controls: ReactNode | null) => {
  const { setHeaderControls } = usePageSearchContext();

  useEffect(() => {
    setHeaderControls(controls);
    return () => setHeaderControls(null);
  }, [controls, setHeaderControls]);
};
