import { useEffect } from 'react';
import { useBusinessSettings } from './useBusinessSettings';
import { usePageTitle } from './usePageTitle';

export const useFavicon = () => {
  const { businessSettings } = useBusinessSettings();
  
  // Also update page title
  usePageTitle();

  useEffect(() => {
    const updateFavicon = async () => {
      if (businessSettings?.logo_url) {
        try {
          // Create a canvas to convert the logo to favicon format
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = 32;
          canvas.height = 32;

          const img = new Image();
          img.crossOrigin = 'anonymous';
          
          img.onload = () => {
            if (ctx) {
              // Draw the logo on canvas
              ctx.drawImage(img, 0, 0, 32, 32);
              
              // Convert to data URL
              const dataURL = canvas.toDataURL('image/png');
              
              // Update favicon
              const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement || document.createElement('link');
              link.type = 'image/x-icon';
              link.rel = 'shortcut icon';
              link.href = dataURL;
              document.getElementsByTagName('head')[0].appendChild(link);
            }
          };
          
          img.onerror = () => {
            // If logo fails to load, use default favicon
            const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement || document.createElement('link');
            link.type = 'image/x-icon';
            link.rel = 'shortcut icon';
            link.href = '/favicon.ico';
            document.getElementsByTagName('head')[0].appendChild(link);
          };
          
          img.src = businessSettings.logo_url;
        } catch (error) {
          console.error('Error updating favicon:', error);
          // Fallback to default favicon
          const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement || document.createElement('link');
          link.type = 'image/x-icon';
          link.rel = 'shortcut icon';
          link.href = '/favicon.ico';
          document.getElementsByTagName('head')[0].appendChild(link);
        }
      } else {
        // Use default favicon if no logo
        const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement || document.createElement('link');
        link.type = 'image/x-icon';
        link.rel = 'shortcut icon';
        link.href = '/favicon.ico';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
    };

    updateFavicon();
  }, [businessSettings?.logo_url]);
};
