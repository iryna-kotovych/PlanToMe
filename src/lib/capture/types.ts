import { z } from "zod";
import {
  DaySchema,
  RecurrenceSchema,
  TimeSchema,
  type Attachment,
  type Task,
} from "@/lib/types";

/** One task as understood from text, a voice note or a picture (spec 5.3). */
export const ParsedTaskSchema = z.object({
  title: z.string().trim().min(1),
  date: DaySchema,
  time: TimeSchema.nullable(),
  endTime: TimeSchema.nullable(),
  recurrence: RecurrenceSchema.nullable(),
  notes: z.string().nullable(),
  location: z.string().nullable(),
});

export type ParsedTask = z.infer<typeof ParsedTaskSchema>;

export interface CaptureResult {
  tasks: ParsedTask[];
  /** What the owner said, for voice input. */
  transcript?: string;
}

/** Turns what the owner typed, said or attached into tasks. */
export interface CaptureService {
  fromText(text: string, today: string): Promise<CaptureResult>;
  fromVoice(audio: Blob | null, today: string): Promise<CaptureResult>;
  fromFile(file: File, today: string): Promise<CaptureResult>;
}

export function toTask(
  parsed: ParsedTask,
  id: string,
  attachment: Attachment | null = null,
): Task {
  const note = [parsed.notes, parsed.location && `Location: ${parsed.location}`]
    .filter(Boolean)
    .join("\n");
  return {
    id,
    title: parsed.title,
    date: parsed.date,
    time: parsed.time,
    endTime: parsed.time ? parsed.endTime : null,
    recurrence: parsed.recurrence,
    note: note || null,
    attachment,
    carriedFrom: null,
  };
}
