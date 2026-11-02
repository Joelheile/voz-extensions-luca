import { defineExtension, type ExtensionAPI, type RunningActivity } from "voz";
import { existsSync, mkdirSync, readFileSync, watch, writeFileSync, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type RecapState = {
  pid: number;
  recording?: { title: string; since: string };
  lastNotes?: { meetingId: number; title: string; seconds: number; readyAt: string };
};

export type Environment = {
  applications: string;
  home: string;
  open(url: string): Promise<boolean>;
  notes(cli: string, supportDir: string, meetingId: number): Promise<string>;
};

const defaults: Environment = {
  applications: "/Applications",
  home: homedir(),
  open: async (url) => (await Bun.spawn(["/usr/bin/open", "-g", url], { stdout: "ignore", stderr: "ignore" }).exited) === 0,
  async notes(cli, supportDir, meetingId) {
    const child = Bun.spawn([cli, "meetings", "get", String(meetingId), "--support-dir", supportDir], { stdout: "pipe", stderr: "ignore" });
    return JSON.parse(await new Response(child.stdout).text()).data?.formattedNotes ?? "";
  },
};

const isRunning = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export function recap(env: Environment = defaults) {
  return (voz: ExtensionAPI) => {
    const settings = voz.settings({
      hotkey: { type: "string", title: "Hotkey", description: "Starts and stops a meeting, such as ctrl+opt+m", default: "" },
    });

    const name = ["Recap", "RecapDevA"].find((app) => existsSync(join(env.applications, `${app}.app`)));
    const scheme = name?.toLowerCase();
    const supportDir = join(env.home, "Library/Application Support", name ?? "Recap");
    const statePath = join(supportDir, "state.json");
    const seenPath = join(voz.paths.data, "seen");

    let state: RecapState | undefined;
    let activity: RunningActivity | undefined;
    let activityKey = "";
    let watcher: FSWatcher | undefined;

    async function send(path: string, notify: (text: string) => void) {
      if (!name) return notify("Recap is not installed");
      if (!(await env.open(`${scheme}://${path}`))) notify("Recap did not respond");
    }

    const start = voz.registerAction({ id: "start", name: "Record meeting", run: (ctx) => send("record/start", ctx.notify) });
    const stop = voz.registerAction({ id: "stop", name: "Stop meeting", hidden: true, run: (ctx) => send("record/stop", ctx.notify) });
    if (settings.hotkey) {
      voz.registerAction({ id: "toggle", name: "Record or stop meeting", hotkey: settings.hotkey, hidden: true, run: (ctx) => send("record/toggle", ctx.notify) });
    }
    for (const phrase of ["meeting starten", "start meeting"]) voz.registerCommand({ phrase, run: (_, ctx) => send("record/start", ctx.notify) });
    for (const phrase of ["meeting stoppen", "meeting beenden", "stop meeting"]) voz.registerCommand({ phrase, run: (_, ctx) => send("record/stop", ctx.notify) });

    function showRecording() {
      const current = state && isRunning(state.pid) ? state.recording : undefined;
      const key = current ? `${current.since}|${current.title}` : "";
      if (key === activityKey) return;
      activityKey = key;
      activity?.end();
      activity = current && voz.startActivity({ title: `Meeting · ${current.title}`, since: Date.parse(current.since), stop: (ctx) => send("record/stop", ctx.notify) });
      start.update({ hidden: !!current });
      stop.update({ hidden: !current });
    }

    async function addNotes() {
      const notes = state?.lastNotes;
      const key = notes ? `${notes.meetingId}|${notes.readyAt}` : "";
      const firstLoad = !existsSync(seenPath);
      if (!firstLoad && readFileSync(seenPath, "utf8") === key) return;
      mkdirSync(voz.paths.data, { recursive: true });
      writeFileSync(seenPath, key);
      if (!notes || firstLoad) return;
      const body = await env.notes(join(env.applications, `${name}.app/Contents/MacOS/recap`), supportDir, notes.meetingId).catch((error) => {
        console.log(`Reading notes failed: ${error}`);
        return "";
      });
      voz.addHistory({ text: [notes.title, body.trim(), `${scheme}://meeting/${notes.meetingId}`].filter(Boolean).join("\n\n"), seconds: notes.seconds });
    }

    function readState() {
      try {
        state = JSON.parse(readFileSync(statePath, "utf8"));
      } catch {
        state = undefined;
      }
      showRecording();
      addNotes().catch((error) => console.log(`Adding notes failed: ${error}`));
    }

    function watchState() {
      if (watcher || !name || !existsSync(supportDir)) return;
      watcher = watch(supportDir, (_, file) => {
        if (!file || file === "state.json") readState();
      });
      readState();
      // FSEvents drops writes in its first few hundred milliseconds.
      setTimeout(readState, 500);
    }

    watchState();
    setInterval(() => {
      watchState();
      showRecording();
    }, 5000);
  };
}

export default defineExtension(recap());
