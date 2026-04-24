import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { isValidRecordingUrl } from "@/utils/recordingUrl";
import { RECORDING_STATUS, type Event } from "@/types/events";

type SubmitRecordingEvent = Pick<Event, "id" | "title" | "link" | "recording_status">;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: SubmitRecordingEvent;
}

const MIN_OPEN_MS = 2000;

export default function SubmitRecordingModal({ open, onOpenChange, event }: Props) {
  const [formData, setFormData] = useState({ recording_url: "", contact_email: "", website: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedAtRef = useRef<number>(Date.now());
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => () => {
    mountedRef.current = false;
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

  useEffect(() => {
    if (open) {
      openedAtRef.current = Date.now();
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    }
  }, [open]);

  const handleClose = () => {
    onOpenChange(false);
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      setFormData({ recording_url: "", contact_email: "", website: "" });
      setIsSubmitting(false);
    }, 200);
  };

  const submit = useMutation({
    mutationFn: async ({ id, url }: { id: string; url: string }) => {
      const { data, error } = await supabase.functions.invoke("submit-recording", {
        body: { event_id: id, recording_url: url },
      });
      if (error) throw new Error(error.message || "Submission failed");
      if (data && typeof data === "object" && "error" in data && data.error) {
        throw new Error(String(data.error));
      }
    },
    onMutate: async ({ id, url }) => {
      await qc.cancelQueries({ queryKey: ["past-events"] });
      const prev = qc.getQueryData<Event[]>(["past-events"]);
      qc.setQueryData<Event[]>(["past-events"], (old) =>
        (old ?? []).map((e) =>
          e.id === id ? { ...e, recording_url: url, recording_status: RECORDING_STATUS.Pending } : e,
        ),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(["past-events"], ctx.prev);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["past-events"] });
    },
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);

    const url = formData.recording_url.trim();

    // Honeypot tripped — pretend success, no network call.
    if (formData.website) {
      toast({ title: "Thanks — pending review" });
      submittingRef.current = false;
      handleClose();
      return;
    }

    // Bot time-to-submit gate.
    if (Date.now() - openedAtRef.current < MIN_OPEN_MS) {
      toast({ title: "Thanks — pending review" });
      submittingRef.current = false;
      handleClose();
      return;
    }

    if (!isValidRecordingUrl(url)) {
      toast({
        title: "Invalid URL",
        description: "Use a https link from YouTube, Vimeo, or Loom.",
        variant: "destructive",
      });
      submittingRef.current = false;
      setIsSubmitting(false);
      return;
    }

    if (event.link && url === event.link) {
      toast({
        title: "That's the event page, not a recording",
        description: "Please paste the actual YouTube/Vimeo/Loom URL.",
        variant: "destructive",
      });
      submittingRef.current = false;
      setIsSubmitting(false);
      return;
    }

    try {
      await submit.mutateAsync({ id: event.id, url });
      if (!mountedRef.current) return;
      toast({
        variant: "default",
        title: "Thanks — pending review",
        description:
          "Your submission will appear on the Past Events page once an admin approves it.",
      });
      handleClose();
    } catch (err) {
      if (!mountedRef.current) return;
      toast({
        variant: "destructive",
        title: "Could not submit",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Submit Recording</DialogTitle>
          <DialogDescription>
            Share a video recording for <span className="font-medium">{event.title}</span>.
            Submissions are reviewed before they appear publicly.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="text-sm text-muted-foreground" htmlFor="recording-url">
            Recording URL (YouTube, Vimeo, or Loom)
          </label>
          <Input
            id="recording-url"
            type="url"
            placeholder="https://youtube.com/watch?v=..."
            value={formData.recording_url}
            required
            onChange={(e) => setFormData((v) => ({ ...v, recording_url: e.target.value }))}
          />
          <Input
            type="email"
            placeholder="Contact email (optional, if we have questions)"
            value={formData.contact_email}
            onChange={(e) => setFormData((v) => ({ ...v, contact_email: e.target.value }))}
          />
          {/* Honeypot: hidden from real users, crawled by bots. */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="sr-only"
            value={formData.website}
            onChange={(e) => setFormData((v) => ({ ...v, website: e.target.value }))}
          />
          <DialogFooter>
            <Button variant="outline" type="button" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting…" : "Submit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
