import { describe, expect, it } from "vitest";
import { TASK_ID_PROPERTY, toCalendarEvents } from "./google-events";

// Invented events. Early November 2026 is winter time in Madrid (UTC+1).
const RANGE = { from: "2026-11-02", to: "2026-11-09" };

function timed(id: string, start: string, end: string, extra: object = {}) {
  return { id, summary: "Dentist", start: { dateTime: start }, end: { dateTime: end }, ...extra };
}

function allDay(id: string, start: string, end: string) {
  return { id, summary: "Trip to Porto", start: { date: start }, end: { date: end } };
}

describe("Google Calendar events in the day list", () => {
  it("shows a timed event on its day with start and end in Madrid time", () => {
    expect(
      toCalendarEvents([timed("a", "2026-11-03T09:00:00Z", "2026-11-03T09:30:00Z")], RANGE),
    ).toEqual([{ id: "a", title: "Dentist", date: "2026-11-03", start: "10:00", end: "10:30" }]);
  });

  it("keeps an evening that runs past midnight on the day it starts", () => {
    expect(
      toCalendarEvents(
        [timed("a", "2026-11-03T22:00:00+01:00", "2026-11-04T01:00:00+01:00")],
        RANGE,
      ),
    ).toEqual([{ id: "a", title: "Dentist", date: "2026-11-03", start: "22:00", end: "01:00" }]);
  });

  it("leaves out the end of an event that ends when it starts", () => {
    const [event] = toCalendarEvents(
      [timed("a", "2026-11-03T10:00:00+01:00", "2026-11-03T10:00:00+01:00")],
      RANGE,
    );
    expect(event?.end).toBeNull();
  });

  it("shows an all-day event on each day it covers within the range", () => {
    const events = toCalendarEvents([allDay("a", "2026-11-01", "2026-11-05")], RANGE);
    expect(events.map((event) => [event.date, event.start])).toEqual([
      ["2026-11-02", null],
      ["2026-11-03", null],
      ["2026-11-04", null],
    ]);
  });

  it("shows a long timed event as all-day on the days after its start", () => {
    const events = toCalendarEvents(
      [timed("a", "2026-11-02T10:00:00+01:00", "2026-11-04T18:00:00+01:00")],
      RANGE,
    );
    expect(events.map((event) => [event.date, event.start, event.end])).toEqual([
      ["2026-11-02", "10:00", null],
      ["2026-11-03", null, null],
      ["2026-11-04", null, null],
    ]);
  });

  it("doesn't show a long event on the day it ends right at midnight", () => {
    const events = toCalendarEvents(
      [timed("a", "2026-11-02T10:00:00+01:00", "2026-11-04T00:00:00+01:00")],
      RANGE,
    );
    expect(events.map((event) => event.date)).toEqual(["2026-11-02", "2026-11-03"]);
  });

  it("leaves out days outside the range", () => {
    expect(
      toCalendarEvents(
        [
          timed("before", "2026-11-01T10:00:00+01:00", "2026-11-01T11:00:00+01:00"),
          timed("after", "2026-11-10T10:00:00+01:00", "2026-11-10T11:00:00+01:00"),
        ],
        RANGE,
      ),
    ).toEqual([]);
  });

  it("hides cancelled, declined and working-location events", () => {
    const start = "2026-11-03T10:00:00+01:00";
    const end = "2026-11-03T11:00:00+01:00";
    expect(
      toCalendarEvents(
        [
          timed("cancelled", start, end, { status: "cancelled" }),
          timed("office", start, end, { eventType: "workingLocation" }),
          timed("declined", start, end, {
            attendees: [
              { email: "host@example.com", responseStatus: "accepted" },
              { self: true, responseStatus: "declined" },
            ],
          }),
          timed("accepted", start, end, {
            attendees: [{ self: true, responseStatus: "accepted" }],
          }),
        ],
        RANGE,
      ).map((event) => event.id),
    ).toEqual(["accepted"]);
  });

  it("hides PlanToMe's own events, whose tasks are in the list already", () => {
    const start = "2026-11-03T10:00:00+01:00";
    const end = "2026-11-03T11:00:00+01:00";
    expect(
      toCalendarEvents(
        [
          timed("marked", start, end, {
            extendedProperties: { private: { [TASK_ID_PROPERTY]: "task-1" } },
          }),
          timed("linked", start, end),
          timed("someone-elses", start, end),
        ],
        RANGE,
        new Set(["linked"]),
      ).map((event) => event.id),
    ).toEqual(["someone-elses"]);
  });

  it("names untitled events and skips ones it can't read", () => {
    expect(
      toCalendarEvents(
        [
          { id: "untitled", start: { date: "2026-11-03" }, end: { date: "2026-11-04" } },
          { summary: "No id", start: { date: "2026-11-03" } },
          { id: "bad-date", start: { dateTime: "soon" } },
        ],
        RANGE,
      ),
    ).toEqual([
      { id: "untitled", title: "(No title)", date: "2026-11-03", start: null, end: null },
    ]);
  });
});
