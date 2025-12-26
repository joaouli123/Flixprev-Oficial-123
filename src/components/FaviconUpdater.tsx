import React, { useEffect } from 'react';
import { useAppSettings } from '@/components/AppSettingsProvider';

const FaviconUpdater: React.FC = () => {
  const { settings } = useAppSettings();

  useEffect(() => {
    if (settings?.favicon_url) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = settings.favicon_url;
    } else {
      // Optionally remove favicon if no URL is set
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (link) {
        link.remove();
      }
    }
  }, [settings?.favicon_url]);

  return null; // This component doesn't render anything
};

export default FaviconUpdater;
