import { createContext, useContext, useEffect, useMemo, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import { useLocation } from "react-router-dom";

export type PageSearchResultType = "product" | "customer" | "sale" | "invoice";

export type PageSearchResult = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  href?: string;
  query?: string;
  type: PageSearchResultType;
};

type PageSearchContextValue = {
  query: string;
  setQuery: (value: string) => void;
  placeholder: string;
  setPlaceholder: (value: string) => void;
  results: PageSearchResult[];
  setResults: Dispatch<SetStateAction<PageSearchResult[]>>;
  headerControls: ReactNode | null;
  setHeaderControls: (value: ReactNode | null) => void;
  headerActions: ReactNode | null;
  setHeaderActions: (value: ReactNode | null) => void;
};

const PageSearchContext = createContext<PageSearchContextValue | null>(null);

export const PageSearchProvider = ({ children }: { children: ReactNode }) => {
  const [query, setQuery] = useState("");
  const [placeholder, setPlaceholder] = useState("Search...");
  const [results, setResults] = useState<PageSearchResult[]>([]);
  const [headerControls, setHeaderControls] = useState<ReactNode | null>(null);
  const [headerActions, setHeaderActions] = useState<ReactNode | null>(null);
  const location = useLocation();

  useEffect(() => {
    setQuery("");
    setResults([]);
  }, [location.pathname]);

  const value = useMemo(
    () => ({
      query,
      setQuery,
      placeholder,
      setPlaceholder,
      results,
      setResults,
      headerControls,
      setHeaderControls,
      headerActions,
      setHeaderActions,
    }),
    [query, placeholder, results, headerControls, headerActions]
  );

  return <PageSearchContext.Provider value={value}>{children}</PageSearchContext.Provider>;
};

export const usePageSearchContext = () => {
  const context = useContext(PageSearchContext);
  if (!context) {
    throw new Error("usePageSearchContext must be used within a PageSearchProvider.");
  }
  return context;
};
