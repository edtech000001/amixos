import ActivityKit
import ExpoModulesCore

// KEEP IN SYNC with targets/ami-widget/_shared/AmiCall.swift — ActivityKit
// matches the widget's ActivityConfiguration to this activity by this type.
@available(iOS 16.1, *)
struct AmiCallAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var status: String
    var label: String
    var muted: Bool
  }
  var title: String
  var muteLabel: String
  var unmuteLabel: String
  var endLabel: String
}

struct AmiCallStart: Record {
  @Field var title: String = "Ami"
  @Field var muteLabel: String = "Mute"
  @Field var unmuteLabel: String = "Unmute"
  @Field var endLabel: String = "End"
  @Field var status: String = "connecting"
  @Field var label: String = ""
  @Field var muted: Bool = false
}

public class AmiCallModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("AmiCall")
    // { action: "mute" | "end" | "start" } — lock-screen buttons and Siri.
    Events("onAction")

    OnStartObserving {
      self.observer = NotificationCenter.default.addObserver(
        forName: Notification.Name("AmiCallAction"), object: nil, queue: .main
      ) { [weak self] note in
        self?.sendEvent("onAction", ["action": (note.object as? String) ?? ""])
      }
    }
    OnStopObserving {
      if let o = self.observer { NotificationCenter.default.removeObserver(o) }
      self.observer = nil
    }

    /// Siri started a call before JS was listening (cold launch). Read once.
    Function("consumePendingStart") { () -> Bool in
      let d = UserDefaults.standard
      let pending = d.bool(forKey: "ami.pendingStart")
      d.removeObject(forKey: "ami.pendingStart")
      return pending
    }

    AsyncFunction("startActivity") { (args: AmiCallStart) async in
      guard #available(iOS 16.2, *), ActivityAuthorizationInfo().areActivitiesEnabled else { return }
      for a in Activity<AmiCallAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) }
      let attrs = AmiCallAttributes(title: args.title, muteLabel: args.muteLabel, unmuteLabel: args.unmuteLabel, endLabel: args.endLabel)
      let state = AmiCallAttributes.ContentState(status: args.status, label: args.label, muted: args.muted)
      _ = try? Activity.request(attributes: attrs, content: .init(state: state, staleDate: nil), pushType: nil)
    }

    AsyncFunction("updateActivity") { (status: String, label: String, muted: Bool) async in
      guard #available(iOS 16.2, *) else { return }
      let state = AmiCallAttributes.ContentState(status: status, label: label, muted: muted)
      for a in Activity<AmiCallAttributes>.activities { await a.update(.init(state: state, staleDate: nil)) }
    }

    AsyncFunction("endActivity") { () async in
      guard #available(iOS 16.2, *) else { return }
      for a in Activity<AmiCallAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) }
    }
  }
}
