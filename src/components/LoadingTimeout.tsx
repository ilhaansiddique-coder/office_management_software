import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface LoadingTimeoutProps {
  isLoading: boolean;
  timeout?: number; // in milliseconds
  onRetry?: () => void;
  children: React.ReactNode;
}

export const LoadingTimeout = ({ 
  isLoading, 
  timeout = 15000, // 15 seconds default
  onRetry,
  children 
}: LoadingTimeoutProps) => {
  const [showTimeout, setShowTimeout] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShowTimeout(false);
      return;
    }

    const timer = setTimeout(() => {
      setShowTimeout(true);
    }, timeout);

    return () => clearTimeout(timer);
  }, [isLoading, timeout]);

  if (showTimeout && isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Alert className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            The app is taking longer than expected to load. This might be due to:
            <ul className="mt-2 list-disc list-inside text-sm space-y-1">
              <li>Slow network connection</li>
              <li>Large dataset being processed</li>
              <li>Database connection issues</li>
            </ul>
          </AlertDescription>
        </Alert>
        
        {onRetry && (
          <Button 
            onClick={onRetry} 
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Retry Loading
          </Button>
        )}
        
        <div className="text-sm text-muted-foreground">
          If the problem persists, try refreshing the page or contact support.
        </div>
      </div>
    );
  }

  return <>{children}</>;
};


