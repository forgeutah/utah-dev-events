import { Event } from "@/types/events";

/**
 * Calculate similarity between two event titles
 */
function calculateTitleSimilarity(title1: string, title2: string): number {
  const normalize = (str: string) => 
    str.toLowerCase()
       .replace(/[^\w\s]/g, '') // Remove punctuation
       .replace(/\s+/g, ' ')    // Normalize whitespace
       .trim();

  const norm1 = normalize(title1);
  const norm2 = normalize(title2);

  if (norm1 === norm2) return 1.0;

  // Simple word overlap calculation
  const words1 = new Set(norm1.split(' '));
  const words2 = new Set(norm2.split(' '));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * Check if two events are likely duplicates
 */
function areEventsDuplicate(event1: Event, event2: Event): boolean {
  // Same URL = definitely same event
  if (event1.link && event2.link && event1.link === event2.link) {
    return true;
  }

  // High title similarity + same date = likely duplicate
  const titleSimilarity = calculateTitleSimilarity(event1.title, event2.title);
  const sameDate = event1.event_date === event2.event_date;
  
  return titleSimilarity > 0.8 && sameDate;
}

/**
 * Find potential duplicate events
 */
export function findDuplicateEvents(events: Event[]): Array<{ original: Event; duplicates: Event[] }> {
  const duplicateGroups: Array<{ original: Event; duplicates: Event[] }> = [];
  const processed = new Set<string>();

  for (let i = 0; i < events.length; i++) {
    const event1 = events[i];
    
    if (processed.has(event1.id)) continue;
    
    const duplicates: Event[] = [];
    
    for (let j = i + 1; j < events.length; j++) {
      const event2 = events[j];
      
      if (processed.has(event2.id)) continue;
      
      if (areEventsDuplicate(event1, event2)) {
        duplicates.push(event2);
        processed.add(event2.id);
      }
    }
    
    if (duplicates.length > 0) {
      duplicateGroups.push({ original: event1, duplicates });
      processed.add(event1.id);
    }
  }

  return duplicateGroups;
}

/**
 * Get count of potential duplicate events
 */
export function getDuplicateCount(events: Event[]): number {
  const duplicateGroups = findDuplicateEvents(events);
  return duplicateGroups.reduce((total, group) => total + group.duplicates.length, 0);
}

/**
 * Get deduplicated events (removes duplicates, keeps originals)
 */
export function getDeduplicatedEvents(events: Event[]): Event[] {
  const duplicateGroups = findDuplicateEvents(events);
  const duplicateIds = new Set(
    duplicateGroups.flatMap(group => group.duplicates.map(d => d.id))
  );
  
  return events.filter(event => !duplicateIds.has(event.id));
}