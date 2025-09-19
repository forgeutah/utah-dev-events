
import { useMemo } from "react";
import { parseISO, isSameDay, startOfToday } from "date-fns";
import { Event, Group, UtahRegion } from "@/types/events";
import { categorizeEventByRegion, isOnlineEvent } from "@/utils/locationUtils";
import { getDeduplicatedEvents } from "@/utils/eventDeduplication";

export const useEventFiltering = (
  events: Event[],
  groups: Group[],
  allTags: string[],
  selectedGroups: string[],
  selectedTags: string[],
  selectedDate: Date | null,
  selectedRegions: UtahRegion[] = [],
  excludeOnline: boolean = false
) => {
  // Extract all tags from groups and events combined
  const allAvailableTags = useMemo(() => {
    return [...new Set([
      ...allTags,
      ...groups
        .filter(group => group.tags && group.tags.length > 0)
        .flatMap(group => group.tags || [])
    ])].sort();
  }, [allTags, groups]);

  // Filter events to only show today and future events
  const upcomingEvents = useMemo(() => {
    return events?.filter((event: Event) => {
      const eventDate = parseISO(event.event_date);
      const today = startOfToday();
      return eventDate >= today;
    }) || [];
  }, [events]);

  // Filter events based on selected groups, tags, date, regions, and online status
  const filteredEvents = useMemo(() => {
    // First deduplicate events to remove duplicates
    const deduplicatedEvents = getDeduplicatedEvents(upcomingEvents);
    
    return deduplicatedEvents.filter((event: Event) => {
      console.log('Filtering event:', event.title, {
        eventGroupId: event.group_id,
        eventTags: event.tags,
        groupTags: event.groups?.tags,
        selectedGroups,
        selectedTags,
        selectedRegions,
        excludeOnline,
        groupStatus: event.groups?.status
      });

      // Only show event if group is null (unlisted) or group.status is approved
      if (event.groups && event.groups.status !== "approved") {
        console.log('Event filtered out due to group status:', event.title);
        return false;
      }
      
      // Filter by selected date first
      if (selectedDate) {
        const eventDate = parseISO(event.event_date);
        if (!isSameDay(eventDate, selectedDate)) {
          console.log('Event filtered out due to date:', event.title);
          return false;
        }
      }
      
      // Filter out online events if excludeOnline is true
      if (excludeOnline && isOnlineEvent(event)) {
        console.log('Event filtered out - online event:', event.title);
        return false;
      }
      
      // Filter by selected regions
      if (selectedRegions.length > 0) {
        const eventRegion = categorizeEventByRegion(event);
        if (!selectedRegions.includes(eventRegion)) {
          console.log('Event filtered out due to region:', event.title, eventRegion);
          return false;
        }
      }
      
      // If no group or tag filters are selected, show all events (that passed other filters)
      if (selectedGroups.length === 0 && selectedTags.length === 0) {
        console.log('No group/tag filters selected, showing event:', event.title);
        return true;
      }
      
      // Check if event matches any selected group
      const matchesGroup = selectedGroups.length > 0 && event.group_id && selectedGroups.includes(event.group_id);
      
      // Check if event matches any selected tag
      // Use event tags if available, otherwise fall back to group tags
      const eventTagsToCheck = event.tags && event.tags.length > 0 
        ? event.tags 
        : (event.groups?.tags || []);
      
      const matchesTag = selectedTags.length > 0 && eventTagsToCheck.some((tag: string) => selectedTags.includes(tag));
      
      console.log('Filter results for event:', event.title, {
        matchesGroup,
        matchesTag,
        eventTagsToCheck,
        hasGroupFilters: selectedGroups.length > 0,
        hasTagFilters: selectedTags.length > 0
      });
      
      // If both filters are active, event must match at least one
      if (selectedGroups.length > 0 && selectedTags.length > 0) {
        const result = matchesGroup || matchesTag;
        console.log('Both filters active, OR result:', result);
        return result;
      }
      
      // If only group filter is active
      if (selectedGroups.length > 0 && selectedTags.length === 0) {
        console.log('Only group filter active, result:', matchesGroup);
        return matchesGroup;
      }
      
      // If only tag filter is active
      if (selectedTags.length > 0 && selectedGroups.length === 0) {
        console.log('Only tag filter active, result:', matchesTag);
        return matchesTag;
      }
      
      // Fallback - should not reach here
      console.log('Fallback case, showing event:', event.title);
      return true;
    });
  }, [upcomingEvents, selectedGroups, selectedTags, selectedDate, selectedRegions, excludeOnline]);

  console.log('Final filtered events count:', filteredEvents.length);

  return {
    allAvailableTags,
    filteredEvents
  };
};
