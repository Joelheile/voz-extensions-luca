# voz-recap

A [Voz](https://github.com/Joelheile/voz) extension for Recap, a local meeting recorder for the Mac (a fork of [Muesli](https://github.com/Muesli-HQ/muesli)). Voz does dictation, Recap does meetings, and this extension connects the two. It needs Recap; without it, it does nothing.

- **Meeting aufnehmen** / **Meeting stoppen** in the Voz panel start and stop a recording in Recap.
- Say "Meeting starten" or "Meeting stoppen" ("start meeting", "stop meeting") at the end of a dictation to do the same.
- While Recap records, no matter where you started it, the Voz menu bar icon shows a dot and the panel shows "Meeting · <title>" with a timer and Stop.
- When Recap has written the notes, they appear in the Voz history with the meeting title and a `recap://meeting/<id>` link that opens the note in Recap.

Recap writes its state to `~/Library/Application Support/Recap/state.json`, which this extension watches, and handles `recap://record/start|stop|toggle` and `recap://meeting/<id>`.

## Install

```
voz install ./voz-recap
```

## Settings

- **App**: which Recap to control. Automatisch picks `/Applications/Recap.app`, else the dev build `RecapDevA.app`
- **Hotkey**: starts and stops a meeting, such as `ctrl+opt+m`. Empty means none
