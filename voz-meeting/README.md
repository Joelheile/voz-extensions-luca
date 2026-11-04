# voz-meeting

A [Voz](https://github.com/Joelheile/voz) extension that records meetings. Press the hotkey to start, press it again to stop. Voz transcribes your microphone and everything your Mac plays, such as Zoom, Meet or Teams, live and on your Mac.

While a meeting records, the notch shows the time and the sound Voz hears. Under it, the last two lines of the live transcript show that everything works. When Voz can't hear the meeting, both turn orange while it reconnects. Point at the notch to pause or stop, and at the transcript to open your notes, click to type what matters to you, and switch back to the call to shrink them again. The notes style Markdown: `# heading`, `- list`, `- [ ] to-do`, `**bold**`.

When you stop, Voz writes a summary on your Mac with Apple's on-device model. Your notes are the outline: Voz keeps every point you wrote, adds what was said about it, and lists the to-dos. The summary opens in a notes window, and your edits go into the file.

When another app such as Zoom, Meet or Teams uses your microphone for 20 seconds, Voz asks whether to record the meeting. One click on **Record** starts it, the hotkey stops it.

## What you get

Each meeting is one file, `YYYY-MM-DD-HHMM.md`, next to its recording, `YYYY-MM-DD-HHMM.m4a`:

```md
# Release plan for Friday

## Summary

### Ship Friday

- Milan owns the changelog

### To-dos

- [ ] Milan: write the changelog

## Notes

ship fri

## Transcript

**[00:00:00] You:** Can we ship on Friday?

**[00:00:03] Speaker 1:** Yes, I'll write the changelog.
```

The meeting also lands in your Voz history. Hover it to copy the summary, your notes or the transcript.

## Reliable by design

- Your microphone and the call are transcribed apart, so your lines say **You** and the call's voice coming out of your speakers doesn't show up twice. Speakers on the call are told apart on your Mac.
- When AirPods connect, the microphone stops or the speakers change, Voz restarts the capture.
- When live transcription can't start, the extension tries again a few times. When it can't hear the call, it transcribes your microphone alone.
- The `.m4a` recording is the backup: when live transcription heard nothing, Voz transcribes the recording when you stop.
- Reloading extensions keeps the meeting, your notes and what was said so far.
- When the summary fails, you still get your notes and the transcript.

## Install

```
voz install voz-meeting
```

Needs Voz with extension API 6, a Parakeet speech model picked in Settings, and Apple Silicon. Summaries need Apple Intelligence. Telling your voice apart from the call, pausing, and asking under the notch instead of in a dialog need Voz with API 8. macOS asks Voz for system audio access on the first recording.

## Settings

Change them on the Extensions page in Voz.

- **Hotkey**: default `ctrl+opt+m`. A single key without modifiers works too, such as `end`
- **Folder**: where notes and recordings go. Pick a Google Drive or iCloud folder to back them up
- **Write a summary**: on by default
- **Copy the summary to the clipboard**: on by default. Without a summary, it copies your notes or the transcript
- **Suggest recording meetings**: on by default. Asks once per call, not again after you decline

## Notes

- Speakers are numbers in the order people first talk
- A dictation longer than 20 seconds can trigger the suggestion too
- `meeting-rec` is built from `meeting-rec.swift`: `swiftc -O -swift-version 5 meeting-rec.swift -o meeting-rec`
