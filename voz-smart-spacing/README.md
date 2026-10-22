# voz-smart-spacing

A [Voz](https://github.com/Joelheile/voz) extension. When you dictate twice in a row, the second dictation sticks to the first: `First sentence.Second sentence.` This extension looks at the character before the cursor and adds a space when one is missing.

It adds nothing at the start of a field, after a space or line break, after an opening bracket or quote, or when the dictation starts with punctuation. If an app does not expose its text to macOS accessibility, it changes nothing.

## Install

```
voz install voz-smart-spacing
```

Needs Apple Silicon. `char-before-cursor` is built from `char-before-cursor.swift`: `swiftc -O char-before-cursor.swift -o char-before-cursor`
