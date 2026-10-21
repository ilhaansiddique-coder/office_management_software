import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, CheckCircle, Info, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAlertManager } from '@/hooks/useAlertManager';
import { cn } from '@/lib/utils';

interface GlobalAlertBannerProps {
  className?: string;
}

const alertIcons = {
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle,
  info: Info,
};

const alertVariants = {
  success: 'default',
  warning: 'default',
  error: 'destructive',
  info: 'default',
} as const;

export const GlobalAlertBanner: React.FC<GlobalAlertBannerProps> = ({ className }) => {
  const { alerts, dismissAlert, isLoading } = useAlertManager();
  const [visibleAlerts, setVisibleAlerts] = useState<string[]>([]);

  // Show alerts with a slight delay for better UX
  useEffect(() => {
    if (!isLoading && alerts.length > 0) {
      const timer = setTimeout(() => {
        setVisibleAlerts(alerts.map(alert => alert.id));
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [alerts, isLoading]);

  const handleDismiss = (alertId: string) => {
    setVisibleAlerts(prev => prev.filter(id => id !== alertId));
    dismissAlert(alertId);
  };

  if (isLoading || visibleAlerts.length === 0) {
    return null;
  }

  return (
    <div className={cn('fixed top-0 left-0 right-0 z-50 p-4 space-y-2', className)}>
      {alerts
        .filter(alert => visibleAlerts.includes(alert.id))
        .map((alert) => {
          const IconComponent = alertIcons[alert.type];
          const variant = alertVariants[alert.type];
          
          return (
            <Alert
              key={alert.id}
              variant={variant}
              className="max-w-4xl mx-auto shadow-lg border-l-4 animate-in slide-in-from-top-2 duration-300"
            >
              <IconComponent className="h-4 w-4" />
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {alert.title && (
                    <AlertTitle className="font-semibold">
                      {alert.title}
                    </AlertTitle>
                  )}
                  <AlertDescription className="mt-1">
                    {alert.message}
                  </AlertDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDismiss(alert.id)}
                  className="ml-2 h-6 w-6 p-0 hover:bg-base-content/10"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </Alert>
          );
        })}
    </div>
  );
};
