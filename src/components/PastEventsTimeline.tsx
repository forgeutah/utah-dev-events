import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, ExternalLink, PlayCircle, Upload } from "lucide-react";
import SubmitRecordingModal from "./SubmitRecordingModal";
import { parseRecordingHostname } from "@/utils/recordingUrl";
import { RECORDING_STATUS, type Event } from "@/types/events";

interface PastEventsTimelineProps {
  events: Event[];
  isLoading: boolean;
  error: unknown;
  visibleCount: number;
  onShowMore: () => void;
}

const formatPastEventTime = (eventDate: string, startTime?: string) => {
  const date = parseISO(eventDate);
  let timeDisplay = "";
  if (startTime) {
    const [hours, minutes] = startTime.slice(0, 5).split(":").map(Number);
    const dt = new Date(date);
    dt.setHours(hours, minutes);
    timeDisplay = format(dt, "h:mm a");
  }
  return { date, timeDisplay };
};

const buildFullAddress = (event: Event) => {
  const parts = [];
  if (event.address_line_1) parts.push(event.address_line_1);
  if (event.address_line_2) parts.push(event.address_line_2);
  if (event.city) parts.push(event.city);
  if (event.state_province) parts.push(event.state_province);
  if (event.postal_code) parts.push(event.postal_code);
  if (event.country) parts.push(event.country);
  return parts.join(", ");
};

const getEventTags = (event: Event) => {
  if (event.tags && event.tags.length > 0) return event.tags;
  return event.groups?.tags || [];
};

export function PastEventsTimeline({ events, isLoading, error, visibleCount, onShowMore }: PastEventsTimelineProps) {
  const [submitEvent, setSubmitEvent] = useState<Event | null>(null);

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading events...</div>;
  }
  if (error) {
    return <div className="py-8 text-center text-red-500">Failed to load events.</div>;
  }
  if (events.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No past events match your current filters.
      </div>
    );
  }

  const visibleEvents = events.slice(0, visibleCount);
  const hasMore = events.length > visibleCount;

  // Group by date; sort keys DESC (newest past first).
  const grouped = visibleEvents.reduce((groups, event) => {
    const dateKey = event.event_date;
    if (!groups[dateKey]) {
      groups[dateKey] = { date: parseISO(dateKey), events: [] };
    }
    groups[dateKey].events.push(event);
    return groups;
  }, {} as Record<string, { date: Date; events: Event[] }>);

  Object.values(grouped).forEach((group) => {
    group.events.sort((a, b) => {
      if (!a.start_time && !b.start_time) return 0;
      if (!a.start_time) return 1;
      if (!b.start_time) return -1;
      return a.start_time.localeCompare(b.start_time);
    });
  });

  const groupedArray = Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));

  return (
    <>
      <div className="space-y-8 relative">
        {groupedArray.length > 1 && (
          <div className="absolute left-[3px] top-[32px] w-px h-full">
            <div
              className="w-full border-l-2 border-dotted border-white/20"
              style={{
                height: "calc(100% - 120px)",
                background:
                  "linear-gradient(to bottom, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.2) 80%, transparent 100%)",
                maskImage:
                  "repeating-linear-gradient(to bottom, transparent 0px, transparent 4px, black 4px, black 8px)",
                WebkitMaskImage:
                  "repeating-linear-gradient(to bottom, transparent 0px, transparent 4px, black 4px, black 8px)",
              }}
            />
          </div>
        )}

        {groupedArray.map(([dateKey, { date, events: dayEvents }]) => (
          <div key={dateKey} className="relative">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 relative z-10" />
              <div className="text-white">
                <div className="text-lg font-semibold">
                  {format(date, "MMM d, yyyy")}{" "}
                  <span className="text-gray-400 font-normal">{format(date, "EEEE")}</span>
                </div>
              </div>
            </div>

            <div className="ml-6 space-y-4">
              {dayEvents.map((event) => {
                const { timeDisplay } = formatPastEventTime(event.event_date, event.start_time);
                const displayLocation = event.venue_name || event.location;
                const eventTags = getEventTags(event);
                const hasApprovedRecording =
                  event.recording_status === RECORDING_STATUS.Approved && event.recording_url;
                const hasPendingRecording = event.recording_status === RECORDING_STATUS.Pending;
                const recordingHost = parseRecordingHostname(event.recording_url);

                return (
                  <div
                    key={event.id}
                    className="bg-gradient-to-br from-[#22243A]/80 via-[#23283B]/80 to-[#383B53]/80 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:border-primary/30 transition-all duration-200"
                  >
                    {timeDisplay && (
                      <div className="flex items-center gap-2 text-sm text-primary mb-3">
                        <Clock className="w-4 h-4" />
                        <span className="font-medium">{timeDisplay}</span>
                      </div>
                    )}

                    {event.groups?.name && (
                      <div className="text-sm text-muted-foreground mb-1">{event.groups.name}</div>
                    )}

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

                    {event.description && (
                      <p className="text-muted-foreground text-sm mb-4 line-clamp-2">
                        {event.description}
                      </p>
                    )}

                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                      <MapPin className="w-4 h-4" />
                      <span>{displayLocation || "TBD"}</span>
                    </div>

                    {eventTags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
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

                    {/* Recording actions */}
                    <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/5">
                      {hasApprovedRecording ? (
                        <>
                          <Button asChild variant="outline" size="sm" className="border-primary/60 text-primary hover:bg-primary hover:text-black">
                            <a
                              href={event.recording_url ?? "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Watch recording of ${event.title} on ${recordingHost}`}
                            >
                              <PlayCircle className="w-4 h-4 mr-1" />
                              Watch Recording
                            </a>
                          </Button>
                          {recordingHost && (
                            <span className="text-xs text-muted-foreground">{recordingHost}</span>
                          )}
                        </>
                      ) : (
                        <>
                          {hasPendingRecording && (
                            <Badge variant="outline" className="border-yellow-400/50 text-yellow-200">
                              Recording pending review
                            </Badge>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSubmitEvent(event)}
                          >
                            <Upload className="w-4 h-4 mr-1" />
                            Submit Recording
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {hasMore && (
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

      {submitEvent && (
        <SubmitRecordingModal
          open={true}
          onOpenChange={(o) => {
            if (!o) setSubmitEvent(null);
          }}
          event={submitEvent}
        />
      )}
    </>
  );
}
