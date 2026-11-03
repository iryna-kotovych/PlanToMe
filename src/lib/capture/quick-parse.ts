import { addDays, nextWeekday } from "@/lib/dates";
import { firstOccurrence } from "@/lib/recurrence";
import type { Recurrence } from "@/lib/types";
import type { ParsedTask } from "./types";

// A small rule-based parser for the public demo, which never calls an AI
// service, and for typed text in the real app until the AI parser arrives. It
// understands common English, Russian and Ukrainian phrases for days, times
// and repeats; everything left over becomes the title.

const NOT_LETTER_BEFORE = "(?<![\\p{L}\\p{N}])";
const NOT_LETTER_AFTER = "(?![\\p{L}\\p{N}])";
const APOSTROPHE = "['ʼ’]?";

/** Whole-word, case-insensitive match; `\b` does not understand Cyrillic. */
function phrase(pattern: string): RegExp {
  return new RegExp(
    `${NOT_LETTER_BEFORE}(?:${pattern})${NOT_LETTER_AFTER}`,
    "iu",
  );
}

// 0 = Sunday … 6 = Saturday, with the case forms used after "в/у/кожну/що".
const WEEKDAY_FORMS: [number, string][] = [
  [1, "monday|понедельник|понедельника|понеділок|понеділка"],
  [2, "tuesday|вторник|вторника|вівторок|вівторка"],
  [3, "wednesday|среду|среда|среды|середу|середа|середи"],
  [4, "thursday|четверга|четверг|четвер"],
  [
    5,
    `friday|пятницу|пятница|пятницы|п${APOSTROPHE}ятницю|п${APOSTROPHE}ятниця|п${APOSTROPHE}ятниці`,
  ],
  [6, "saturday|субботу|суббота|субботы|суботу|субота|суботи"],
  [0, "sunday|воскресенье|воскресенья|неділю|неділя|неділі"],
];

const WEEKDAYS = phrase(
  "every\\s+weekday|on\\s+weekdays|weekdays|по\\s+будням|в\\s+будни|по\\s+буднях|у\\s+будні|в\\s+будні|щобудня",
);
const DAILY = phrase(
  "every\\s*day|daily|each\\s+day|каждый\\s+день|ежедневно|щодня|щоденно|кожного\\s+дня|кожен\\s+день|кожний\\s+день",
);
const WEEKLY = WEEKDAY_FORMS.map(
  ([weekday, forms]) =>
    [
      weekday,
      phrase(
        `(?:every|each|каждый|каждую|каждое|кожного|кожну|кожен|кожний)\\s+(?:${forms})|що(?:${forms})`,
      ),
    ] as const,
);
const RELATIVE_DAYS: [RegExp, number][] = [
  [phrase("(?:the\\s+)?day\\s+after\\s+tomorrow|послезавтра|післязавтра"), 2],
  [phrase("tomorrow|завтра"), 1],
  [phrase("today|tonight|сегодня|сьогодні"), 0],
];
const ON_WEEKDAY = WEEKDAY_FORMS.map(
  ([weekday, forms]) =>
    [
      weekday,
      phrase(`(?:(?:on|next|this|в|во|у)\\s+)?(?:${forms})`),
    ] as const,
);

const TIME_PREFIX = `${NOT_LETTER_BEFORE}(?:(?:at|from|в|во|о|об|с|з|від)\\s+)?`;
const RANGE = new RegExp(
  `${TIME_PREFIX}(\\d{1,2})[:.](\\d{2})\\s*(?:-|–|—|to|till|until|до)\\s*(\\d{1,2})[:.](\\d{2})(?!\\d)`,
  "iu",
);
const MERIDIEM = new RegExp(
  `${TIME_PREFIX}(\\d{1,2})(?:[:.](\\d{2}))?\\s*([ap])\\.?m\\.?${NOT_LETTER_AFTER}`,
  "iu",
);
const CLOCK = new RegExp(`${TIME_PREFIX}(\\d{1,2})[:.](\\d{2})(?!\\d)`, "iu");
const NOON = phrase("(?:(?:at|в|о)\\s+)?(?:noon|midday|полдень|полудні)|опівдні");

