// Shared location utilities usable by frontend and Deno serverless functions
// Keep this file free of project-specific types so it can be imported by Deno

// Salt Lake County cities/areas
const SALT_LAKE_COUNTY = [
  'salt lake city', 'west valley city', 'west jordan', 'sandy', 'murray', 
  'taylorsville', 'south salt lake', 'millcreek', 'draper', 'riverton',
  'cottonwood heights', 'holladay', 'midvale', 'south jordan', 'herriman',
  'bluffdale', 'alta', 'magna', 'kearns', 'west valley'
];

// Utah County cities/areas
const UTAH_COUNTY = [
  'provo', 'orem', 'american fork', 'lehi', 'pleasant grove', 'springville',
  'spanish fork', 'payson', 'lindon', 'highland', 'alpine', 'cedar hills',
  'saratoga springs', 'eagle mountain', 'mapleton', 'vineyard', 'salem',
  'santaquin', 'elk ridge', 'genola', 'goshen'
];

// Northern Utah cities/areas
const NORTHERN_UTAH = [
  'ogden', 'layton', 'bountiful', 'roy', 'clearfield', 'kaysville', 'clinton',
  'north salt lake', 'centerville', 'farmington', 'woods cross', 'west point',
  'syracuse', 'logan', 'brigham city', 'tremonton', 'hyrum', 'smithfield',
  'richmond', 'providence', 'north logan', 'river heights', 'nibley'
];

// Southern Utah cities/areas
const SOUTHERN_UTAH = [
  'st george', 'saint george', 'cedar city', 'hurricane', 'washington', 'ivins',
  'santa clara', 'leeds', 'la verkin', 'toquerville', 'enterprise', 'veyo',
  'summit', 'dammeron valley', 'springdale', 'rockville', 'virgin', 'hildale',
  'orderville', 'glendale', 'alton', 'duck creek village', 'brian head',
  'parowan', 'paragonah', 'enoch', 'minersville', 'beaver', 'milford'
];

// Online event indicators (prefer exact words / platforms)
// Avoid overly generic words like 'meet' that cause false positives when used in titles.
const ONLINE_INDICATORS = [
  'online', 'virtual', 'remote', 'zoom', 'teams', 'webinar',
  'livestream', 'livestreaming', 'stream', 'digital', 'internet', 'web-based',
  'video call', 'video conference', 'teleconference', 'hangout', 'discord'
];

// Platforms that often indicate online events (match as word boundaries)
const PLATFORM_WORDS = ['zoom', 'google meet', 'teams', 'webex', 'gotomeeting', 'jitsi', 'discord'];

// Regex to detect urls (http/https) or meeting links
const URL_REGEX = /https?:\/\/[\w\-./?=&%#]+/i;

export type UtahRegion =
  | 'Salt Lake County'
  | 'Utah County'
  | 'Northern Utah'
  | 'Southern Utah'
  | 'Unknown';

export function categorizeEventByRegion(event: Record<string, any>): UtahRegion {
  // Combine all location-related fields for analysis
  const locationText = [
    event.location,
    event.venue_name,
    event.city,
    event.address_line_1,
    event.address_line_2,
  ].filter(Boolean).join(' ').toLowerCase();

  if (!locationText) {
    return 'Unknown';
  }

  // Check each region
  if (SALT_LAKE_COUNTY.some(city => locationText.includes(city))) {
    return 'Salt Lake County';
  }
  
  if (UTAH_COUNTY.some(city => locationText.includes(city))) {
    return 'Utah County';
  }
  
  if (NORTHERN_UTAH.some(city => locationText.includes(city))) {
    return 'Northern Utah';
  }
  
  if (SOUTHERN_UTAH.some(city => locationText.includes(city))) {
    return 'Southern Utah';
  }

  return 'Unknown';
}

export function isOnlineEvent(event: Record<string, any>): boolean {
  // Prefer venue/location fields as stronger signals for in-person vs online
  const venueText = [event.location, event.venue_name].filter(Boolean).join(' ').toLowerCase();
  const contentText = [event.description, event.title].filter(Boolean).join(' ').toLowerCase();

  // If venue or location explicitly indicate online/platform, classify as online
  if (venueText) {
    // If venue contains a platform word (e.g., 'Zoom') or a URL, it's online
    if (PLATFORM_WORDS.some(p => new RegExp(`\\b${escapeRegex(p)}\\b`, 'i').test(venueText))) {
      return true;
    }

    if (URL_REGEX.test(venueText)) return true;

    // If venue contains words like 'online' or 'virtual', it's online
    if (ONLINE_INDICATORS.some(ind => new RegExp(`\\b${escapeRegex(ind)}\\b`, 'i').test(venueText))) {
      return true;
    }

    // Presence of a physical address or city name in venueText should strongly indicate in-person
    const hasPhysical = /\d{1,5}\s+\w+/.test(venueText) || /\b(street|st\.|avenue|ave\.|road|rd\.|lane|ln\.|drive|dr\.)\b/i.test(venueText);
    if (hasPhysical) return false;
  }

  // If no venue/location signals, consider title/description but use stricter matching
  if (contentText) {
    // If there's a meeting URL in content, it's online
    if (URL_REGEX.test(contentText)) return true;

    // If platform words appear in content (with word boundaries) consider online
    if (PLATFORM_WORDS.some(p => new RegExp(`\\b${escapeRegex(p)}\\b`, 'i').test(contentText))) return true;

    // Finally check other online indicators but with word boundaries to avoid partial matches
    if (ONLINE_INDICATORS.some(ind => new RegExp(`\\b${escapeRegex(ind)}\\b`, 'i').test(contentText))) {
      return true;
    }
  }

  return false;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&');
}

export function getRegionDisplayName(region: UtahRegion): string {
  return region;
}

export const UTAH_REGIONS: UtahRegion[] = [
  'Salt Lake County',
  'Utah County', 
  'Northern Utah',
  'Southern Utah',
  'Unknown'
];
