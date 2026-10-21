import { useState, useCallback, useEffect } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';
import { dismissibleToast } from '@/components/DismissibleToast';

interface Alert {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'warning' | 'error' | 'info';
  category: 'system' | 'business' | 'user';
  persistent?: boolean;
  createdAt: Date;
}

interface AlertManagerState {
  alerts: Alert[];
  dismissedAlerts: string[];
  isLoading: boolean;
}

export const useAlertManager = () => {
  const { user } = useAuth();
  const [state, setState] = useState<AlertManagerState>({
    alerts: [],
    dismissedAlerts: [],
    isLoading: true,
  });

  // Load dismissed alerts from localStorage and database
  useEffect(() => {
    const loadDismissedAlerts = async () => {
      try {
        // Load from localStorage first
        const localDismissed = JSON.parse(localStorage.getItem('dismissedAlerts') || '[]');
        
        // Load from database if user is authenticated
        let dbDismissed: string[] = [];
        if (user) {
          const { data, error } = await supabase
            .from('dismissed_alerts')
            .select('alert_id')
            .eq('user_id', user.id);
          
          if (!error && data) {
            dbDismissed = data.map(item => item.alert_id);
          }
        }
        
        // Combine and deduplicate
        const allDismissed = [...new Set([...localDismissed, ...dbDismissed])];
        
        setState(prev => ({
          ...prev,
          dismissedAlerts: allDismissed,
          isLoading: false,
        }));
      } catch (error) {
        console.error('Failed to load dismissed alerts:', error);
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    loadDismissedAlerts();
  }, [user]);

  // Save dismissed alerts to localStorage and database
  const saveDismissedAlert = useCallback(async (alertId: string) => {
    try {
      // Save to localStorage
      const currentDismissed = JSON.parse(localStorage.getItem('dismissedAlerts') || '[]');
      const updatedDismissed = [...currentDismissed, alertId];
      localStorage.setItem('dismissedAlerts', JSON.stringify(updatedDismissed));
      
      // Save to database if user is authenticated
      if (user) {
        await supabase
          .from('dismissed_alerts')
          .insert({
            user_id: user.id,
            alert_id: alertId,
            dismissed_at: new Date().toISOString(),
          })
          .onConflict(['user_id', 'alert_id'])
          .ignore();
      }
    } catch (error) {
      console.error('Failed to save dismissed alert:', error);
    }
  }, [user]);

  // Dismiss an alert
  const dismissAlert = useCallback(async (alertId: string) => {
    setState(prev => ({
      ...prev,
      dismissedAlerts: [...prev.dismissedAlerts, alertId],
    }));
    
    await saveDismissedAlert(alertId);
  }, [saveDismissedAlert]);

  // Show a toast notification
  const showToast = useCallback((alert: Omit<Alert, 'id' | 'createdAt'>) => {
    const alertId = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    dismissibleToast[alert.type](
      alert.message,
      alert.title,
      {
        id: alertId,
        duration: alert.persistent ? 0 : 5000, // Persistent alerts don't auto-dismiss
      }
    );
    
    return alertId;
  }, []);

  // Show a persistent alert (stays until dismissed)
  const showPersistentAlert = useCallback((alert: Omit<Alert, 'id' | 'createdAt' | 'persistent'>) => {
    const alertId = `persistent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const newAlert: Alert = {
      ...alert,
      id: alertId,
      persistent: true,
      createdAt: new Date(),
    };
    
    setState(prev => ({
      ...prev,
      alerts: [...prev.alerts, newAlert],
    }));
    
    return alertId;
  }, []);

  // Remove an alert from the list
  const removeAlert = useCallback((alertId: string) => {
    setState(prev => ({
      ...prev,
      alerts: prev.alerts.filter(alert => alert.id !== alertId),
    }));
  }, []);

  // Clear all alerts
  const clearAllAlerts = useCallback(() => {
    setState(prev => ({
      ...prev,
      alerts: [],
    }));
  }, []);

  // Get filtered alerts (excluding dismissed ones)
  const getActiveAlerts = useCallback(() => {
    return state.alerts.filter(alert => !state.dismissedAlerts.includes(alert.id));
  }, [state.alerts, state.dismissedAlerts]);

  // Check if an alert is dismissed
  const isAlertDismissed = useCallback((alertId: string) => {
    return state.dismissedAlerts.includes(alertId);
  }, [state.dismissedAlerts]);

  return {
    alerts: getActiveAlerts(),
    dismissedAlerts: state.dismissedAlerts,
    isLoading: state.isLoading,
    dismissAlert,
    showToast,
    showPersistentAlert,
    removeAlert,
    clearAllAlerts,
    isAlertDismissed,
  };
};
