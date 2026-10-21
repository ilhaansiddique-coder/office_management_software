import React, { useState } from 'react';
import { X, AlertTriangle, CheckCircle, Info, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface DismissibleAlertProps {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'warning' | 'error' | 'info';
  time?: string;
  onDismiss?: (id: string) => void;
  className?: string;
  variant?: 'card' | 'inline';
}

const alertIcons = {
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle,
  info: Info,
};

const alertVariants = {
  success: {
    bg: 'bg-success/12 dark:bg-success/85',
    border: 'border-success/35 dark:border-success/50',
    text: 'text-success dark:text-success/80',
    icon: 'text-success dark:text-success',
  },
  warning: {
    bg: 'bg-warning/12 dark:bg-warning/85',
    border: 'border-warning/35 dark:border-warning/50',
    text: 'text-warning dark:text-warning/80',
    icon: 'text-warning dark:text-warning',
  },
  error: {
    bg: 'bg-error/12 dark:bg-error/85',
    border: 'border-error/35 dark:border-error/50',
    text: 'text-error dark:text-error/80',
    icon: 'text-error dark:text-error',
  },
  info: {
    bg: 'bg-info/12 dark:bg-info/85',
    border: 'border-info/35 dark:border-info/50',
    text: 'text-info dark:text-info/80',
    icon: 'text-info dark:text-info',
  },
};

export const DismissibleAlert: React.FC<DismissibleAlertProps> = ({
  id,
  title,
  message,
  type,
  time,
  onDismiss,
  className,
  variant = 'card',
}) => {
  const [isDismissed, setIsDismissed] = useState(false);
  const IconComponent = alertIcons[type];
  const variantStyles = alertVariants[type];

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.(id);
  };

  if (isDismissed) {
    return null;
  }

  if (variant === 'inline') {
    return (
      <div
        className={cn(
          'flex items-start gap-3 p-3 rounded-lg border',
          variantStyles.bg,
          variantStyles.border,
          className
        )}
      >
        <IconComponent className={cn('h-5 w-5 mt-0.5 flex-shrink-0', variantStyles.icon)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className={cn('font-medium text-sm', variantStyles.text)}>{title}</p>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  type === 'error' ? 'destructive' :
                  type === 'warning' ? 'secondary' :
                  'outline'
                }
                className="text-xs"
              >
                {type}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="h-6 w-6 p-0 hover:bg-base-content/10"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className={cn('text-sm mt-1', variantStyles.text)}>{message}</p>
          {time && (
            <p className={cn('text-xs mt-1 opacity-75', variantStyles.text)}>{time}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card className={cn('border-l-4', variantStyles.border, className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className={cn('flex items-center gap-2 text-sm', variantStyles.text)}>
            <IconComponent className={cn('h-4 w-4', variantStyles.icon)} />
            {title}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge
              variant={
                type === 'error' ? 'destructive' :
                type === 'warning' ? 'secondary' :
                'outline'
              }
              className="text-xs"
            >
              {type}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="h-6 w-6 p-0 hover:bg-base-content/10"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className={cn('text-sm', variantStyles.text)}>{message}</p>
        {time && (
          <p className={cn('text-xs mt-2 opacity-75', variantStyles.text)}>{time}</p>
        )}
      </CardContent>
    </Card>
  );
};
