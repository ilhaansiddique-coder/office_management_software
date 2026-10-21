import React from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DismissibleToastProps {
  id?: string;
  title?: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const showDismissibleToast = ({
  id,
  title,
  message,
  type,
  duration = 5000,
  action,
}: DismissibleToastProps) => {
  const toastId = id || `toast-${Date.now()}`;
  
  const toastOptions = {
    id: toastId,
    duration,
    action: action ? {
      label: action.label,
      onClick: action.onClick,
    } : undefined,
    cancel: {
      label: 'Dismiss',
      onClick: () => toast.dismiss(toastId),
    },
  };

  switch (type) {
    case 'success':
      return toast.success(message, {
        ...toastOptions,
        description: title,
      });
    case 'error':
      return toast.error(message, {
        ...toastOptions,
        description: title,
      });
    case 'warning':
      return toast.warning(message, {
        ...toastOptions,
        description: title,
      });
    case 'info':
      return toast.info(message, {
        ...toastOptions,
        description: title,
      });
    default:
      return toast(message, {
        ...toastOptions,
        description: title,
      });
  }
};

// Enhanced toast functions with built-in dismiss functionality
export const dismissibleToast = {
  success: (message: string, title?: string, options?: Partial<DismissibleToastProps>) => 
    showDismissibleToast({ ...options, message, title, type: 'success' }),
  
  error: (message: string, title?: string, options?: Partial<DismissibleToastProps>) => 
    showDismissibleToast({ ...options, message, title, type: 'error' }),
  
  warning: (message: string, title?: string, options?: Partial<DismissibleToastProps>) => 
    showDismissibleToast({ ...options, message, title, type: 'warning' }),
  
  info: (message: string, title?: string, options?: Partial<DismissibleToastProps>) => 
    showDismissibleToast({ ...options, message, title, type: 'info' }),
};

// Utility function to dismiss all toasts
export const dismissAllToasts = () => {
  toast.dismiss();
};

// Utility function to dismiss specific toast
export const dismissToast = (id: string) => {
  toast.dismiss(id);
};
