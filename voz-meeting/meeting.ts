import type { Transcript } from "voz";

/** What one live session heard. `offset` is when it started, in seconds since the meeting began. */
export type Part = { offset: number; transcript: Transcript };

export function shift({ offset, transcript }: Part): Transcript {
  return {
    ...transcript,
    seconds: transcript.seconds + offset,
    turns: transcript.turns.map((turn) => ({
      ...turn,
      start: turn.start + offset,
      end: turn.end + offset,
    })),
  };
}

/** Joins the sessions of one meeting, such as before and after an extension reload */
export function merge(transcripts: Transcript[]): Transcript {
  const turns = transcripts.flatMap((transcript) => transcript.turns);
  return {
    text: transcripts
      .map((transcript) => transcript.text.trim())
      .filter(Boolean)
      .join(" "),
    seconds: Math.max(
      0,
      ...transcripts.map((transcript) => transcript.seconds),
    ),
    speakers: Math.max(
      0,
      ...transcripts.map((transcript) => transcript.speakers),
    ),
    turns,
  };
}

export function transcriptMarkdown(transcript: Transcript) {
  if (!transcript.turns.length) return transcript.text.trim();
  return transcript.turns
    .map(
      (turn) =>
        `**[${timestamp(turn.start)}] ${turn.you ? "You" : `Speaker ${turn.speaker}`}:** ${turn.text.trim()}`,
    )
    .join("\n\n");
}

export function meetingFile(meeting: {
  title: string;
  date: Date;
  summary: string;
  notes: string;
  transcript: string;
}) {
  const sections = [
    `# ${meeting.title || `Meeting ${meeting.date.toLocaleString("sv-SE").slice(0, 16)}`}`,
    meeting.summary && `## Summary\n\n${meeting.summary.trim()}`,
    meeting.notes && `## Notes\n\n${meeting.notes.trim()}`,
    meeting.transcript && `## Transcript\n\n${meeting.transcript.trim()}`,
  ];
  return `${sections.filter(Boolean).join("\n\n")}\n`;
}

function timestamp(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return [whole / 3600, (whole % 3600) / 60, whole % 60]
    .map((part) => String(Math.floor(part)).padStart(2, "0"))
    .join(":");
}
