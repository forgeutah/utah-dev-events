
import { useMemo } from "react";
import { parseISO, isSameDay, startOfToday } from "date-fns";
import { Event, Group } from "@/types/events";

export const useEventFiltering = (
  events: Event[],
  groups: Group[],
  allTags: string[],
  selectedGroups: string[],
  selectedTags: string[],
  selectedDate: Date | null
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

  // Filter events based on selected groups, tags, and date using OR logic
  const filteredEvents = useMemo(() => {
    return upcomingEvents.filter((event: Event) => {
      console.log('Filtering event:', event.title, {
        eventGroupId: event.group_id,
        eventTags: event.tags,
        groupTags: event.groups?.tags,
        selectedGroups,
        selectedTags,
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
      
      // If no group or tag filters are selected, show all events (that passed the date filter)
      if (selectedGroups.length === 0 && selectedTags.length === 0) {
        console.log('No filters selected, showing event:', event.title);
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
  }, [upcomingEvents, selectedGroups, selectedTags, selectedDate]);

  console.log('Final filtered events count:', filteredEvents.length);

  return {
    allAvailableTags,
    filteredEvents
  };
};
