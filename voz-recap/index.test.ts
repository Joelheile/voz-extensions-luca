import { afterEach, expect, mock, test } from "bun:test";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

mock.module("voz", () => ({ defineExtension: (extension: unknown) => extension }));
const { recap } = await import("./index");

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function setup({ installed = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "voz-recap-"));
  dirs.push(root);
  const applications = join(root, "Applications");
  const support = join(root, "Library/Application Support/RecapDevA");
  mkdirSync(support, { recursive: true });
  if (installed) mkdirSync(join(applications, "RecapDevA.app"), { recursive: true });

  // Atomic like Recap's own write, so the watcher never reads a half-written file.
  const writeState = (state: object) => {
    writeFileSync(join(support, "state.tmp"), JSON.stringify({ pid: process.pid, ...state }));
    renameSync(join(support, "state.tmp"), join(support, "state.json"));
  };
  const opened: string[] = [];
  const activities: { title: string; since?: number; stop?: (ctx: any) => unknown; ended: boolean }[] = [];
  const actions: Record<string, { hidden?: boolean; run: (ctx: any) => unknown }> = {};
  const commands: Record<string, (event: any, ctx: any) => unknown> = {};
  const history: { text: string; seconds?: number }[] = [];
  const notices: string[] = [];
  const ctx = { notify: (text: string) => notices.push(text) };

  const voz = {
    paths: { data: join(root, "data") },
    settings: () => ({ app: "Automatic", hotkey: "" }),
    registerAction(action: any) {
      actions[action.id] = { ...action };
      return { update: (changes: any) => Object.assign(actions[action.id], changes) };
    },
    registerCommand: (command: any) => (commands[command.phrase] = command.run),
    startActivity(activity: any) {
      const running = { ...activity, ended: false };
      activities.push(running);
      return { end: () => (running.ended = true) };
    },
    addHistory: (entry: any) => history.push(entry),
  };

  // A fake Recap: answers record URLs by writing state.json like the app does.
  const open = async (url: string) => {
    opened.push(url);
    if (url.endsWith("record/start")) writeState({ recording: { meetingId: 3, title: "Meeting", since: "2026-10-31T10:00:00Z" } });
    if (url.endsWith("record/stop")) writeState({});
    return true;
  };
  const load = () =>
    recap({ applications, home: root, open, notes: async (_cli, _dir, id) => `## Zusammenfassung\n- Notiz ${id}` })(voz as any);
  return { load, writeState, opened, activities, actions, commands, history, notices, ctx };
}

// fs.watch delivers through FSEvents, which can take a few hundred milliseconds.
async function until(condition: () => boolean) {
  for (let i = 0; i < 40 && !condition(); i++) await Bun.sleep(50);
  expect(condition()).toBe(true);
}
const settle = () => Bun.sleep(300);
const visible = (t: ReturnType<typeof setup>) => Object.keys(t.actions).filter((id) => !t.actions[id].hidden);
const running = (t: ReturnType<typeof setup>) => t.activities.filter((activity) => !activity.ended);

test("the action starts and stops a Recap recording", async () => {
  const t = setup();
  t.load();
  expect(visible(t)).toEqual(["start"]);

  await t.actions.start.run(t.ctx);
  await until(() => visible(t)[0] === "stop");
  expect(t.opened).toEqual(["recapdeva://record/start"]);
  expect(visible(t)).toEqual(["stop"]);
  expect(running(t).map((activity) => activity.title)).toEqual(["Meeting · Meeting"]);

  await t.actions.stop.run(t.ctx);
  await until(() => visible(t)[0] === "start");
  expect(t.opened.at(-1)).toBe("recapdeva://record/stop");
  expect(visible(t)).toEqual(["start"]);
  expect(running(t)).toEqual([]);
});

test("a recording started in Recap shows as an activity whose Stop stops Recap", async () => {
  const t = setup();
  t.load();
  t.writeState({ recording: { meetingId: 5, title: "Weekly", since: "2026-10-31T09:00:00Z" } });
  await until(() => running(t).length === 1);
  const [activity] = running(t);
  expect(activity.title).toBe("Meeting · Weekly");
  expect(activity.since).toBe(Date.parse("2026-10-31T09:00:00Z"));

  await activity.stop!(t.ctx);
  await until(() => visible(t)[0] === "start");
  expect(t.opened).toEqual(["recapdeva://record/stop"]);
  expect(running(t)).toEqual([]);
});

test("a recording left behind by a crashed Recap is ignored", async () => {
  const t = setup();
  writeFileSync(
    join(dirs[0], "Library/Application Support/RecapDevA/state.json"),
    JSON.stringify({ pid: 999_999, recording: { title: "Alt", since: "2026-10-30T09:00:00Z" } }),
  );
  t.load();
  await settle();
  expect(running(t)).toEqual([]);
});

test("finished notes go to the history once, older notes do not", async () => {
  const t = setup();
  t.writeState({ lastNotes: { meetingId: 1, title: "Alt", seconds: 60, readyAt: "2026-10-30T09:00:00Z" } });
  t.load();
  await settle();
  expect(t.history).toEqual([]);

  const notes = { meetingId: 2, title: "Weekly", seconds: 1800, readyAt: "2026-10-31T10:00:00Z" };
  t.writeState({ lastNotes: notes });
  await until(() => t.history.length === 1);
  t.writeState({ lastNotes: notes, recording: { title: "Next", since: "2026-10-31T11:00:00Z" } });
  await until(() => running(t).length === 1);
  expect(t.history).toEqual([{ text: "Weekly\n\n## Zusammenfassung\n- Notiz 2\n\nrecapdeva://meeting/2", seconds: 1800 }]);
});

test("without Recap, loading is silent and each use gives one notice", async () => {
  const t = setup({ installed: false });
  t.load();
  expect(t.notices).toEqual([]);
  await t.actions.start.run(t.ctx);
  expect(t.notices).toEqual(["Recap is not installed"]);
  expect(t.opened).toEqual([]);
});
