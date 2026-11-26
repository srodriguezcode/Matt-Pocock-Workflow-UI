/** Local time: matches the clock on the machine reading the sky. */
const timeFormat = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const refresh = {
  title: 'Refresh',
  time: (iso: string) => timeFormat.format(new Date(iso)),
  read: (hhmm: string) => `read ${hhmm}`,
  lastRead: (hhmm: string) => `last read ${hhmm}`,
  notReadYet: 'not read yet',
  readFailed: 'read failed',
  retryEvery: (minutes: number) => `Retrying every ${minutes} min.`,
};
