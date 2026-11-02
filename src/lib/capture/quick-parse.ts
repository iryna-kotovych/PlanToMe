import { addDays, nextWeekday } from "@/lib/dates";
import { firstOccurrence } from "@/lib/recurrence";
import type { Recurrence } from "@/lib/types";
import type { ParsedTask } from "./types";

// A small rule-based parser for the public demo, which never calls an AI
// service. It understands common English, Russian and Ukrainian phrases for
// days, times and repeats; everything left over becomes the title.

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
  `${TIME_PREFIX}(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm)${NOT_LETTER_AFTER}`,
  "iu",
);
const CLOCK = new RegExp(`${TIME_PREFIX}(\\d{1,2})[:.](\\d{2})(?!\\d)`, "iu");

const DANGLING_WORD = /\s+(?:at|on|in|в|во|у|о|об|на)$/iu;

function clock(hours: number, minutes: number): string | null {
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function meridiem(hours: number, minutes: number, half: string): string | null {
  if (hours < 1 || hours > 12) return null;
  const isPm = half.toLowerCase() === "pm";
  return clock((hours % 12) + (isPm ? 12 : 0), minutes);
}

function parseLine(line: string, today: string): ParsedTask | null {
  let text = line;

  /** Removes the first match of `pattern` from the text and returns it. */
  function take(pattern: RegExp): RegExpExecArray | null {
    const match = pattern.exec(text);
    if (match) {
      text = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`;
    }
    return match;
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
    const twelveHour = take(MERIDIEM);
    if (twelveHour) {
      time = meridiem(
        Number(twelveHour[1]),
        Number(twelveHour[2] ?? 0),
        twelveHour[3] ?? "am",
      );
    } else {
      const twentyFourHour = take(CLOCK);
      if (twentyFourHour) {
        time = clock(Number(twentyFourHour[1]), Number(twentyFourHour[2]));
      }
    }
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
