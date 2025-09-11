export function getAppUrl() {
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.host}`;
  }
  return import.meta.env.VITE_WEBSITE_URL || "https://aipredictionmarkets.netlify.app";
}