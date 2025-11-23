import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Custom hook to get the current full URL of the application
 * @returns The complete URL (protocol + domain + path)
 */
export const useCurrentUrl = (): string => {
  const location = useLocation();
  const [currentUrl, setCurrentUrl] = useState<string>('');

  useEffect(() => {
    // Get the base URL from window.location
    const baseUrl = `${window.location.protocol}//${window.location.host}`;

    // Combine with current path from react-router
    const fullUrl = `${baseUrl}${location.pathname}${location.search}${location.hash}`;

    setCurrentUrl(fullUrl);
  }, [location]);

  return currentUrl;
};