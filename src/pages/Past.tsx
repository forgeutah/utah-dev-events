import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { PastEventsTimeline } from "@/components/PastEventsTimeline";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RECORDING_STATUS, type Event } from "@/types/events";
import { todayInDenver } from "@/utils/pastEvents";

async function fetchPastEvents() {
  const { data, error } = await supabase
    .from("events")
    .select(`
      id,
      title,
      event_date,
      start_time,
      location,
      venue_name,
      address_line_1,
      address_line_2,
      city,
      state_province,
      postal_code,
      country,
      link,
      status,
      group_id,
      description,
      tags,
      recording_url,
      recording_status,
      groups (
        name,
        status,
        tags
      )
    `)
    .eq("status", "approved")
    .lt("event_date", todayInDenver())
    .order("event_date", { ascending: false });

  if (error) throw error;

  return (data ?? []).filter((e: Event) => !e.groups || e.groups.status === "approved");
}

const INITIAL_VISIBLE = 50;

const Past = () => {
  const [showAll, setShowAll] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  const { data: events, isLoading, error } = useQuery({
    queryKey: ["past-events"],
    queryFn: fetchPastEvents,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const displayedEvents = useMemo(() => {
    const all = (events as Event[] | undefined) ?? [];
    if (showAll) return all;
    return all.filter(
      (e) => e.recording_status === RECORDING_STATUS.Approved && e.recording_url,
    );
  }, [events, showAll]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A1F2C] to-[#23283B]">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
            Past Events
          </h1>
          <p className="text-muted-foreground text-sm max-w-2xl">
            A library of recordings from past Utah dev events. See one that's missing?
            Click <span className="font-medium">Submit Recording</span> on the event's card
            to share the link — submissions are reviewed before going public.
          </p>
        </header>

        <div className="flex items-center gap-3 mb-8 p-4 rounded-lg bg-white/5 border border-white/10">
          <Switch
            id="show-all-past"
            checked={showAll}
            onCheckedChange={setShowAll}
          />
          <Label htmlFor="show-all-past" className="text-sm text-white cursor-pointer">
            Include events without recordings
          </Label>
          <span className="ml-auto text-xs text-muted-foreground">
            {displayedEvents.length} {displayedEvents.length === 1 ? "event" : "events"}
          </span>
        </div>

        <PastEventsTimeline
          events={displayedEvents}
          isLoading={isLoading}
          error={error}
          visibleCount={visibleCount}
          onShowMore={() => setVisibleCount((v) => v + INITIAL_VISIBLE)}
        />
      </main>
      <Footer />
    </div>
  );
};

export default Past;
