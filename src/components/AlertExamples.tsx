import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DismissibleAlert } from '@/components/DismissibleAlert';
import { useAlertManager } from '@/hooks/useAlertManager';
import { dismissibleToast } from '@/components/DismissibleToast';

export const AlertExamples: React.FC = () => {
  const { showPersistentAlert, showToast, clearAllAlerts } = useAlertManager();

  const handleShowSuccessToast = () => {
    showToast({
      title: 'Success!',
      message: 'Operation completed successfully.',
      type: 'success',
      category: 'system',
    });
  };

  const handleShowErrorToast = () => {
    showToast({
      title: 'Error!',
      message: 'Something went wrong. Please try again.',
      type: 'error',
      category: 'system',
    });
  };

  const handleShowWarningToast = () => {
    showToast({
      title: 'Warning!',
      message: 'This action cannot be undone.',
      type: 'warning',
      category: 'system',
    });
  };

  const handleShowInfoToast = () => {
    showToast({
      title: 'Info',
      message: 'Here is some helpful information.',
      type: 'info',
      category: 'system',
    });
  };

  const handleShowPersistentAlert = () => {
    showPersistentAlert({
      title: 'System Maintenance',
      message: 'Scheduled maintenance will occur tonight from 2 AM to 4 AM. Some features may be temporarily unavailable.',
      type: 'warning',
      category: 'system',
    });
  };

  const handleShowBusinessAlert = () => {
    showPersistentAlert({
      title: 'Low Stock Alert',
      message: 'Product "Widget A" is running low on inventory. Consider restocking soon.',
      type: 'error',
      category: 'business',
    });
  };

  const handleClearAllAlerts = () => {
    clearAllAlerts();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Dismissible Alert Examples</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Inline Alert Examples */}
          <div className="space-y-3">
            <h3 className="font-medium">Inline Alerts</h3>
            
            <DismissibleAlert
              id="example-success"
              title="Success Alert"
              message="This is a success message that can be dismissed."
              type="success"
              variant="inline"
            />
            
            <DismissibleAlert
              id="example-warning"
              title="Warning Alert"
              message="This is a warning message that can be dismissed."
              type="warning"
              variant="inline"
            />
            
            <DismissibleAlert
              id="example-error"
              title="Error Alert"
              message="This is an error message that can be dismissed."
              type="error"
              variant="inline"
            />
            
            <DismissibleAlert
              id="example-info"
              title="Info Alert"
              message="This is an info message that can be dismissed."
              type="info"
              variant="inline"
            />
          </div>

          {/* Card Alert Examples */}
          <div className="space-y-3">
            <h3 className="font-medium">Card Alerts</h3>
            
            <DismissibleAlert
              id="example-card-success"
              title="Card Success Alert"
              message="This is a success message in card format that can be dismissed."
              type="success"
              variant="card"
            />
            
            <DismissibleAlert
              id="example-card-warning"
              title="Card Warning Alert"
              message="This is a warning message in card format that can be dismissed."
              type="warning"
              variant="card"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Toast Notification Examples</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={handleShowSuccessToast} variant="outline">
              Success Toast
            </Button>
            <Button onClick={handleShowErrorToast} variant="outline">
              Error Toast
            </Button>
            <Button onClick={handleShowWarningToast} variant="outline">
              Warning Toast
            </Button>
            <Button onClick={handleShowInfoToast} variant="outline">
              Info Toast
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Persistent Alert Examples</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={handleShowPersistentAlert} variant="outline">
              System Alert
            </Button>
            <Button onClick={handleShowBusinessAlert} variant="outline">
              Business Alert
            </Button>
            <Button onClick={handleClearAllAlerts} variant="destructive" className="col-span-2">
              Clear All Alerts
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
