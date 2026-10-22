// Watches the focused text field after a dictation and prints its last text that still contains the dictation,
// so edits made before sending or clearing the field are captured.
// usage: edit-watch <seconds>, dictated text on stdin
import AppKit
import ApplicationServices

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
  var value: CFTypeRef?
  return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
}

func words(_ text: String) -> Set<String> {
  Set(text.lowercased().split { !$0.isLetter && !$0.isNumber }.map(String.init))
}

let dictated = words(String(decoding: FileHandle.standardInput.readDataToEndOfFile(), as: UTF8.self))
let seconds = Double(CommandLine.arguments.dropFirst().first ?? "") ?? 60
guard !dictated.isEmpty, let app = NSWorkspace.shared.frontmostApplication else { exit(1) }

// The system-wide element fails with kAXErrorCannotComplete on macOS 26, the frontmost app works
let appElement = AXUIElementCreateApplication(app.processIdentifier)
var focusedElement = attribute(appElement, kAXFocusedUIElementAttribute)
if focusedElement == nil {
  // Electron and Chromium apps only build their accessibility tree once asked to
  AXUIElementSetAttributeValue(appElement, "AXManualAccessibility" as CFString, kCFBooleanTrue)
  usleep(100_000)
  focusedElement = attribute(appElement, kAXFocusedUIElementAttribute)
}
guard let focused = focusedElement else { exit(1) }
let element = focused as! AXUIElement

var last: String?
let start = Date()
while Date().timeIntervalSince(start) < seconds {
  guard let text = attribute(element, kAXValueAttribute) as? String else { break }
  // Below half of the dictated words means the field was sent, cleared or rewritten.
  // Right after inserting, some apps still report the old text, so wait a few seconds for the dictation to show up.
  if Double(words(text).intersection(dictated).count) < Double(dictated.count) * 0.5 {
    if last != nil || Date().timeIntervalSince(start) > 5 { break }
  } else {
    last = text
  }
  sleep(1)
}
guard let last else { exit(1) }
print(last, terminator: "")
