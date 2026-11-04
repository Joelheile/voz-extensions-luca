import { describe, expect, test } from "bun:test";
import type { Transcript } from "voz";
import { enhance, lines, render, split } from "./enhance";
import { meetingFile, merge, shift, transcriptMarkdown } from "./meeting";

const transcript = (turns: Transcript["turns"]): Transcript => ({
  text: turns.map((turn) => turn.text).join(" "),
  seconds: turns.at(-1)?.end ?? 0,
  speakers: 1,
  turns,
});

describe("meeting", () => {
  test("joins sessions on one timeline", () => {
    const first = transcript([
      { speaker: 0, you: true, start: 0, end: 2, text: "Hi all." },
    ]);
    const second = transcript([
      { speaker: 1, start: 1, end: 3, text: "Welcome back." },
    ]);
    const joined = merge([
      shift({ offset: 0, transcript: first }),
      shift({ offset: 60, transcript: second }),
    ]);
    expect(joined.turns.map((turn) => turn.start)).toEqual([0, 61]);
    expect(joined.seconds).toBe(63);
    expect(transcriptMarkdown(joined)).toBe(
      "**[00:00:00] You:** Hi all.\n\n**[00:01:01] Speaker 1:** Welcome back.",
    );
  });

  test("leaves out empty sections", () => {
    const file = meetingFile({
      title: "",
      date: new Date(2026, 10, 3, 9, 30),
      summary: "",
      notes: "ship fri",
      transcript: "",
    });
    expect(file).toBe("# Meeting 2026-11-03 09:30\n\n## Notes\n\nship fri\n");
  });
});

describe("enhance", () => {
  test("splits long transcripts into parts of whole lines", () => {
    const parts = split(["a b c", "d e", "f g h i j"], 5);
    expect(parts).toEqual(["a b c\nd e", "f g h i j"]);
    expect(split(["a b c d e f g"], 3)).toEqual(["a b c", "d e f", "g"]);
  });

  test("labels your lines", () => {
    const heard = transcript([
      { speaker: 0, you: true, start: 0, end: 1, text: "Ship Friday?" },
      { speaker: 2, start: 1, end: 2, text: "Yes." },
    ]);
    expect(lines(heard)).toEqual(["You: Ship Friday?", "Speaker 2: Yes."]);
  });

  test("renders sections and to-dos as Markdown", () => {
    const markdown = render(
      [
        { heading: "Release", bullets: ["Ships Friday"] },
        { heading: "Empty", bullets: [] },
      ],
      ["Milan: write the changelog"],
    );
    expect(markdown).toBe(
      "### Release\n- Ships Friday\n\n### To-dos\n- [ ] Milan: write the changelog",
    );
  });

  test("asks once per part, then once to write the notes from your notes", async () => {
    const prompts: string[] = [];
    const generate = (async (request: { prompt: string }) => {
      prompts.push(request.prompt);
      if (request.prompt.startsWith("My notes:\nship fri\n\nFrom")) {
        return {
          title: "Release plan",
          sections: [
            { heading: "Ship Friday", bullets: ["Milan owns the changelog"] },
          ],
        };
      }
      return {
        points: ["Milan owns the changelog"],
        todos: ["Milan: changelog", "milan: changelog!"],
      };
    }) as never;
    const long = transcript(
      Array.from({ length: 3 }, (_, index) => ({
        speaker: 1,
        start: index,
        end: index + 1,
        text: "word ".repeat(600),
      })),
    );
    const summary = await enhance(generate, "ship fri", long);
    expect(prompts.length).toBe(4);
    expect(summary).toEqual({
      title: "Release plan",
      markdown:
        "### Ship Friday\n- Milan owns the changelog\n\n### To-dos\n- [ ] Milan: changelog",
    });
  });
});
