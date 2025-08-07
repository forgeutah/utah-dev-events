
import { UtahRegion } from "@/types/events";

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
