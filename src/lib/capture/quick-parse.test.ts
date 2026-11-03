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

  it("keeps a range that passes midnight, and drops an empty one", () => {
    expect(parseOne("party 22:00-01:00")).toMatchObject({
      time: "22:00",
      endTime: "01:00",
    });
    expect(parseOne("call 10:00-10:00")).toMatchObject({
      time: "10:00",
      endTime: null,
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

  it("understands times in words, as the keyboard's dictation types them", () => {
    expect(parseOne("Позвонить в банк завтра в 3 часа дня.")).toMatchObject({
      title: "Позвонить в банк",
      date: "2026-10-31",
      time: "15:00",
    });
    expect(parseOne("подзвонити мамі о 15 годині")).toMatchObject({
      title: "Подзвонити мамі",
      time: "15:00",
    });
    expect(parseOne("Call the bank at 3 p.m.")).toMatchObject({
      title: "Call the bank",
      time: "15:00",
    });
  });

  it("reads hours, minutes and the part of the day in words", () => {
    const times: [string, string][] = [
      ["созвон в 15 часов", "15:00"],
      ["созвон в 15 часов 30 минут", "15:30"],
      ["созвон в 3:30 дня", "15:30"],
      ["встреча в 10 утра", "10:00"],
      ["ужин в семь вечера", "19:00"],
      ["вынести мусор в 11 ночи", "23:00"],
      ["рейс в 2 часа ночи", "02:00"],
      ["обед в час дня", "13:00"],
      ["зустріч о третій дня", "15:00"],
      ["пробіжка о восьмій ранку", "08:00"],
      ["зустріч о 15-й годині", "15:00"],
      ["tea at three o'clock", "15:00"],
      ["call Marta at 7 in the evening", "19:00"],
      ["обед в полдень", "12:00"],
      ["обід опівдні", "12:00"],
      ["lunch at noon", "12:00"],
    ];
    for (const [text, time] of times) {
      expect(parseOne(text).time, text).toBe(time);
    }
  });

  it("takes 1 to 6 o'clock as the afternoon unless the part of the day is said", () => {
    expect(parseOne("забрать посылку в 3 часа").time).toBe("15:00");
    expect(parseOne("зустріч о шостій").time).toBe("18:00");
    expect(parseOne("пробежка в 6 утра").time).toBe("06:00");
    expect(parseOne("встреча в 8 часов").time).toBe("08:00");
    expect(parseOne("обед в 12 часов").time).toBe("12:00");
    // A clock time is taken as written.
    expect(parseOne("рейс в 3:30").time).toBe("03:30");
  });

  it("does not mistake a length of time or a count for a time", () => {
    for (const text of [
      "поспать 3 часа",
      "отпуск на 3 дня",
      "через 3 дня позвонить",
      "не ехать в час пик",
      "читати 2 години",
      "в три раза больше воды",
    ]) {
      expect(parseOne(text), text).toMatchObject({
        title: text.charAt(0).toLocaleUpperCase() + text.slice(1),
        time: null,
      });
    }
  });
});