// Times in words, as the keyboard's dictation types them: "в 15 часов",
// "в 3 часа дня", "о 15 годині", "о третій", "at 7 in the evening". A number on
// its own isn't a time ("поспать 3 часа", "на 3 дня"): it needs "в/о/at" before
// it and an hour word or a part of the day after it, unless it is a Ukrainian
// ordinal, which always names the hour.

// 1 to 12 in words.
const HOUR_NUMBERS: [number, string][] = [
  // "в час дня" is 1 p.m.
  [1, "one|час|першій"],
  [2, "two|два|другій"],
  [3, "three|три|третій"],
  [4, "four|четыре|четвертій"],
  [5, `five|пять|п${APOSTROPHE}ятій`],
  [6, "six|шесть|шостій"],
  [7, "seven|семь|сьомій"],
  [8, "eight|восемь|восьмій"],
  [9, `nine|девять|дев${APOSTROPHE}ятій`],
  [10, "ten|десять|десятій"],
  [11, "eleven|одиннадцать|одинадцятій"],
  [12, "twelve|двенадцать|дванадцятій"],
];

type DayPart = "morning" | "afternoon" | "evening" | "night";

const DAY_PARTS: [DayPart, string][] = [
  ["morning", "утра|ранку|in\\s+the\\s+morning|a\\.?m\\.?"],
  ["afternoon", "дня|in\\s+the\\s+afternoon|p\\.?m\\.?"],
  ["evening", "вечера|вечора|in\\s+the\\s+evening"],
  ["night", "ночи|ночі|at\\s+night"],
];

const HOUR_UNIT = "часов|часа|час|ч|годині|години|година|годину|год|o['’]?\\s?clock";
const MINUTE_UNIT =
  "минуты|минута|минут|мин|хвилини|хвилина|хвилин|хв|minutes|minute|min";

function anyOf(table: [unknown, string][]): string {
  return table.map(([, forms]) => forms).join("|");
}

function wholeWords<T>(table: [T, string][]): (readonly [T, RegExp])[] {
  return table.map(
    ([value, forms]) => [value, new RegExp(`^(?:${forms})$`, "iu")] as const,
  );
}

const SPOKEN = new RegExp(
  `${NOT_LETTER_BEFORE}(?:at|from|в|во|о|об|с|з|від)\\s+` +
    `(?:(?<digits>\\d{1,2})(?:[:.](?<clockMinutes>\\d{2}))?(?:-?(?<ordinal>й|ій))?` +
    `|(?<word>${anyOf(HOUR_NUMBERS)}))` +
    `(?:\\s*(?<unit>${HOUR_UNIT})\\.?${NOT_LETTER_AFTER})?` +
    `(?:\\s+(?<minutes>\\d{1,2})\\s*(?:${MINUTE_UNIT})\\.?${NOT_LETTER_AFTER})?` +
    `(?:\\s+(?<part>${anyOf(DAY_PARTS)})${NOT_LETTER_AFTER})?${NOT_LETTER_AFTER}`,
  "giu",
);
const HOUR_WORDS = wholeWords(HOUR_NUMBERS);
const DAY_PART_WORDS = wholeWords(DAY_PARTS);

const DANGLING_WORD = /\s+(?:at|on|in|в|во|у|о|об|на)$/iu;

