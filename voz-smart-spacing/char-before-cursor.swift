// Prints the character before the cursor in the focused text field. Prints nothing at the start of a field, exits 1 if unknown.
import AppKit
import ApplicationServices

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
  var value: CFTypeRef?
  return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
}

// The system-wide element fails with kAXErrorCannotComplete on macOS 26, the frontmost app works
guard let app = NSWorkspace.shared.frontmostApplication else { exit(1) }
let appElement = AXUIElementCreateApplication(app.processIdentifier)
var focusedElement = attribute(appElement, kAXFocusedUIElementAttribute)
if focusedElement == nil {
  // Electron and Chromium apps only build their accessibility tree once asked to
  AXUIElementSetAttributeValue(appElement, "AXManualAccessibility" as CFString, kCFBooleanTrue)
  usleep(100_000)
  focusedElement = attribute(appElement, kAXFocusedUIElementAttribute)
}
guard let focused = focusedElement, let rangeValue = attribute(focused as! AXUIElement, kAXSelectedTextRangeAttribute) else { exit(1) }
let element = focused as! AXUIElement
var range = CFRange()
guard AXValueGetValue(rangeValue as! AXValue, .cfRange, &range) else { exit(1) }
if range.location == 0 { exit(0) }

var previous = CFRange(location: range.location - 1, length: 1)
var string: CFTypeRef?
if AXUIElementCopyParameterizedAttributeValue(element, kAXStringForRangeParameterizedAttribute as CFString, AXValueCreate(.cfRange, &previous)!, &string) == .success,
  let character = string as? String, !character.isEmpty
{
  print(character, terminator: "")
  exit(0)
}

guard let text = attribute(element, kAXValueAttribute) as? String else { exit(1) }
let utf16 = text as NSString
guard range.location <= utf16.length else { exit(1) }
print(utf16.substring(with: NSRange(location: range.location - 1, length: 1)), terminator: "")
