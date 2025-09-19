import { Calendar, Users, Database, TrendingUp, Globe, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Event, Group } from "@/types/events";
import { isOnlineEvent } from "@/utils/locationUtils";


interface EventStatsProps {
  events: Event[];
  groups: Group[];
  filteredCount: number;
}

export const EventStats = ({ events, groups, filteredCount }: EventStatsProps) => {
  // Calculate stats
  const totalEvents = events.length;
  const totalGroups = groups.length;
  
  // Count event sources
  const sourceStats = {
    meetup: 0,
    luma: 0,
    eventbrite: 0,
    university: 0,
    misc: 0,
    other: 0
  };

  events.forEach(event => {
    const url = event.link?.toLowerCase() || '';
    if (url.includes('meetup.com')) {
      sourceStats.meetup++;
    } else if (url.includes('lu.ma')) {
      sourceStats.luma++;
    } else if (url.includes('eventbrite.com')) {
      sourceStats.eventbrite++;
    } else if (url.includes('cs.byu.edu') || url.includes('utah.edu')) {
      sourceStats.university++;
    } else if (
      url.includes('kiln.utah.gov') || 
      url.includes('wework.com') || 
      url.includes('siliconslopestechsummit.com') || 
      url.includes('utahgeekevents.com')
    ) {
      sourceStats.misc++;
    } else {
      sourceStats.other++;
    }
  });

  // Calculate online vs in-person events
  const onlineEvents = events.filter(event => isOnlineEvent(event)).length;
  const inPersonEvents = totalEvents - onlineEvents;


  const sources = [
    { name: 'Meetup.com', count: sourceStats.meetup, color: 'bg-red-500' },
    { name: 'Luma Events', count: sourceStats.luma, color: 'bg-purple-500' },
    { name: 'Eventbrite', count: sourceStats.eventbrite, color: 'bg-orange-500' },
    { name: 'Universities', count: sourceStats.university, color: 'bg-blue-500' },
    { name: 'Misc Websites', count: sourceStats.misc, color: 'bg-green-500' },
    { name: 'Other', count: sourceStats.other, color: 'bg-gray-500' }
  ].filter(source => source.count > 0);

  return (
    <Card className="bg-card/80 backdrop-blur-sm border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Event Stats
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total Events */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">Total Events</span>
          </div>
          <Badge variant="secondary">{totalEvents}</Badge>
        </div>

        {/* Filtered Count */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">Showing</span>
          </div>
          <Badge variant="default">{filteredCount}</Badge>
        </div>

        {/* Total Groups/Sources */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">Groups</span>
          </div>
          <Badge variant="outline">{totalGroups}</Badge>
        </div>

        {/* Online vs In-Person */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">Online</span>
            </div>
            <Badge variant="outline">{onlineEvents}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">In-Person</span>
            </div>
            <Badge variant="outline">{inPersonEvents}</Badge>
          </div>
        </div>


        {/* Event Sources */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Sources</h4>
          <div className="space-y-1">
            {sources.map((source) => (
              <div key={source.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${source.color}`} />
                  <span>{source.name}</span>
                </div>
                <span className="text-muted-foreground">{source.count}</span>
              </div>
            ))}
          </div>
        </div>

        {filteredCount < totalEvents && (
          <div className="text-xs text-muted-foreground pt-2 border-t border-border">
            {totalEvents - filteredCount} events hidden by filters
          </div>
        )}
      </CardContent>
    </Card>
  );
};