import { defineExtension, type Context } from "voz";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const recorder = join(import.meta.dir, "meeting-rec");
const vozBinary = "/Applications/voz.app/Contents/MacOS/voz";
const vozDatabase = join(homedir(), "Library/Application Support/Voz/history.sqlite");

type Recording = { pid: number; name: string; audio: string };

// Another app holding the microphone this long is most likely a call, not a short voice note
const suggestAfter = 20_000;

const osascript = (script: string) => Bun.spawn(["/usr/bin/osascript", "-e", script], { stdout: "pipe", stderr: "ignore" });
const banner = (text: string) => osascript(`display notification ${JSON.stringify(text)} with title "Voz"`);

async function micInUse() {
  const run = Bun.spawn([recorder, "--mic-in-use"], { stdout: "pipe", stderr: "ignore" });
  return (await new Response(run.stdout).text()).trim() === "1";
}

async function confirmRecording() {
  const run = osascript('display dialog "A meeting seems to have started. Record it?" with title "Voz" buttons {"Not now", "Record"} default button "Record" cancel button "Not now" giving up after 60');
  return (await new Response(run.stdout).text()).includes("button returned:Record");
}

const isRunning = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// Voz keeps its dictionary in its history database; boost those words in meetings too
function vocabulary(): string[] {
  try {
    const database = new Database(vozDatabase, { readonly: true });
    const words = database.query("select word from vocabulary").all().map((row: any) => String(row.word));
    database.close();
    return words;
  } catch {
    return [];
  }
}

export default defineExtension((voz) => {
  const settings = voz.settings({
    hotkey: { type: "string", title: "Hotkey", description: "Starts and stops a recording", default: "ctrl+opt+m" },
    folder: { type: "string", title: "Folder", description: "Where transcripts and recordings go", default: join(homedir(), "Documents/Voz Meetings") },
    clipboard: { type: "boolean", title: "Copy transcript to clipboard", default: true },
    suggest: { type: "boolean", title: "Suggest recording meetings", description: "Asks to record when another app uses the microphone for a while", default: true },
  });
  // Kept on disk so a running recording survives extension reloads
  const statePath = join(voz.paths.data, "recording.json");

  function start(notify: (text: string) => void) {
    mkdirSync(settings.folder, { recursive: true });
    const name = new Date().toLocaleString("sv-SE").slice(0, 16).replace(" ", "-").replace(":", "");
    const audio = join(settings.folder, `${name}.m4a`);
    const child = Bun.spawn([recorder, audio], { stdout: "ignore", stderr: "pipe" });
    child.unref();
    return Bun.sleep(1000).then(async () => {
      if (child.exitCode !== null) {
        voz.log(`Recorder failed: ${await new Response(child.stderr).text()}`);
        return notify("Meeting recording failed");
      }
      writeFileSync(statePath, JSON.stringify({ pid: child.pid, name, audio }));
      notify("Recording meeting");
    });
  }

  async function stop(ctx: Context) {
    const recording: Recording = JSON.parse(readFileSync(statePath, "utf8"));
    rmSync(statePath);
    if (isRunning(recording.pid)) process.kill(recording.pid, "SIGTERM");
    ctx.notify("Transcribing meeting …");
    transcribe(recording)
      .then((path) => ctx.notify(`${settings.clipboard ? "Copied and saved" : "Saved"} ${path.split("/").pop()}`))
      .catch((error) => {
        voz.log(`Transcription failed: ${error}`);
        ctx.notify("Transcription failed, the recording is in the meeting folder");
      });
  }

  async function transcribe(recording: Recording) {
    // The recorder mixes both tracks after it stops, which takes a few seconds for long meetings
    while (isRunning(recording.pid)) await Bun.sleep(250);
    if (!existsSync(recording.audio)) throw new Error("No recording");

    const words = vocabulary();
    const run = Bun.spawn([vozBinary, "--transcribe", recording.audio, ...(words.length ? ["--vocab", words.join(",")] : [])], { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(run.stdout).text();
    if ((await run.exited) !== 0) throw new Error(await new Response(run.stderr).text());
    // Other extensions can rewrite the transcript by changing payload.text
    const transcript = { text: output.split("\n").filter((line) => !/^engine .*, transcription [0-9.]+s$/.test(line)).join("\n").trim() };
    voz.events.emit("meeting:transcript", transcript);

    const path = join(settings.folder, `${recording.name}.md`);
    writeFileSync(path, `# Meeting ${recording.name}\n\n${transcript.text}\n`);
    if (settings.clipboard) await Bun.spawn(["/usr/bin/pbcopy"], { stdin: new Blob([transcript.text]), env: { LANG: "en_US.UTF-8" } }).exited;
    return path;
  }

  voz.registerAction({
    id: "meeting",
    name: "Record meeting",
    hotkey: settings.hotkey,
    run: (ctx) => (existsSync(statePath) ? stop(ctx) : start(ctx.notify)),
  });

  // Asks once per microphone session, so declining or stopping early does not ask again until the call ends
  let busySince = 0;
  let asked = false;
  async function watchMicrophone() {
    if (!settings.suggest) return;
    if (existsSync(statePath)) {
      asked = true;
      return;
    }
    if (!(await micInUse())) {
      busySince = 0;
      asked = false;
      return;
    }
    busySince ||= Date.now();
    if (asked || Date.now() - busySince < suggestAfter) return;
    asked = true;
    if ((await confirmRecording()) && !existsSync(statePath)) await start(banner);
  }
  (async () => {
    while (true) {
      await Bun.sleep(5000);
      await watchMicrophone().catch((error) => voz.log(`Meeting detection failed: ${error}`));
    }
  })();
});
