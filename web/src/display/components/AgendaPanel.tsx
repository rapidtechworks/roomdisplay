import type { CachedEvent, Theme } from '@roomdisplay/shared';

interface Props {
  events:   CachedEvent[];
  timeZone: string;
  now:      Date;
  theme:    Theme;
}

interface DayGroup { label: string; events: CachedEvent[] }

function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(date);
}

function groupByDay(events: CachedEvent[], now: Date, timeZone: string): DayGroup[] {
  const today    = dayKey(now, timeZone);
  const tomorrow = dayKey(new Date(now.getTime() + 86_400_000), timeZone);
  const groups   = new Map<string, DayGroup>();

  for (const event of events) {
    const start = new Date(event.startsAt);
    const key   = dayKey(start, timeZone);
    if (!groups.has(key)) {
      let label: string;
      if (key === today)         label = 'Today';
      else if (key === tomorrow) label = 'Tomorrow';
      else                       label = start.toLocaleDateString('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' });
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
  const s = new Date(event.startsAt);
  const e = new Date(event.endsAt);
  return s.getUTCHours() === 0 && s.getUTCMinutes() === 0 &&
         e.getUTCHours() === 0 && e.getUTCMinutes() === 0 &&
         (e.getTime() - s.getTime()) >= 86_400_000;
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
                  style={{ background: 'rgba(255,255,255,0.07)' }}
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
