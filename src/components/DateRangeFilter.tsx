import { useState, useEffect, useRef } from "react";
import { CalendarIcon } from "lucide-react";
import { subDays, startOfDay, endOfDay } from "date-fns";
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
import { Card, CardContent } from "@/components/ui/card";
import { useSystemSettings } from "@/hooks/useSystemSettings";

interface DateRangeFilterProps {
  onDateRangeChange: (startDate?: Date, endDate?: Date) => void;
}

export function DateRangeFilter({ onDateRangeChange }: DateRangeFilterProps) {
  const [date, setDate] = useState<DateRange | undefined>();
  const [selectedPreset, setSelectedPreset] = useState<string>("today");
  const hasInitialized = useRef(false);
  const { systemSettings } = useSystemSettings();

  const presets = [
    { label: "All Time", value: "all", days: null },
    { label: "Today", value: "today", days: 0 },
    { label: "Last 7 days", value: "7days", days: 7 },
    { label: "Last 30 days", value: "30days", days: 30 },
  ];

  // Set "Today" as default on component mount (only once)
  useEffect(() => {
    if (!hasInitialized.current) {
      const today = toZonedDate(new Date(), systemSettings.timezone);
      const newRange = { from: today, to: today };
      setDate(newRange);
      onDateRangeChange(startOfDay(today), endOfDay(today));
      hasInitialized.current = true;
    }
  }, [onDateRangeChange, systemSettings.timezone]); // Initialize once per timezone

  const handlePresetClick = (preset: typeof presets[0]) => {
    setSelectedPreset(preset.value);
    
    if (preset.value === "all") {
      setDate(undefined);
      onDateRangeChange();
    } else if (preset.value === "today") {
      const today = toZonedDate(new Date(), systemSettings.timezone);
      setDate({ from: today, to: today });
      onDateRangeChange(startOfDay(today), endOfDay(today));
    } else if (preset.days) {
      const endDate = toZonedDate(new Date(), systemSettings.timezone);
      const startDate = subDays(endDate, preset.days - 1);
      setDate({ from: startDate, to: endDate });
      onDateRangeChange(startOfDay(startDate), endOfDay(endDate));
    }
  };

  const handleDateSelect = (range: DateRange | undefined) => {
    setDate(range);
    setSelectedPreset("custom");
    
    if (range?.from && range?.to) {
      const from = toZonedDate(range.from, systemSettings.timezone);
      const to = toZonedDate(range.to, systemSettings.timezone);
      onDateRangeChange(startOfDay(from), endOfDay(to));
    } else if (range?.from) {
      const from = toZonedDate(range.from, systemSettings.timezone);
      onDateRangeChange(startOfDay(from), endOfDay(from));
    } else {
      onDateRangeChange();
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <Button
                key={preset.value}
                variant={selectedPreset === preset.value ? "default" : "outline"}
                size="sm"
                onClick={() => handlePresetClick(preset)}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !date && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date?.from ? (
                  date.to ? (
                    <>
                      {formatInTimeZone(date.from, "LLL dd, y", systemSettings.timezone)} -{" "}
                      {formatInTimeZone(date.to, "LLL dd, y", systemSettings.timezone)}
                    </>
                  ) : (
                    formatInTimeZone(date.from, "LLL dd, y", systemSettings.timezone)
                  )
                ) : (
                  <span>Custom date range</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={date?.from}
                selected={date}
                onSelect={handleDateSelect}
                numberOfMonths={2}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      </CardContent>
    </Card>
  );
}
