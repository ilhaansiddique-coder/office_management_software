import { useState } from "react";
import { Calendar, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { formatInTimeZone } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useSystemSettings } from "@/hooks/useSystemSettings";

export type SalesTrendPeriod = "daily" | "monthly" | "yearly";
export type SalesTrendRange = "last30days" | "last6months" | "last12months" | "currentYear" | "lastYear" | "custom";

interface SalesTrendFilterProps {
  onFilterChange: (period: SalesTrendPeriod, range: SalesTrendRange, customStart?: Date, customEnd?: Date) => void;
}

export function SalesTrendFilter({ onFilterChange }: SalesTrendFilterProps) {
  const [period, setPeriod] = useState<SalesTrendPeriod>("daily");
  const [range, setRange] = useState<SalesTrendRange>("last30days");
  const [customStart, setCustomStart] = useState<Date>();
  const [customEnd, setCustomEnd] = useState<Date>();
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const { systemSettings } = useSystemSettings();

  const handlePeriodChange = (newPeriod: SalesTrendPeriod) => {
    setPeriod(newPeriod);
    // Auto-adjust range based on period
    let newRange: SalesTrendRange = range;
    if (newPeriod === "monthly" && range === "last30days") {
      newRange = "last6months";
    } else if (newPeriod === "yearly" && (range === "last30days" || range === "last6months")) {
      newRange = "last12months";
    }
    setRange(newRange);
    onFilterChange(newPeriod, newRange, customStart, customEnd);
  };

  const handleRangeChange = (newRange: SalesTrendRange) => {
    setRange(newRange);
    onFilterChange(period, newRange, customStart, customEnd);
  };

  const handleCustomDateChange = () => {
    if (customStart && customEnd) {
      onFilterChange(period, "custom", customStart, customEnd);
      setIsCustomOpen(false);
    }
  };

  const getAvailableRanges = () => {
    switch (period) {
      case "daily":
        return [
          { value: "last30days", label: "Last 30 Days" },
          { value: "last6months", label: "Last 6 Months" },
          { value: "currentYear", label: "Current Year" },
          { value: "custom", label: "Custom Range" }
        ];
      case "monthly":
        return [
          { value: "last6months", label: "Last 6 Months" },
          { value: "last12months", label: "Last 12 Months" },
          { value: "currentYear", label: "Current Year" },
          { value: "lastYear", label: "Last Year" },
          { value: "custom", label: "Custom Range" }
        ];
      case "yearly":
        return [
          { value: "last12months", label: "Last 12 Months" },
          { value: "custom", label: "Custom Range" }
        ];
      default:
        return [];
    }
  };

  const getDisplayText = () => {
    if (range === "custom" && customStart && customEnd) {
      return `${formatInTimeZone(customStart, "MMM dd, yyyy", systemSettings.timezone)} - ${formatInTimeZone(customEnd, "MMM dd, yyyy", systemSettings.timezone)}`;
    }
    
    const rangeLabels = {
      last30days: "Last 30 Days",
      last6months: "Last 6 Months", 
      last12months: "Last 12 Months",
      currentYear: "Current Year",
      lastYear: "Last Year",
      custom: "Custom Range"
    };
    
    return rangeLabels[range];
  };

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">View by:</span>
          </div>
          
          <Select value={period} onValueChange={handlePeriodChange}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>

          <Select value={range} onValueChange={handleRangeChange}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {getAvailableRanges().map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {range === "custom" && (
            <Popover open={isCustomOpen} onOpenChange={setIsCustomOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[200px] justify-start text-left font-normal",
                    !customStart && !customEnd && "text-muted-foreground"
                  )}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  {getDisplayText()}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="p-3 space-y-3">
                  <div>
                    <label className="text-sm font-medium">Start Date</label>
                    <CalendarComponent
                      mode="single"
                      selected={customStart}
                      onSelect={setCustomStart}
                      className="rounded-md border"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">End Date</label>
                    <CalendarComponent
                      mode="single"
                      selected={customEnd}
                      onSelect={setCustomEnd}
                      className="rounded-md border"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      onClick={handleCustomDateChange}
                      disabled={!customStart || !customEnd}
                    >
                      Apply
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => setIsCustomOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
