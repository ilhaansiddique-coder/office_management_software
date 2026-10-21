import { useEffect } from "react";
import { usePageSearchContext } from "@/contexts/PageSearchContext";

type PageSearchOptions = {
  placeholder?: string;
};

export const usePageSearch = (options?: PageSearchOptions) => {
  const context = usePageSearchContext();
  const { setPlaceholder } = context;

  useEffect(() => {
    if (options?.placeholder === undefined) return;
    setPlaceholder(options.placeholder);
    return () => {
      setPlaceholder("Search...");
    };
  }, [options?.placeholder, setPlaceholder]);

  return context;
};
