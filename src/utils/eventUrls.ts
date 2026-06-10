
import { UtahRegion } from "@/types/events";

const SUPABASE_FUNCTIONS_BASE = "https://gocvjqljtcxtcrwvfwez.supabase.co/functions/v1";

export const buildEventIcalUrl = (eventId: string) => {
  return `${SUPABASE_FUNCTIONS_BASE}/generate-ical?event=${encodeURIComponent(eventId)}`;
};

export const generateICalUrl = (selectedGroups: string[], selectedTags: string[], selectedRegions: UtahRegion[], excludeOnline: boolean) => {
  const params = new URLSearchParams();
  if (selectedGroups.length > 0) {
    params.set('groups', selectedGroups.join(','));
  }
  if (selectedTags.length > 0) {
    params.set('tags', selectedTags.join(','));
  }
  if (selectedRegions.length > 0) {
    params.set('regions', selectedRegions.join(','));
  }
  if (excludeOnline) {
    params.set('excludeOnline', 'true');
  }
  
  return `https://gocvjqljtcxtcrwvfwez.supabase.co/functions/v1/generate-ical?${params.toString()}`;
};

export const generateRssUrl = (selectedGroups: string[], selectedTags: string[], selectedRegions: UtahRegion[], excludeOnline: boolean) => {
  const params = new URLSearchParams();
  if (selectedGroups.length > 0) {
    params.set('groups', selectedGroups.join(','));
  }
  if (selectedTags.length > 0) {
    params.set('tags', selectedTags.join(','));
  }
  if (selectedRegions.length > 0) {
    params.set('regions', selectedRegions.join(','));
  }
  if (excludeOnline) {
    params.set('excludeOnline', 'true');
  }
  
  return `https://gocvjqljtcxtcrwvfwez.supabase.co/functions/v1/generate-rss?${params.toString()}`;
};
