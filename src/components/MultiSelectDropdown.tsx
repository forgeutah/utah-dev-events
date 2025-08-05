
import React, { useState } from "react";
import { Check, ChevronDown, X, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Group {
  id: string;
  name: string;
}

interface MultiSelectDropdownProps {
  groups: Group[];
  selectedGroups: string[];
  onSelectionChange: (groups: string[]) => void;
  placeholder?: string;
  icon?: React.ReactNode;
}

export function MultiSelectDropdown({
  groups,
  selectedGroups,
  onSelectionChange,
  placeholder = "Filter by groups",
  icon
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const handleGroupToggle = (groupId: string) => {
    const newSelection = selectedGroups.includes(groupId)
      ? selectedGroups.filter(id => id !== groupId)
      : [...selectedGroups, groupId];
    onSelectionChange(newSelection);
  };

  const clearSelection = () => {
    onSelectionChange([]);
  };

  // Filter groups based on search term
  const filteredGroups = groups.filter(group =>
    group.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            className="h-10 justify-between text-white border-border bg-transparent hover:bg-white/10 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none"
          >
            <span className="flex items-center gap-2">
              {icon}
              {selectedGroups.length === 0 
                ? placeholder
                : `${selectedGroups.length} selected`
              }
            </span>
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent 
          className="w-56 bg-popover border-border p-0" 
          align="start"
        >
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="pl-8 h-8 bg-background border-border text-sm focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none"
              />
            </div>
          </div>
          <ScrollArea className="h-48">
            <div className="p-1">
              {filteredGroups.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                  No results found
                </div>
              ) : (
                filteredGroups.map((group) => (
                  <DropdownMenuCheckboxItem
                    key={group.id}
                    checked={selectedGroups.includes(group.id)}
                    onCheckedChange={() => handleGroupToggle(group.id)}
                    onSelect={(event) => event.preventDefault()}
                    className="cursor-pointer focus:bg-accent focus:text-accent-foreground"
                  >
                    {group.name}
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </div>
          </ScrollArea>
        </DropdownMenuContent>
      </DropdownMenu>

      {selectedGroups.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearSelection}
          className="h-6 px-2 text-xs text-muted-foreground hover:text-white focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none"
        >
          <X className="h-3 w-3 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}
