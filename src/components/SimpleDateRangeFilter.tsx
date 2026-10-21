import { useState, useEffect, useRef } from "react";
import { CalendarIcon } from "lucide-react";
import {
  subDays,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from "date-fns";
import { DateRange } from "react-day-picker";
import { formatInTimeZone, toZonedDate } from "@/lib/time";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSystemSettings } from "@/hooks/useSystemSettings";

interface SimpleDateRangeFilterProps {
  onDateRangeChange: (startDate?: Date, endDate?: Date) => void;
  defaultPreset?: string;
  triggerClassName?: string;
}

export function SimpleDateRangeFilter({
  onDateRangeChange,
  defaultPreset = "today",
  triggerClassName,
}: SimpleDateRangeFilterProps) {
  const isMobile = useIsMobile();
  const [date, setDate] = useState<DateRange | undefined>();
  const [tempDate, setTempDate] = useState<DateRange | undefined>();
  const [selectedPreset, setSelectedPreset] = useState<string>(defaultPreset);
  const [isOpen, setIsOpen] = useState(false);
  const hasInitialized = useRef(false);
  const { systemSettings } = useSystemSettings();

  const presets = [
    { label: "Today", value: "today", days: 0 },
    { label: "Yesterday", value: "yesterday", days: null, isYesterday: true },
    { label: "Last 7 days", value: "7days", days: 7 },
    { label: "This Month", value: "this_month", days: null },
    { label: "Last 30 days", value: "30days", days: 30 },
    { label: "This Year", value: "this_year", days: null },
    { label: "All Time", value: "all", days: null },
  ];

  // Set default preset on component mount (only once)
  useEffect(() => {
    if (!hasInitialized.current) {
      if (defaultPreset === "all") {
        setDate(undefined);
        setTempDate(undefined);
        onDateRangeChange();
      } else if (defaultPreset === "yesterday") {
        const yesterday = subDays(toZonedDate(new Date(), systemSettings.timezone), 1);
        const newRange = { from: yesterday, to: yesterday };
        setDate(newRange);
        setTempDate(newRange);
        onDateRangeChange(startOfDay(yesterday), endOfDay(yesterday));
      } else if (defaultPreset === "today") {
        const today = toZonedDate(new Date(), systemSettings.timezone);
        const newRange = { from: today, to: today };
        setDate(newRange);
        setTempDate(newRange);
        onDateRangeChange(startOfDay(today), endOfDay(today));
      } else if (defaultPreset === "this_month") {
        const now = toZonedDate(new Date(), systemSettings.timezone);
        const newRange = { from: startOfMonth(now), to: endOfMonth(now) };
        setDate(newRange);
        setTempDate(newRange);
        onDateRangeChange(startOfDay(newRange.from), endOfDay(newRange.to));
      } else if (defaultPreset === "this_year") {
        const now = toZonedDate(new Date(), systemSettings.timezone);
        const newRange = { from: startOfYear(now), to: endOfYear(now) };
        setDate(newRange);
        setTempDate(newRange);
        onDateRangeChange(startOfDay(newRange.from), endOfDay(newRange.to));
      } else {
        // Handle other presets
        const preset = presets.find(p => p.value === defaultPreset);
        if (preset && preset.days) {
          const endDate = toZonedDate(new Date(), systemSettings.timezone);
          const startDate = subDays(endDate, preset.days - 1);
          const newRange = { from: startDate, to: endDate };
          setDate(newRange);
          setTempDate(newRange);
          onDateRangeChange(startOfDay(startDate), endOfDay(endDate));
        }
      }
      hasInitialized.current = true;
    }
  }, [defaultPreset, onDateRangeChange, systemSettings.timezone]); // Include dependencies

  const handlePresetClick = (preset: typeof presets[0]) => {
    setSelectedPreset(preset.value);
    
    if (preset.value === "all") {
      setDate(undefined);
      setTempDate(undefined);
      onDateRangeChange();
      setIsOpen(false);
    } else if (preset.value === "yesterday") {
      const yesterday = subDays(toZonedDate(new Date(), systemSettings.timezone), 1);
      const newRange = { from: yesterday, to: yesterday };
      setDate(newRange);
      setTempDate(newRange);
      onDateRangeChange(startOfDay(yesterday), endOfDay(yesterday));
      setIsOpen(false);
    } else if (preset.value === "today") {
      const today = toZonedDate(new Date(), systemSettings.timezone);
      const newRange = { from: today, to: today };
      setDate(newRange);
      setTempDate(newRange);
      onDateRangeChange(startOfDay(today), endOfDay(today));
      setIsOpen(false);
    } else if (preset.value === "this_month") {
      const now = toZonedDate(new Date(), systemSettings.timezone);
      const newRange = { from: startOfMonth(now), to: endOfMonth(now) };
      setDate(newRange);
      setTempDate(newRange);
      onDateRangeChange(startOfDay(newRange.from), endOfDay(newRange.to));
      setIsOpen(false);
    } else if (preset.value === "this_year") {
      const now = toZonedDate(new Date(), systemSettings.timezone);
      const newRange = { from: startOfYear(now), to: endOfYear(now) };
      setDate(newRange);
      setTempDate(newRange);
      onDateRangeChange(startOfDay(newRange.from), endOfDay(newRange.to));
      setIsOpen(false);
    } else if (preset.days) {
      const endDate = toZonedDate(new Date(), systemSettings.timezone);
      const startDate = subDays(endDate, preset.days - 1);
      const newRange = { from: startDate, to: endDate };
      setDate(newRange);
      setTempDate(newRange);
      onDateRangeChange(startOfDay(startDate), endOfDay(endDate));
      setIsOpen(false);
    }
  };

  const handleDateSelect = (range: DateRange | undefined) => {
    setTempDate(range);
    setSelectedPreset("custom");
  };

  const handleApply = () => {
    setDate(tempDate);
    
    if (tempDate?.from && tempDate?.to) {
      const from = toZonedDate(tempDate.from, systemSettings.timezone);
      const to = toZonedDate(tempDate.to, systemSettings.timezone);
      onDateRangeChange(startOfDay(from), endOfDay(to));
    } else if (tempDate?.from) {
      const from = toZonedDate(tempDate.from, systemSettings.timezone);
      onDateRangeChange(startOfDay(from), endOfDay(from));
    } else {
      onDateRangeChange();
    }
    
    setIsOpen(false);
  };

  const handleCancel = () => {
    setTempDate(date);
    setIsOpen(false);
  };

  const getDisplayText = () => {
    if (selectedPreset === "all") return "All Time";
    if (selectedPreset === "yesterday") return "Yesterday";
    if (selectedPreset === "today") return "Today";
    if (selectedPreset === "7days") return "Last 7 days";
    if (selectedPreset === "this_month") return "This Month";
    if (selectedPreset === "30days") return "Last 30 days";
    if (selectedPreset === "this_year") return "This Year";
    
    if (date?.from) {
      if (date.to) {
        return `${formatInTimeZone(date.from, "MMM dd", systemSettings.timezone)} - ${formatInTimeZone(date.to, "MMM dd, yyyy", systemSettings.timezone)}`;
      }
      return formatInTimeZone(date.from, "MMM dd, yyyy", systemSettings.timezone);
    }
    
    return "All Time";
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "field-control w-full md:w-auto justify-start text-left font-normal shadow-none",
            "min-w-[120px] sm:min-w-[140px]",
            triggerClassName
          )}
          onClick={() => setIsOpen(true)}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {getDisplayText()}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="h-auto max-h-none overflow-visible p-0"
        style={{
          width: isMobile ? "calc(100vw - 1.5rem)" : "min(92vw, 760px)",
        }}
        align={isMobile ? "center" : "start"}
        sideOffset={8}
        portalled={!isMobile}
      >
        <div className="flex w-full flex-col gap-4 p-4 md:flex-row md:gap-0">
          <div className="flex w-full flex-col gap-3 md:w-40 md:pr-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Presets
            </p>
            <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-col">
              {presets.map((preset) => (
                <Button
                  key={preset.value}
                  variant={selectedPreset === preset.value ? "default" : "outline"}
                  size="sm"
                  className="w-full justify-center px-2 text-[11px] leading-tight sm:justify-start sm:px-3 sm:text-sm"
                  onClick={() => handlePresetClick(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="min-w-0 flex-1 md:border-l md:border-border/60 md:pl-4">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={tempDate?.from || date?.from}
              selected={tempDate}
              onSelect={handleDateSelect}
              numberOfMonths={isMobile ? 1 : 2}
              className="p-0 pointer-events-auto [&_.rdp-months]:justify-center [&_.rdp-month]:mx-auto [&_.rdp-table]:mx-auto [&_.rdp-head_row]:justify-center [&_.rdp-row]:justify-center md:w-full md:[&_.rdp-months]:justify-between md:[&_.rdp-months]:gap-4 md:[&_.rdp-month]:mx-0 md:[&_.rdp-month]:min-w-[15.5rem] md:[&_.rdp-head_row]:justify-start md:[&_.rdp-row]:justify-start"
            />
            <Separator className="my-4" />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleApply}
                disabled={!tempDate?.from}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
