
import React from "react";
import { Tag, ExternalLink } from "lucide-react";
import { format, formatDistanceToNow, isToday, isTomorrow, isYesterday, isPast, parseISO } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
  } | null;
}

interface EventsTableProps {
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
  
  // Format the date part
  let dateDisplay = "";
  if (isToday(date)) {
    dateDisplay = "Today";
  } else if (isTomorrow(date)) {
    dateDisplay = "Tomorrow";
  } else if (isYesterday(date)) {
    dateDisplay = "Yesterday";
  } else {
    dateDisplay = format(date, "EEE, MMM d, yyyy");
  }
  
  // Format the time part in AM/PM
  let timeDisplay = "";
  if (startTime) {
    timeDisplay = format(fullDateTime, "h:mm a");
    
    // Add relative time for upcoming events
    if (!isPast(fullDateTime)) {
      const relativeTime = formatDistanceToNow(fullDateTime, { addSuffix: true });
      timeDisplay += ` (${relativeTime})`;
    }
  }
  
  return { dateDisplay, timeDisplay };
};

export function EventsTable({ events, isLoading, error, visibleCount, onShowMore }: EventsTableProps) {
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

  return (
    <div className="w-full overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="text-muted-foreground text-sm border-b border-border">
            <TableHead className="text-muted-foreground">Event</TableHead>
            <TableHead className="text-muted-foreground">Group</TableHead>
            <TableHead className="text-muted-foreground">Date & Time</TableHead>
            <TableHead className="text-muted-foreground">Location</TableHead>
            <TableHead className="text-muted-foreground">Tags</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleEvents.map((event) => {
            const { dateDisplay, timeDisplay } = formatEventDateTime(event.event_date, event.start_time);
            const displayLocation = event.venue_name || event.location;
            
            return (
              <TableRow key={event.id} className="border-b border-border hover:bg-white/5 transition">
                <TableCell className="text-white font-medium">
                  <div>
                    <div className="font-medium">
                      {event.link ? (
                        <a
                          href={event.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-white hover:text-primary cursor-pointer transition-colors inline-flex items-center gap-1"
                        >
                          {event.title}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        event.title
                      )}
                    </div>
                    {event.description && (
                      <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {event.description}
                      </div>
                    )}
                  </div>
                </TableCell>
                
                <TableCell className="text-muted-foreground">
                  {event.groups?.name || ""}
                </TableCell>
                
                <TableCell className="text-muted-foreground">
                  <div className="flex flex-col">
                    <span>{dateDisplay}</span>
                    {timeDisplay && (
                      <span className="text-sm">{timeDisplay}</span>
                    )}
                  </div>
                </TableCell>
                
                <TableCell className="text-muted-foreground">
                  {displayLocation || "TBD"}
                </TableCell>
                
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {event.tags && event.tags.length > 0 ? (
                      event.tags.map((tag, index) => (
                        <Badge 
                          key={index} 
                          variant="outline" 
                          className="text-xs bg-transparent border-primary text-primary px-2"
                        >
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground italic">No tags</span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      
      {hasMoreEvents && (
        <div className="flex justify-center mt-6">
          <Button 
            onClick={onShowMore}
            variant="outline"
            className="text-primary border-primary hover:bg-primary hover:text-black"
          >
            Show More ({events.length - visibleCount} remaining)
          </Button>
        </div>
      )}
    </div>
  );
}
