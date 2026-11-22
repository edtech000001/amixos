// Shared by the main app and the AmiWidget extension (see expo-target.config.js).
// KEEP AmiCallAttributes IN SYNC with modules/ami-call-native/ios/AmiCallModule.swift
// — ActivityKit matches the widget to the app's activity by this type.

import ActivityKit
import AppIntents
import Foundation

let amiCallActionNotification = Notification.Name("AmiCallAction")

@available(iOS 16.1, *)
struct AmiCallAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// connecting | listening | thinking | speaking
    var status: String
    /// Localized status line ("Te escucho…").
    var label: String
    var muted: Bool
  }
  var title: String
  var muteLabel: String
  var unmuteLabel: String
  var endLabel: String
}

// Lock-screen / Dynamic Island buttons. They run in the APP process, which is
// alive during a call (background audio); the bridge forwards them to JS.
@available(iOS 17.0, *)
struct ToggleAmiMuteIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Mute Ami"
  static var isDiscoverable: Bool = false
  func perform() async throws -> some IntentResult {
    NotificationCenter.default.post(name: amiCallActionNotification, object: "mute")
    return .result()
  }
}

@available(iOS 17.0, *)
struct EndAmiCallIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "End Ami call"
  static var isDiscoverable: Bool = false
  func perform() async throws -> some IntentResult {
    NotificationCenter.default.post(name: amiCallActionNotification, object: "end")
    return .result()
  }
}

// "Oye Siri, habla con Ami": opens Amixos and starts the call. The flag covers
// a cold launch (JS isn't listening yet); the notification a running app.
@available(iOS 16.0, *)
struct StartAmiCallIntent: AppIntent {
  static var title: LocalizedStringResource = "Talk to Ami"
  static var description = IntentDescription("Opens Amixos and starts a voice call with Ami.")
  static var openAppWhenRun: Bool = true
  @MainActor
  func perform() async throws -> some IntentResult {
    UserDefaults.standard.set(true, forKey: "ami.pendingStart")
    NotificationCenter.default.post(name: amiCallActionNotification, object: "start")
    return .result()
  }
}

// Phrases must contain the app name; INAlternativeAppNames (app.json) makes
// "Ami" count as one, so "Habla con Ami" works. Spanish: AppShortcuts.xcstrings.
@available(iOS 17.0, *)
struct AmiShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: StartAmiCallIntent(),
      phrases: [
        "Talk to \(.applicationName)",
        "Call \(.applicationName)",
        "Start a call with \(.applicationName)",
        "Open \(.applicationName) call",
      ],
      shortTitle: "Talk to Ami",
      systemImageName: "waveform"
    )
  }
}
