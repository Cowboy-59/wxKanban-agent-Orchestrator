import * as React from "react";
import { Calendar as BigCalendar, dateFnsLocalizer, type Event as RbcEvent } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale";

import { cn } from "@/lib/utils";

const locales = { "en-US": enUS };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

export interface Resource {
  id: string;
  title: string;
}

export interface ResourceEvent {
  id: string;
  resourceId: string;
  title: string;
  start: Date;
  end: Date;
}

export interface ResourceCalendarProps {
  resources: Resource[];
  events: ResourceEvent[];
  view?: "day" | "week";
  onEventClick?: (event: ResourceEvent) => void;
  onSlotClick?: (slot: { resourceId: string; start: Date; end: Date }) => void;
  className?: string;
}

// [SCOPE 036 / T022] BEGIN — src/components/ui/resource-calendar.tsx — Tailwind-styled react-big-calendar wrapper (no library CSS import)
function ResourceCalendar({
  resources,
  events,
  view = "week",
  onEventClick,
  onSlotClick,
  className,
}: ResourceCalendarProps) {
  const rbcEvents: RbcEvent[] = React.useMemo(
    () =>
      events.map((e) => ({
        title: e.title,
        start: e.start,
        end: e.end,
        resource: e.resourceId,
        allDay: false,
      })),
    [events],
  );

  const handleSelectEvent = React.useCallback(
    (rbcEvent: RbcEvent) => {
      if (!onEventClick) return;
      const original = events.find(
        (e) =>
          e.start.getTime() === (rbcEvent.start as Date).getTime() &&
          e.end.getTime() === (rbcEvent.end as Date).getTime() &&
          e.resourceId === (rbcEvent.resource as string),
      );
      if (original) onEventClick(original);
    },
    [events, onEventClick],
  );

  const handleSelectSlot = React.useCallback(
    (slot: { start: Date; end: Date; resourceId?: string | number }) => {
      if (!onSlotClick) return;
      onSlotClick({
        resourceId: String(slot.resourceId ?? ""),
        start: slot.start,
        end: slot.end,
      });
    },
    [onSlotClick],
  );

  return (
    <div
      className={cn(
        "rbc-tailwind w-full rounded-lg border bg-card text-card-foreground",
        "[&_.rbc-time-view]:border-0",
        "[&_.rbc-time-header]:border-b [&_.rbc-time-header]:border-border",
        "[&_.rbc-header]:border-b [&_.rbc-header]:border-border [&_.rbc-header]:px-2 [&_.rbc-header]:py-2 [&_.rbc-header]:text-xs [&_.rbc-header]:font-medium [&_.rbc-header]:text-muted-foreground",
        "[&_.rbc-time-content]:border-t [&_.rbc-time-content]:border-border",
        "[&_.rbc-time-slot]:border-b [&_.rbc-time-slot]:border-border/40",
        "[&_.rbc-day-slot]:border-r [&_.rbc-day-slot]:border-border",
        "[&_.rbc-event]:rounded-md [&_.rbc-event]:border-0 [&_.rbc-event]:bg-primary [&_.rbc-event]:px-2 [&_.rbc-event]:py-1 [&_.rbc-event]:text-xs [&_.rbc-event]:text-primary-foreground",
        "[&_.rbc-event-label]:hidden",
        "[&_.rbc-today]:bg-accent/40",
        "[&_.rbc-toolbar]:flex [&_.rbc-toolbar]:items-center [&_.rbc-toolbar]:justify-between [&_.rbc-toolbar]:px-4 [&_.rbc-toolbar]:py-3",
        "[&_.rbc-toolbar_button]:inline-flex [&_.rbc-toolbar_button]:items-center [&_.rbc-toolbar_button]:justify-center [&_.rbc-toolbar_button]:rounded-md [&_.rbc-toolbar_button]:border [&_.rbc-toolbar_button]:border-input [&_.rbc-toolbar_button]:bg-background [&_.rbc-toolbar_button]:px-3 [&_.rbc-toolbar_button]:py-1.5 [&_.rbc-toolbar_button]:text-sm [&_.rbc-toolbar_button]:hover:bg-accent",
        className,
      )}
      style={{ height: 600 }}
    >
      <BigCalendar
        localizer={localizer}
        events={rbcEvents}
        resources={resources.map((r) => ({ resourceId: r.id, resourceTitle: r.title }))}
        resourceIdAccessor="resourceId"
        resourceTitleAccessor="resourceTitle"
        defaultView={view}
        views={["day", "week"]}
        selectable
        onSelectEvent={handleSelectEvent}
        onSelectSlot={handleSelectSlot}
        step={30}
        timeslots={2}
      />
    </div>
  );
}
ResourceCalendar.displayName = "ResourceCalendar";
// [SCOPE 036 / T022] END

export { ResourceCalendar };
