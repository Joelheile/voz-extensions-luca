import { defineExtension, type Context, type ExtensionAPI, type RunningActivity } from "voz";
import { existsSync, mkdirSync, readFileSync, watch, writeFileSync, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type RecapState = {
  pid: number;
  recording?: { meetingId?: number; title: string; since: string };
  lastNotes?: { meetingId: number; title: string; seconds: number; readyAt: string };
};

export type Environment = {
  applications: string;
  home: string;
  open(url: string): Promise<boolean>;
  notes(cli: string, supportDir: string, meetingId: number): Promise<string>;
};

const apps = ["Recap", "RecapDevA"];
const missing = "Recap is not installed";

const defaults: Environment = {
  applications: "/Applications",
  home: homedir(),
  open: async (url) => (await Bun.spawn(["/usr/bin/open", "-g", url], { stdout: "ignore", stderr: "ignore" }).exited) === 0,
  async notes(cli, supportDir, meetingId) {
    const child = Bun.spawn([cli, "meetings", "get", String(meetingId), "--support-dir", supportDir], { stdout: "pipe", stderr: "ignore" });
    const output = JSON.parse(await new Response(child.stdout).text());
    return output.data?.formattedNotes ?? "";
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
      app: { type: "string", title: "App", description: "Which Recap Voz controls", default: "Automatic", options: ["Automatic", ...apps] },
      hotkey: { type: "string", title: "Hotkey", description: "Starts and stops a meeting, such as ctrl+opt+m", default: "" },
    });

    const name = settings.app === "Automatic" ? apps.find((app) => existsSync(join(env.applications, `${app}.app`))) : settings.app;
    const installed = name !== undefined && existsSync(join(env.applications, `${name}.app`));
    const scheme = name?.toLowerCase();
    const supportDir = join(env.home, "Library/Application Support", name ?? "Recap");
    const statePath = join(supportDir, "state.json");
    const seenPath = join(voz.paths.data, "seen");

    let state: RecapState | undefined;
    let activity: RunningActivity | undefined;
    let activityKey = "";
    let watcher: FSWatcher | undefined;
    let lastRaw: string | undefined;

    const recording = () => (state && isRunning(state.pid) ? state.recording : undefined);

    async function send(path: string, notify: (text: string) => void) {
      if (!installed) return notify(missing);
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
      const current = recording();
      const key = current ? `${current.since}|${current.title}` : "";
      if (key === activityKey) return;
      activity?.end();
      activity = undefined;
      activityKey = key;
      start.update({ hidden: !!current });
      stop.update({ hidden: !current });
      if (!current) return;
      activity = voz.startActivity({
        title: `Meeting · ${current.title}`,
        since: Date.parse(current.since),
        stop: (ctx: Context) => send("record/stop", ctx.notify),
      });
    }

    async function addNotes() {
      const notes = state?.lastNotes;
      const key = notes ? `${notes.meetingId}|${notes.readyAt}` : "";
      const seen = existsSync(seenPath) ? readFileSync(seenPath, "utf8") : undefined;
      if (seen === key) return;
      mkdirSync(voz.paths.data, { recursive: true });
      writeFileSync(seenPath, key);
      // On the first load, older notes are already done; only new ones belong in the history.
      if (!notes || seen === undefined) return;
      const cli = join(env.applications, `${name}.app/Contents/MacOS/recap`);
      const body = await env.notes(cli, supportDir, notes.meetingId).catch((error) => {
        console.log(`Reading notes failed: ${error}`);
        return "";
      });
      const link = `${scheme}://meeting/${notes.meetingId}`;
      voz.addHistory({ text: [notes.title, body.trim(), link].filter(Boolean).join("\n\n"), seconds: notes.seconds });
    }

    function readState() {
      let raw = "";
      try {
        raw = readFileSync(statePath, "utf8");
      } catch {}
      if (raw === lastRaw) return;
      lastRaw = raw;
      try {
        state = raw ? JSON.parse(raw) : undefined;
      } catch {
        return;
      }
      showRecording();
      addNotes().catch((error) => console.log(`Adding notes failed: ${error}`));
    }

    function watchState() {
      if (watcher || !installed || !existsSync(supportDir)) return;
      watcher = watch(supportDir, (_, file) => {
        if (!file || file === "state.json") readState();
      });
      readState();
      // FSEvents needs a moment to start; a write in that window raises no event.
      setTimeout(readState, 500);
    }

    watchState();
    // Recap may create its folder only on first launch, and a crashed Recap leaves its recording in state.json.
    setInterval(() => {
      watchState();
      showRecording();
    }, 5000);
  };
}

export default defineExtension(recap());
