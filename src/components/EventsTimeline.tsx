
import React from "react";
import { format, parseISO, isSameDay, isToday, isTomorrow, isYesterday, isPast, formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock, Users, ExternalLink } from "lucide-react";

interface Event {
  id: string;
  title: string;
  event_date: string;
  start_time?: string;
  location?: string;
  venue_name?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country?: string;
  link?: string;
  description?: string;
  tags?: string[];
  groups?: {
    name: string;
    status: string;
    tags?: string[];
  } | null;
}

interface EventsTimelineProps {
  events: Event[];
  isLoading: boolean;
  error: any;
  visibleCount: number;
  onShowMore: () => void;
}

const formatEventDateTime = (eventDate: string, startTime?: string) => {
  const date = parseISO(eventDate);
  
  // Create full datetime if we have start_time
  let fullDateTime = date;
  if (startTime) {
    const [hours, minutes] = startTime.split(':').map(Number);
    fullDateTime = new Date(date);
    fullDateTime.setHours(hours, minutes);
  }
  
  // Format the time part in AM/PM
  let timeDisplay = "";
  if (startTime) {
    timeDisplay = format(fullDateTime, "h:mm a");
    
    // Add relative time for upcoming events
    if (!isPast(fullDateTime)) {
      const relativeTime = formatDistanceToNow(fullDateTime, { addSuffix: true });
      timeDisplay += ` • ${relativeTime}`;
    }
  }
  
  return { date, timeDisplay };
};

const formatDayHeader = (date: Date) => {
  const monthDay = format(date, "MMM d");
  const dayName = format(date, "EEEE");
  
  if (isToday(date)) {
    return { monthDay, dayName: "Today" };
  } else if (isTomorrow(date)) {
    return { monthDay, dayName: "Tomorrow" };
  } else if (isYesterday(date)) {
    return { monthDay, dayName: "Yesterday" };
  } else {
    return { monthDay, dayName };
  }
};

const buildFullAddress = (event: Event) => {
  const addressParts = [];
  
  if (event.address_line_1) addressParts.push(event.address_line_1);
  if (event.address_line_2) addressParts.push(event.address_line_2);
  if (event.city) addressParts.push(event.city);
  if (event.state_province) addressParts.push(event.state_province);
  if (event.postal_code) addressParts.push(event.postal_code);
  if (event.country) addressParts.push(event.country);
  
  return addressParts.join(', ');
};

const openGoogleMaps = (event: Event) => {
  const fullAddress = buildFullAddress(event);
  const searchQuery = fullAddress || event.venue_name || event.location || '';
  
  if (searchQuery) {
    const encodedLocation = encodeURIComponent(searchQuery);
    const url = `https://www.google.com/maps/search/?api=1&query=${encodedLocation}`;
    window.open(url, '_blank');
  }
};

const getEventTags = (event: Event) => {
  // Use event tags if available, otherwise fall back to group tags
  if (event.tags && event.tags.length > 0) {
    return event.tags;
  }
  
  // Return group tags if event has no tags
  return event.groups?.tags || [];
};

export function EventsTimeline({ events, isLoading, error, visibleCount, onShowMore }: EventsTimelineProps) {
  if (isLoading) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Loading events...
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center text-red-500">
        Failed to load events.
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No events match your current filters.
      </div>
    );
  }

  const visibleEvents = events.slice(0, visibleCount);
  const hasMoreEvents = events.length > visibleCount;

  // Group events by date
  const groupedEvents = visibleEvents.reduce((groups, event) => {
    const { date } = formatEventDateTime(event.event_date, event.start_time);
    const dateKey = format(date, 'yyyy-MM-dd');
    
    if (!groups[dateKey]) {
      groups[dateKey] = {
        date,
        events: []
      };
    }
    
    groups[dateKey].events.push(event);
    return groups;
  }, {} as Record<string, { date: Date; events: Event[] }>);

  // Sort events within each day by start_time
  Object.values(groupedEvents).forEach(group => {
    group.events.sort((a, b) => {
      // Events without start_time should come last
      if (!a.start_time && !b.start_time) return 0;
      if (!a.start_time) return 1;
      if (!b.start_time) return -1;
      
      // Compare start times
      return a.start_time.localeCompare(b.start_time);
    });
  });

  const groupedEventsArray = Object.entries(groupedEvents);

  return (
    <div className="space-y-8 relative">
      {/* Vertical dotted line with fade out */}
      {groupedEventsArray.length > 1 && (
        <div className="absolute left-[3px] top-[32px] w-px h-full">
          <div 
            className="w-full border-l-2 border-dotted border-white/20"
            style={{
              height: 'calc(100% - 120px)',
              background: 'linear-gradient(to bottom, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.2) 80%, transparent 100%)',
              maskImage: 'repeating-linear-gradient(to bottom, transparent 0px, transparent 4px, black 4px, black 8px)',
              WebkitMaskImage: 'repeating-linear-gradient(to bottom, transparent 0px, transparent 4px, black 4px, black 8px)'
            }}
          />
        </div>
      )}
      
      {groupedEventsArray.map(([dateKey, { date, events: dayEvents }], groupIndex) => (
        <div key={dateKey} className="relative">
          {/* Date header with dot */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 relative z-10" />
            <div className="text-white">
              <div className="text-lg font-semibold">
                {formatDayHeader(date).monthDay}{" "}
                <span className="text-gray-400 font-normal">
                  {formatDayHeader(date).dayName}
                </span>
              </div>
            </div>
          </div>

          {/* Events for this date */}
          <div className="ml-6 space-y-4">
            {dayEvents.map((event) => {
              const { timeDisplay } = formatEventDateTime(event.event_date, event.start_time);
              const displayLocation = event.venue_name || event.location;
              const hasAddressInfo = buildFullAddress(event) || event.venue_name || event.location;
              const eventTags = getEventTags(event);
              
              return (
                <div
                  key={event.id}
                  className="bg-gradient-to-br from-[#22243A]/80 via-[#23283B]/80 to-[#383B53]/80 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:border-primary/30 transition-all duration-200"
                >
                  {/* Time and duration */}
                  {timeDisplay && (
                    <div className="flex items-center gap-2 text-sm text-primary mb-3">
                      <Clock className="w-4 h-4" />
                      <span className="font-medium">{timeDisplay}</span>
                    </div>
                  )}

                  {/* Event title */}
                  <h3 className="text-xl font-semibold text-white mb-2">
                    {event.link ? (
                      <a
                        href={event.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white hover:text-primary cursor-pointer transition-colors inline-flex items-center gap-2"
                      >
                        {event.title}
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    ) : (
                      event.title
                    )}
                  </h3>

                  {/* Event description */}
                  {event.description && (
                    <p className="text-muted-foreground text-sm mb-4 line-clamp-2">
                      {event.description}
                    </p>
                  )}

                  {/* Event details */}
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-4">
                    {/* Group */}
                    {event.groups?.name && (
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        <span className="font-semibold">{event.groups.name}</span>
                      </div>
                    )}

                    {/* Location */}
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      <span>{displayLocation || "TBD"}</span>
                    </div>
                  </div>

                  {/* Tags */}
                  {eventTags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {eventTags.map((tag, index) => (
                        <Badge 
                          key={index} 
                          variant="outline" 
                          className="text-xs bg-transparent border-primary/40 text-primary/90 px-2"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      
      {hasMoreEvents && (
        <div className="flex justify-center mt-6">
          <button 
            onClick={onShowMore}
            className="px-6 py-2 text-sm bg-primary/10 text-primary border border-primary rounded-md hover:bg-primary hover:text-black transition-colors"
          >
            Show More ({events.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
