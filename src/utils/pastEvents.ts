const DENVER_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Denver',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function todayInDenver(now: Date = new Date()): string {
  return DENVER_DATE_FMT.format(now);
}

export function isPastEvent(event: { event_date: string }, today: string = todayInDenver()): boolean {
  return event.event_date < today;
}
