import { toast as sonnerToast } from 'sonner';

// Enhanced toast functions that automatically include dismiss functionality
export const toast = {
  success: (message: string, options?: any) => {
    return sonnerToast.success(message, {
      ...options,
      cancel: {
        label: 'Dismiss',
        onClick: () => sonnerToast.dismiss(),
      },
      action: options?.action || undefined,
    });
  },

  error: (message: string, options?: any) => {
    return sonnerToast.error(message, {
      ...options,
      cancel: {
        label: 'Dismiss',
        onClick: () => sonnerToast.dismiss(),
      },
      action: options?.action || undefined,
    });
  },

  warning: (message: string, options?: any) => {
    return sonnerToast.warning(message, {
      ...options,
      cancel: {
        label: 'Dismiss',
        onClick: () => sonnerToast.dismiss(),
      },
      action: options?.action || undefined,
    });
  },

  info: (message: string, options?: any) => {
    return sonnerToast.info(message, {
      ...options,
      cancel: {
        label: 'Dismiss',
        onClick: () => sonnerToast.dismiss(),
      },
      action: options?.action || undefined,
    });
  },

  // Generic toast function
  message: (message: string, options?: any) => {
    return sonnerToast(message, {
      ...options,
      cancel: {
        label: 'Dismiss',
        onClick: () => sonnerToast.dismiss(),
      },
      action: options?.action || undefined,
    });
  },

  // Loading toast
  loading: (message: string, options?: any) => {
    return sonnerToast.loading(message, {
      ...options,
    });
  },

  // Dismiss functions
  dismiss: (id?: string) => {
    if (id) {
      sonnerToast.dismiss(id);
    } else {
      sonnerToast.dismiss();
    }
  },

  // Promise-based toasts
  promise: <T>(
    promise: Promise<T>,
    {
      loading,
      success,
      error,
    }: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: any) => string);
    }
  ) => {
    return sonnerToast.promise(promise, {
      loading,
      success,
      error,
    }, {
      cancel: {
        label: 'Dismiss',
        onClick: () => sonnerToast.dismiss(),
      },
    });
  },
};

// Export the enhanced toast as default
export default toast;
