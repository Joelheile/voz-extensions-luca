# voz-meeting

A [Voz](https://github.com/Joelheile/voz) extension that records meetings. Press the hotkey to start, press it again to stop. Voz transcribes your microphone and everything your Mac plays, such as Zoom, Meet or Teams, on your Mac and copies the transcript to the clipboard.

Each meeting is saved as `YYYY-MM-DD-HHMM.md` and `.m4a` in `~/Documents/Voz Meetings`. Words from your Voz dictionary are boosted.

## Install

```
voz install voz-meeting
```

Needs Apple Silicon and the macOS version Voz requires. macOS asks Voz for system audio access on the first recording.

## Settings

Change them on the Extensions page in Voz.

- **Hotkey**: default `ctrl+opt+m`. A single key without modifiers works too, such as `end`
- **Folder**: where transcripts and recordings go
- **Copy transcript to clipboard**: on by default

Other extensions can rewrite a transcript before it is saved:

```ts
voz.events.on<{ text: string }>("meeting:transcript", (transcript) => {
  transcript.text = transcript.text.replaceAll("Cloud", "Claude");
});
```

## Notes

- Without headphones your speakers reach the microphone, so other people can appear twice in the transcript
- The transcript has no speaker labels
- `meeting-rec` is built from `meeting-rec.swift`: `swiftc -O -swift-version 5 meeting-rec.swift -o meeting-rec`
