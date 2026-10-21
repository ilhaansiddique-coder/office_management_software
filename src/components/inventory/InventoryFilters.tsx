
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";

interface InventoryFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  stockFilter: "all" | "in_stock" | "out_of_stock";
  onStockFilterChange: (value: "all" | "in_stock" | "out_of_stock") => void;
  hasExactMatch: boolean;
  debouncedSearchTerm: string;
}

export const InventoryFilters = ({
  searchTerm,
  onSearchChange,
  stockFilter,
  onStockFilterChange,
  hasExactMatch,
  debouncedSearchTerm
}: InventoryFiltersProps) => {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-4">
        <ToggleGroup
          type="single"
          value={stockFilter}
          onValueChange={(value) => onStockFilterChange(value as typeof stockFilter || "all")}
          className="flex gap-1"
        >
          <ToggleGroupItem value="all" variant="outline" size="sm">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="in_stock" variant="outline" size="sm">
            In Stock
          </ToggleGroupItem>
          <ToggleGroupItem value="out_of_stock" variant="outline" size="sm">
            Out of Stock
          </ToggleGroupItem>
        </ToggleGroup>
        {hasExactMatch && debouncedSearchTerm.trim() && (
          <Badge variant="secondary" className="text-xs">
            Exact match
          </Badge>
        )}
      </div>
      <div className="relative w-full md:w-80">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input 
          placeholder="Search by name, SKU, or attributes..." 
          className="pl-9"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
    </div>
  );
};
