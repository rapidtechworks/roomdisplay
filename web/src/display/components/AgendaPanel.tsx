import type { CachedEvent, Theme } from '@roomdisplay/shared';

interface Props {
  events:   CachedEvent[];
  timeZone: string;
  now:      Date;
  theme:    Theme;
}

interface DayGroup { label: string; events: CachedEvent[] }

// For timed events, key by the date in the room's timezone.
// For all-day events, use the UTC date directly — the iCal DATE value
// (e.g. 20260421) is stored as midnight UTC and must NOT be timezone-shifted
// or it will fall on the wrong calendar day.
function dayKey(date: Date, timeZone: string, allDay: boolean): string {
  if (allDay) {
    // Extract the UTC calendar date directly to avoid timezone skew.
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(date);
}

function groupByDay(events: CachedEvent[], now: Date, timeZone: string): DayGroup[] {
  const today    = dayKey(now, timeZone, false);
  const tomorrow = dayKey(new Date(now.getTime() + 86_400_000), timeZone, false);
  const groups   = new Map<string, DayGroup>();

  for (const event of events) {
    const start = new Date(event.startsAt);
    const key   = dayKey(start, timeZone, event.allDay);
    if (!groups.has(key)) {
      let label: string;
      if (key === today)         label = 'Today';
      else if (key === tomorrow) label = 'Tomorrow';
      else {
        // For display, parse the key as a local date to avoid DST edge cases
        const parts = key.split('-');
        const displayDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        label = displayDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      }
      groups.set(key, { label, events: [] });
    }
    groups.get(key)!.events.push(event);
  }
  return Array.from(groups.values());
}

function fmtTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
}

function isAllDay(event: CachedEvent): boolean {
  return event.allDay;
}

export function AgendaPanel({ events, timeZone, now, theme }: Props) {
  const upcoming = events.filter(e => new Date(e.endsAt).getTime() > now.getTime());
  const groups   = groupByDay(upcoming, now, timeZone);

  return (
    <div
      className="flex w-[360px] shrink-0 flex-col overflow-hidden rounded-3xl border"
      style={{
        background:           theme.glassPanelTint,
        backdropFilter:       `blur(${theme.glassPanelBlur}px)`,
        WebkitBackdropFilter: `blur(${theme.glassPanelBlur}px)`,
        borderColor:          theme.glassPanelBorderColor,
        boxShadow:            theme.glassPanelShadow,
      }}
    >
      <div className="overflow-y-auto p-5">
        {groups.length === 0 && (
          <p className="pt-8 text-center text-sm" style={{ color: theme.agendaMutedColor }}>
            No upcoming events
          </p>
        )}

        {groups.map((group) => (
          <div key={group.label} className="mb-5 last:mb-0">
            <p
              className="mb-2 text-xs font-semibold uppercase tracking-widest"
              style={{ color: theme.agendaDayHeaderColor }}
            >
              {group.label}
            </p>

            <div className="space-y-1.5">
              {group.events.map((event) => (
                <div
                  key={event.id}
                  className="rounded-xl px-3 py-2.5"
                  style={{ background: theme.agendaEventItemBackground }}
                >
                  <p className="text-sm font-medium leading-snug" style={{ color: theme.agendaEventColor }}>
                    {event.title}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: theme.agendaMutedColor }}>
                    {isAllDay(event)
                      ? 'All day'
                      : `${fmtTime(event.startsAt, timeZone)} – ${fmtTime(event.endsAt, timeZone)}`}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