function clock(hours: number, minutes: number): string | null {
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function meridiem(hours: number, minutes: number, isPm: boolean): string | null {
  if (hours < 1 || hours > 12) return null;
  return clock((hours % 12) + (isPm ? 12 : 0), minutes);
}

function lookUp<T>(table: (readonly [T, RegExp])[], text: string): T | undefined {
  return table.find(([, pattern]) => pattern.test(text))?.[0];
}

function isSpokenTime(match: RegExpExecArray): boolean {
  const { ordinal, word, unit, part } = match.groups ?? {};
  return Boolean(unit || part || ordinal || word?.toLowerCase().endsWith("ій"));
}

/**
 * The time a SPOKEN match names. Without a part of the day, 1 to 6 o'clock is
 * the afternoon ("в 3 часа" is 15:00) and 7 to 12 is taken as said.
 */
function spokenTime(match: RegExpExecArray): string | null {
  const { digits, clockMinutes, minutes, word, part } = match.groups ?? {};
  const hours = digits ? Number(digits) : lookUp(HOUR_WORDS, word);
  const dayPart = part ? lookUp(DAY_PART_WORDS, part) : undefined;
  const mins = Number(clockMinutes ?? minutes ?? 0);
  if (hours === undefined) return null;
  if (hours === 0 || hours > 12) return clock(hours, mins);
  if (!dayPart) return clock(hours <= 6 ? hours + 12 : hours, mins);
  // At night: the small hours ("в 2 ночи") or late evening ("в 11 ночи").
  const isPm =
    dayPart === "afternoon" ||
    dayPart === "evening" ||
    (dayPart === "night" && hours >= 6 && hours < 12);
  return meridiem(hours, mins, isPm);
}

function parseLine(line: string, today: string): ParsedTask | null {
  let text = line;

  function cut(match: RegExpExecArray) {
    text = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`;
  }

  /** Removes the first match of `pattern` from the text and returns it. */
  function take(pattern: RegExp): RegExpExecArray | null {
    const match = pattern.exec(text);
    if (match) cut(match);
    return match;
  }

  /** Removes the first single time from the text and returns it. */
  function takeTime(): string | null {
    const twelveHour = take(MERIDIEM);
    if (twelveHour) {
      return meridiem(
        Number(twelveHour[1]),
        Number(twelveHour[2] ?? 0),
        twelveHour[3].toLowerCase() === "p",
      );
    }
    if (take(NOON)) return "12:00";
    const spoken = [...text.matchAll(SPOKEN)].find(isSpokenTime);
    if (spoken) {
      cut(spoken);
      return spokenTime(spoken);
    }
    const twentyFourHour = take(CLOCK);
    return twentyFourHour
      ? clock(Number(twentyFourHour[1]), Number(twentyFourHour[2]))
      : null;
  }

  let recurrence: Recurrence | null = null;
  if (take(WEEKDAYS)) recurrence = { kind: "weekdays" };
  else if (take(DAILY)) recurrence = { kind: "daily" };
  else {
    for (const [weekday, pattern] of WEEKLY) {
      if (take(pattern)) {
        recurrence = { kind: "weekly", days: [weekday] };
        break;
      }
    }
  }

  let date: string | null = null;
  for (const [pattern, offset] of RELATIVE_DAYS) {
    if (take(pattern)) {
      date = addDays(today, offset);
      break;
    }
  }
  if (date === null && recurrence === null) {
    for (const [weekday, pattern] of ON_WEEKDAY) {
      if (take(pattern)) {
        date = nextWeekday(today, weekday);
        break;
      }
    }
  }

  let time: string | null = null;
  let endTime: string | null = null;
  const range = take(RANGE);
  if (range) {
    time = clock(Number(range[1]), Number(range[2]));
    endTime = clock(Number(range[3]), Number(range[4]));
    // "10:00-10:00" has no length; an earlier end means the next morning.
    if (endTime === time) endTime = null;
  } else {
    time = takeTime();
  }

  const cleaned = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(DANGLING_WORD, "")
    .replace(/^[\s,.;:–—-]+|[\s,.;:–—-]+$/g, "");
  const title = cleaned || line.trim();
  if (!title) return null;

  const start = date ?? today;
  return {
    title: title.charAt(0).toLocaleUpperCase() + title.slice(1),
    date: recurrence ? firstOccurrence(recurrence, start) : start,
    time,
    endTime: time ? endTime : null,
    recurrence,
    notes: null,
    location: null,
  };
}

/** One task per line (or per ";"). No day mentioned means today. */
export function quickParse(input: string, today: string): ParsedTask[] {
  return input
    .split(/[\n;]+/)
    .map((line) => parseLine(line, today))
    .filter((task): task is ParsedTask => task !== null);
}
