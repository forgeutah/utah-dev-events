
import { Calendar, Rss, MapPin, Monitor } from "lucide-react";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";
import { Group, UtahRegion } from "@/types/events";
import { UTAH_REGIONS, getRegionDisplayName } from "@/utils/locationUtils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface EventsFilterControlsProps {
  groups: Group[];
  selectedGroups: string[];
  onGroupSelectionChange: (groups: string[]) => void;
  allAvailableTags: string[];
  selectedTags: string[];
  onTagSelectionChange: (tags: string[]) => void;
  selectedRegions: UtahRegion[];
  onRegionSelectionChange: (regions: UtahRegion[]) => void;
  excludeOnline: boolean;
  onExcludeOnlineChange: (exclude: boolean) => void;
  onCalendarModalOpen: () => void;
  onRssModalOpen: () => void;
}

export const EventsFilterControls = ({
  groups,
  selectedGroups,
  onGroupSelectionChange,
  allAvailableTags,
  selectedTags,
  onTagSelectionChange,
  selectedRegions,
  onRegionSelectionChange,
  excludeOnline,
  onExcludeOnlineChange,
  onCalendarModalOpen,
  onRssModalOpen
}: EventsFilterControlsProps) => {
  return (
    <div className="space-y-4 mb-6">
      {/* Main filter controls */}
      <div className="flex items-center justify-between ml-6">
        <div className="flex items-center gap-4 flex-wrap">
          <MultiSelectDropdown
            groups={groups || []}
            selectedGroups={selectedGroups}
            onSelectionChange={onGroupSelectionChange}
            placeholder="Groups"
          />
          
          {allAvailableTags.length > 0 && (
            <MultiSelectDropdown
              groups={allAvailableTags.map(tag => ({ id: tag, name: tag }))}
              selectedGroups={selectedTags}
              onSelectionChange={onTagSelectionChange}
              placeholder="Tags"
            />
          )}

          <MultiSelectDropdown
            groups={UTAH_REGIONS.map(region => ({ id: region, name: getRegionDisplayName(region) }))}
            selectedGroups={selectedRegions}
            onSelectionChange={onRegionSelectionChange}
            placeholder="Areas"
            icon={<MapPin className="w-4 h-4" />}
          />
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={onCalendarModalOpen}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-primary/10 text-primary border border-primary rounded-md hover:bg-primary hover:text-black transition-colors"
          >
            <Calendar className="w-4 h-4" />
            iCal
          </button>
          
          <button
            onClick={onRssModalOpen}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-primary/10 text-primary border border-primary rounded-md hover:bg-primary hover:text-black transition-colors"
          >
            <Rss className="w-4 h-4" />
            RSS
          </button>
        </div>
      </div>

      {/* Online events toggle */}
      <div className="flex items-center gap-2 ml-6">
        <Switch
          id="exclude-online"
          checked={excludeOnline}
          onCheckedChange={onExcludeOnlineChange}
        />
        <Label htmlFor="exclude-online" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Monitor className="w-4 h-4" />
          Hide online events
        </Label>
      </div>
    </div>
  );
};
