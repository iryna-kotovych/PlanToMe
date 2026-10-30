import { quickParse } from "@/lib/capture/quick-parse";
import type { CaptureService, ParsedTask } from "@/lib/capture/types";
import { nextWeekday } from "@/lib/dates";

// The demo never records audio or uploads files: voice and pictures return
// canned examples, so nobody can use up the owner's keys or free quotas.

const VOICE_EXAMPLES = [
  "завтра о 15:00 подзвонити в банк",
  "в пятницу купить подарок",
  "every weekday 8am stretch",
];

let nextVoiceExample = 0;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function invitationExample(today: string): ParsedTask[] {
  return [
    {
      title: "Book club at Luna Café",
      date: nextWeekday(today, 4),
      time: "19:00",
      endTime: "20:30",
      recurrence: null,
      notes: "From the attached invitation.",
      location: "Luna Café",
    },
    {
      title: "Reply to the book club invitation",
      date: today,
      time: null,
      endTime: null,
      recurrence: null,
      notes: null,
      location: null,
    },
  ];
}

export const demoCapture: CaptureService = {
  async fromText(text, today) {
    return { tasks: quickParse(text, today) };
  },
  async fromVoice(_audio, today) {
    await wait(900);
    const transcript =
      VOICE_EXAMPLES[nextVoiceExample++ % VOICE_EXAMPLES.length] ?? "";
    return { transcript, tasks: quickParse(transcript, today) };
  },
  async fromFile(_file, today) {
    await wait(1200);
    return { tasks: invitationExample(today) };
  },
};
