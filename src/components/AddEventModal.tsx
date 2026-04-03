import React, { useState } from "react";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type Step = 1 | 2 | 3;
type EventType = "one-time" | "recurring-group" | null;

export default function AddEventModal({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const [step, setStep] = useState<Step>(1);
  const [eventType, setEventType] = useState<EventType>(null);
  const [eventData, setEventData] = useState({
    title: "",
    group: "",
    event_date: "",
    start_time: "",
    end_time: "",
    location: "",
    venue_name: "",
    address_line_1: "",
    address_line_2: "",
    city: "",
    state_province: "",
    postal_code: "",
    country: "",
    contact_email: "",
  });
  const [groupData, setGroupData] = useState({
    name: "",
    meetup_link: "",
    luma_link: "",
    contact_email: "",
    tags: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  
  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep(1);
      setEventType(null);
      setEventData({ 
        title: "", 
        group: "", 
        event_date: "", 
        start_time: "", 
        end_time: "",
        location: "", 
        venue_name: "",
        address_line_1: "",
        address_line_2: "",
        city: "",
        state_province: "",
        postal_code: "",
        country: "",
        contact_email: "" 
      });
      setGroupData({ name: "", meetup_link: "", luma_link: "", contact_email: "", tags: "" });
    }, 200);
  };

  // Helper function to generate remote_id
  const generateRemoteId = (link: string) => {
    if (link.includes("meetup.com")) {
      const match = link.match(/meetup\.com\/([^\/]+)/);
      return match ? `meetup-${match[1]}` : null;
    }
    if (link.includes("luma.com") || link.includes("lu.ma")) {
      const match = link.match(/(?:luma\.com|lu\.ma)\/([^\/]+)/);
      return match ? `luma-${match[1]}` : null;
    }
    return null;
  };

  // HANDLERS
  async function handleEventSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    // First, check group exists or not (very simple: just by name)
    let groupId: string | null = null;
    if (eventData.group) {
      const { data: group, error } = await supabase
        .from("groups")
        .select("id")
        .eq("name", eventData.group)
        .maybeSingle();
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        setIsSubmitting(false);
        return;
      }
      if (group) groupId = group.id;
    }
    // If group doesn't exist, create new group (pending status).
    if (!groupId && eventData.group) {
      const { data, error } = await supabase
        .from("groups")
        .insert({ name: eventData.group, status: "pending" })
        .select()
        .single();
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        setIsSubmitting(false);
        return;
      }
      groupId = data.id;
    }
    // Insert the event
    const { error: eventError } = await supabase
      .from("events")
      .insert({
        title: eventData.title,
        group_id: groupId,
        event_date: eventData.event_date,
        start_time: eventData.start_time,
        end_time: eventData.end_time,
        location: eventData.location,
        venue_name: eventData.venue_name,
        address_line_1: eventData.address_line_1,
        address_line_2: eventData.address_line_2,
        city: eventData.city,
        state_province: eventData.state_province,
        postal_code: eventData.postal_code,
        country: eventData.country,
        status: "pending",
      });
    if (eventError) {
      toast({ title: "Error", description: eventError.message, variant: "destructive" });
    } else {
      toast({ title: "Event submitted!", description: "Your event is pending approval.", variant: "default" });
      handleClose();
    }
    setIsSubmitting(false);
  }

  async function handleGroupSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);

    // Process tags
    const processedTags = groupData.tags
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);
    
    // Generate remote_id from links
    const remoteId = generateRemoteId(groupData.meetup_link || groupData.luma_link || "");
    
    // Insert group directly with pending status
    const { error } = await supabase
      .from("groups")
      .insert({
        name: groupData.name,
        meetup_link: groupData.meetup_link,
        luma_link: groupData.luma_link,
        status: "pending",
        tags: processedTags.length > 0 ? processedTags : null,
        remote_id: remoteId
      });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Group submitted!", description: "Your group is pending approval.", variant: "default" });
      handleClose();
    }
    
    setIsSubmitting(false);
  }

  // RENDER
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Event or Group</DialogTitle>
          <DialogDescription>
            {step === 1
              ? "All events and groups go through an approval process before being listed. We may contact you if we have questions."
              : step === 2 && eventType === "one-time"
                ? "Enter the details for your one-time event."
                : step === 2 && eventType === "recurring-group"
                  ? "Enter your group details. Your group will be submitted for approval."
                  : ""}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <Button
              className={`w-full ${eventType === "one-time" ? "border-2 border-primary" : ""}`}
              variant="outline"
              onClick={() => {
                setEventType("one-time");
                setStep(2);
              }}
            >
              One-time Event
            </Button>
            <Button
              className={`w-full ${eventType === "recurring-group" ? "border-2 border-primary" : ""}`}
              variant="outline"
              onClick={() => {
                setEventType("recurring-group");
                setStep(2);
              }}
            >
              Recurring Group with Regular Events
            </Button>
          </div>
        )}

        {step === 2 && eventType === "one-time" && (
          <form onSubmit={handleEventSubmit} className="flex flex-col gap-3">
            <Input
              placeholder="Event Title"
              value={eventData.title}
              required
              onChange={e => setEventData(v => ({ ...v, title: e.target.value }))}
            />
            <Input
              placeholder="Group (optional - name)"
              value={eventData.group}
              onChange={e => setEventData(v => ({ ...v, group: e.target.value }))}
            />
            <Input
              type="date"
              placeholder="Date"
              value={eventData.event_date}
              required
              onChange={e => setEventData(v => ({ ...v, event_date: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="time"
                placeholder="Start Time"
                value={eventData.start_time}
                onChange={e => setEventData(v => ({ ...v, start_time: e.target.value }))}
              />
              <Input
                type="time"
                placeholder="End Time (optional)"
                value={eventData.end_time}
                onChange={e => setEventData(v => ({ ...v, end_time: e.target.value }))}
              />
            </div>
            
            <div className="border-t pt-3 mt-3">
              <h4 className="text-sm font-medium mb-3 text-muted-foreground">Venue & Location Details</h4>
              
              <Input
                placeholder="Venue Name (optional)"
                value={eventData.venue_name}
                onChange={e => setEventData(v => ({ ...v, venue_name: e.target.value }))}
              />
              <Input
                placeholder="Address Line 1 (optional)"
                value={eventData.address_line_1}
                onChange={e => setEventData(v => ({ ...v, address_line_1: e.target.value }))}
              />
              <Input
                placeholder="Address Line 2 (optional)"
                value={eventData.address_line_2}
                onChange={e => setEventData(v => ({ ...v, address_line_2: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="City (optional)"
                  value={eventData.city}
                  onChange={e => setEventData(v => ({ ...v, city: e.target.value }))}
                />
                <Input
                  placeholder="State/Province (optional)"
                  value={eventData.state_province}
                  onChange={e => setEventData(v => ({ ...v, state_province: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Postal Code (optional)"
                  value={eventData.postal_code}
                  onChange={e => setEventData(v => ({ ...v, postal_code: e.target.value }))}
                />
                <Input
                  placeholder="Country (optional)"
                  value={eventData.country}
                  onChange={e => setEventData(v => ({ ...v, country: e.target.value }))}
                />
              </div>
            </div>
            
            <Input
              placeholder="General Location Description (optional)"
              value={eventData.location}
              onChange={e => setEventData(v => ({ ...v, location: e.target.value }))}
            />
            <Input
              type="email"
              placeholder="Contact Email (in case we have questions)"
              value={eventData.contact_email}
              required
              onChange={e => setEventData(v => ({ ...v, contact_email: e.target.value }))}
            />
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                Submit
              </Button>
            </DialogFooter>
          </form>
        )}

        {step === 2 && eventType === "recurring-group" && (
          <form onSubmit={handleGroupSubmit} className="flex flex-col gap-3">
            <Input
              placeholder="Group Name"
              value={groupData.name}
              required
              onChange={e => setGroupData(v => ({ ...v, name: e.target.value }))}
            />
            <Input
              placeholder="Meetup.com Link (optional)"
              value={groupData.meetup_link}
              onChange={e => setGroupData(v => ({ ...v, meetup_link: e.target.value }))}
            />
            <Input
              placeholder="Luma Link (optional)"
              value={groupData.luma_link}
              onChange={e => setGroupData(v => ({ ...v, luma_link: e.target.value }))}
            />
            <Input
              placeholder="Tags (comma separated, optional)"
              value={groupData.tags}
              onChange={e => setGroupData(v => ({ ...v, tags: e.target.value }))}
            />
            <Input
              type="email"
              placeholder="Contact Email (in case we have questions)"
              value={groupData.contact_email}
              required
              onChange={e => setGroupData(v => ({ ...v, contact_email: e.target.value }))}
            />
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                Submit for Approval
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
