import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from "@/utils/toast";

interface CourierNameSelectorProps {
  saleId: string;
  currentCourierName?: string;
  onCourierNameUpdate?: (newCourierName: string) => void;
  disabled?: boolean;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'dropdown' | 'inline';
}

const COURIER_NAMES = [
  { value: 'Sundorban', label: 'Sundorban', color: 'bg-info/12 text-info border-info/35' },
  { value: 'Janani', label: 'Janani', color: 'bg-success/12 text-success border-success/35' },
  { value: 'SR', label: 'SR', color: 'bg-secondary/12 text-secondary border-secondary/35' },
  { value: 'AJR', label: 'AJR', color: 'bg-warning/12 text-warning border-warning/35' },
  { value: 'Karatoa', label: 'Karatoa', color: 'bg-error/12 text-error border-error/35' },
  { value: 'Bangladesh', label: 'Bangladesh', color: 'bg-secondary/12 text-secondary border-secondary/35' },
  { value: 'Ahmed', label: 'Ahmed', color: 'bg-accent/12 text-accent border-accent/35' },
  { value: 'Steadfast', label: 'Steadfast', color: 'bg-info/12 text-info border-info/35' },
  { value: 'Pathao', label: 'Pathao', color: 'bg-error/12 text-error border-error/35' },
  { value: 'SA', label: 'SA', color: 'bg-warning/12 text-warning border-warning/35' },
];

export function CourierNameSelector({
  saleId,
  currentCourierName,
  onCourierNameUpdate,
  disabled = false,
  size = 'default',
  variant = 'dropdown'
}: CourierNameSelectorProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedCourierName, setSelectedCourierName] = useState(currentCourierName || '');

  const handleCourierNameChange = async (newCourierName: string) => {
    if (newCourierName === currentCourierName || isUpdating) return;

    setIsUpdating(true);
    try {
      // Update the sale in the database
      const { error } = await supabase
        .from('sales')
        .update({
          courier_name: newCourierName || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', saleId);

      if (error) {
        throw error;
      }

      setSelectedCourierName(newCourierName);
      onCourierNameUpdate?.(newCourierName);

      toast.success(`Courier assigned: ${newCourierName || 'None'}`, {
        description: `Courier name has been updated`,
        duration: 3000,
      });

    } catch (error) {
      console.error('Error updating courier name:', error);
      toast.error('Failed to update courier name', {
        description: 'Please try again or contact support',
        duration: 5000,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const getCourierNameColor = (courierName: string) => {
    return COURIER_NAMES.find(c => c.value === courierName)?.color || 'bg-base-100 text-base-content border-base-300';
  };

  const getCourierNameLabel = (courierName: string) => {
    return COURIER_NAMES.find(c => c.value === courierName)?.label || courierName || 'Not Assigned';
  };

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-2">
        <Select
          value={selectedCourierName}
          onValueChange={handleCourierNameChange}
          disabled={disabled || isUpdating}
        >
          <SelectTrigger className={cn(
            "w-auto min-w-[140px]",
            size === 'sm' && "h-8 text-xs",
            size === 'lg' && "h-12 text-base"
          )}>
            <SelectValue placeholder="Select courier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="text-xs bg-base-100 text-base-content border-base-300"
                >
                  Not Assigned
                </Badge>
              </div>
            </SelectItem>
            {COURIER_NAMES.map((courier) => (
              <SelectItem key={courier.value} value={courier.value}>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn("text-xs", courier.color)}
                  >
                    {courier.label}
                  </Badge>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isUpdating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Courier:</span>
        <Badge
          variant="outline"
          className={cn("text-sm", getCourierNameColor(selectedCourierName))}
        >
          {getCourierNameLabel(selectedCourierName)}
        </Badge>
        {isUpdating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <Select
        value={selectedCourierName}
        onValueChange={handleCourierNameChange}
        disabled={disabled || isUpdating}
      >
        <SelectTrigger className={cn(
          "w-full",
          size === 'sm' && "h-8 text-xs",
          size === 'lg' && "h-12 text-base"
        )}>
          <SelectValue placeholder="Select courier" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="text-xs bg-base-100 text-base-content border-base-300"
              >
                Not Assigned
              </Badge>
            </div>
          </SelectItem>
          {COURIER_NAMES.map((courier) => (
            <SelectItem key={courier.value} value={courier.value}>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn("text-xs", courier.color)}
                >
                  {courier.label}
                </Badge>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

