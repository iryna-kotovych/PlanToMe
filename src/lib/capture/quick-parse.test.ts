import { describe, expect, it } from "vitest";
import { quickParse } from "./quick-parse";

// Friday.
const TODAY = "2026-10-30";

function parseOne(text: string) {
  const tasks = quickParse(text, TODAY);
  expect(tasks).toHaveLength(1);
  return tasks[0];
}

describe("quickParse", () => {
  it("understands Ukrainian: tomorrow at 15:00", () => {
    expect(parseOne("завтра о 15:00 подзвонити в банк")).toMatchObject({
      title: "Подзвонити в банк",
      date: "2026-10-31",
      time: "15:00",
      recurrence: null,
    });
  });

  it("understands Russian: on Friday, meaning next Friday", () => {
    expect(parseOne("в пятницу купить подарок")).toMatchObject({
      title: "Купить подарок",
      date: "2026-11-06",
      time: null,
    });
  });

  it("understands Ukrainian weekdays with an apostrophe", () => {
    expect(parseOne("у п'ятницю забрати посилку")).toMatchObject({
      title: "Забрати посилку",
      date: "2026-11-06",
    });
  });

  it("understands English repeats with a 12-hour time", () => {
    expect(parseOne("every weekday 8am stretch")).toMatchObject({
      title: "Stretch",
      date: "2026-10-30",
      time: "08:00",
      recurrence: { kind: "weekdays" },
    });
  });

  it("finds the day and time anywhere in the sentence", () => {
    expect(parseOne("call the bank tomorrow at 3pm")).toMatchObject({
      title: "Call the bank",
      date: "2026-10-31",
      time: "15:00",
    });
  });

  it("puts a task with no day on today, untimed", () => {
    expect(parseOne("buy milk")).toMatchObject({
      title: "Buy milk",
      date: TODAY,
      time: null,
      endTime: null,
    });
  });

  it("starts weekly repeats on the next matching day", () => {
    expect(parseOne("щопонеділка о 9:00 планування тижня")).toMatchObject({
      title: "Планування тижня",
      date: "2026-11-02",
      time: "09:00",
      recurrence: { kind: "weekly", days: [1] },
    });
  });

  it("does not mistake numbers in the title for a time", () => {
    expect(parseOne("каждый день читать 10 страниц")).toMatchObject({
      title: "Читать 10 страниц",
      time: null,
      recurrence: { kind: "daily" },
    });
  });

  it("reads a time range", () => {
    expect(
      parseOne("dinner with Marta on Saturday from 19:30 to 21:00"),
    ).toMatchObject({
      title: "Dinner with Marta",
      date: "2026-10-31",
      time: "19:30",
      endTime: "21:00",
    });
  });

  it("knows the day after tomorrow", () => {
    expect(parseOne("послезавтра сходить в спортзал")).toMatchObject({
      title: "Сходить в спортзал",
      date: "2026-11-01",
    });
  });

  it("splits several tasks", () => {
    const tasks = quickParse("buy milk; call mom tomorrow", TODAY);
    expect(tasks.map((task) => [task.title, task.date])).toEqual([
      ["Buy milk", TODAY],
      ["Call mom", "2026-10-31"],
    ]);
  });

  it("ignores impossible times", () => {
    expect(parseOne("meet at 25:00")).toMatchObject({ time: null });
  });
});
