import { expandSchedule } from './medication-schedule';

const iso = (d: Date) => d.toISOString();

describe('expandSchedule', () => {
  it('no times → no slots (PRN / as-needed plan)', () => {
    const from = new Date('2026-01-15T00:00:00Z');
    const to = new Date('2026-01-16T00:00:00Z');
    expect(expandSchedule({}, from, to)).toEqual([]);
    expect(expandSchedule({ times: [] }, from, to)).toEqual([]);
  });

  it('winter (Lisbon = UTC+0): 08:00 local → 08:00Z', () => {
    const from = new Date('2026-01-15T00:00:00Z');
    const to = new Date('2026-01-16T00:00:00Z');
    const slots = expandSchedule({ times: ['08:00'] }, from, to);
    expect(slots.map(iso)).toEqual(['2026-01-15T08:00:00.000Z']);
  });

  it('summer (Lisbon = WEST UTC+1): 08:00 local → 07:00Z (DST handled)', () => {
    const from = new Date('2026-07-15T00:00:00Z');
    const to = new Date('2026-07-16T00:00:00Z');
    const slots = expandSchedule({ times: ['08:00'] }, from, to);
    expect(slots.map(iso)).toEqual(['2026-07-15T07:00:00.000Z']);
  });

  it('multiple times over multiple days, sorted ascending', () => {
    const from = new Date('2026-01-15T00:00:00Z');
    const to = new Date('2026-01-17T00:00:00Z');
    const slots = expandSchedule({ times: ['20:00', '08:00'] }, from, to);
    expect(slots.map(iso)).toEqual([
      '2026-01-15T08:00:00.000Z',
      '2026-01-15T20:00:00.000Z',
      '2026-01-16T08:00:00.000Z',
      '2026-01-16T20:00:00.000Z',
    ]);
  });

  it('daysOfWeek filters out excluded weekdays (1=Mon..7=Sun)', () => {
    // 2026-01-15 is a Thursday(4); 16 Fri(5); 17 Sat(6); 18 Sun(7)
    const from = new Date('2026-01-15T00:00:00Z');
    const to = new Date('2026-01-19T00:00:00Z');
    const slots = expandSchedule({ times: ['09:00'], daysOfWeek: [6, 7] }, from, to);
    expect(slots.map(iso)).toEqual(['2026-01-17T09:00:00.000Z', '2026-01-18T09:00:00.000Z']);
  });

  it('window is [from, to): start inclusive, end exclusive', () => {
    const from = new Date('2026-01-15T08:00:00Z');
    const to = new Date('2026-01-16T08:00:00Z');
    const slots = expandSchedule({ times: ['08:00'] }, from, to);
    // 15th 08:00 included (== from); 16th 08:00 excluded (== to)
    expect(slots.map(iso)).toEqual(['2026-01-15T08:00:00.000Z']);
  });
});
