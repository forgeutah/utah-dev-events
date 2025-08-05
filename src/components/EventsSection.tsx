
import { useState } from "react";
import { EventsTimeline } from "@/components/EventsTimeline";
import { CalendarView } from "@/components/CalendarView";
import { EventsFilterControls } from "@/components/EventsFilterControls";
import { EventStats } from "@/components/EventStats";
import CalendarLinkModal from "@/components/CalendarLinkModal";
import RssLinkModal from "@/components/RssLinkModal";
import AddEventModal from "@/components/AddEventModal";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useEventFiltering } from "@/hooks/useEventFiltering";
import { generateICalUrl, generateRssUrl } from "@/utils/eventUrls";
import { EventsSectionProps, UtahRegion } from "@/types/events";

export default function EventsSection({ events, groups, isLoading, error, allTags }: EventsSectionProps) {
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedRegions, setSelectedRegions] = useState<UtahRegion[]>([]);
  const [excludeOnline, setExcludeOnline] = useState(false);
  const [visibleEventCount, setVisibleEventCount] = useState(10);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [showRssModal, setShowRssModal] = useState(false);
  const [showAddEventModal, setShowAddEventModal] = useState(false);

  const { allAvailableTags, filteredEvents } = useEventFiltering(
    events,
    groups,
    allTags,
    selectedGroups,
    selectedTags,
    selectedDate,
    selectedRegions,
    excludeOnline
  );

  const handleShowMore = () => {
    setVisibleEventCount(prev => prev + 10);
  };

  return (
    <>
      <section className="flex flex-col items-center flex-1 mb-10 px-4">
        <div className="max-w-6xl w-full">
          <div className="flex gap-8">
            {/* Main content */}
            <div className="flex-1">
              <EventsFilterControls
                groups={groups}
                selectedGroups={selectedGroups}
                onGroupSelectionChange={setSelectedGroups}
                allAvailableTags={allAvailableTags}
                selectedTags={selectedTags}
                onTagSelectionChange={setSelectedTags}
                selectedRegions={selectedRegions}
                onRegionSelectionChange={setSelectedRegions}
                excludeOnline={excludeOnline}
                onExcludeOnlineChange={setExcludeOnline}
                onCalendarModalOpen={() => setShowCalendarModal(true)}
                onRssModalOpen={() => setShowRssModal(true)}
              />
              
              <EventsTimeline 
                events={filteredEvents}
                isLoading={isLoading}
                error={error}
                visibleCount={visibleEventCount}
                onShowMore={handleShowMore}
              />
            </div>

            {/* Calendar sidebar - hidden on mobile */}
            <div className="hidden md:block w-72 flex-shrink-0 space-y-4">
              <Button
                onClick={() => setShowAddEventModal(true)}
                className="w-full flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Event
              </Button>

              {/* Pass upcoming filtered events to calendar */}
              <CalendarView
                events={filteredEvents}
                selectedDate={selectedDate}
                onDateSelect={setSelectedDate}
              />

              {/* Event Stats */}
              <EventStats
                events={events || []}
                groups={groups || []}
                filteredCount={filteredEvents.length}
              />
            </div>
          </div>
        </div>
      </section>

      <CalendarLinkModal
        open={showCalendarModal}
        onOpenChange={setShowCalendarModal}
        selectedGroups={selectedGroups}
        selectedTags={selectedTags}
        groups={groups || []}
        generateICalUrl={() => generateICalUrl(selectedGroups, selectedTags)}
      />

      <RssLinkModal
        open={showRssModal}
        onOpenChange={setShowRssModal}
        selectedGroups={selectedGroups}
        selectedTags={selectedTags}
        groups={groups || []}
        generateRssUrl={() => generateRssUrl(selectedGroups, selectedTags)}
      />

      <AddEventModal 
        open={showAddEventModal} 
        onOpenChange={setShowAddEventModal} 
      />
    </>
  );
}
