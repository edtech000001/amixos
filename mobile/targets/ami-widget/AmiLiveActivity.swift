import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

private func icon(_ s: AmiCallAttributes.ContentState) -> String {
  if s.muted { return "mic.slash.fill" }
  switch s.status {
  case "speaking": return "waveform"
  case "thinking": return "ellipsis"
  default: return "mic.fill"
  }
}

private struct CallButtons: View {
  let context: ActivityViewContext<AmiCallAttributes>
  var body: some View {
    HStack(spacing: 10) {
      Button(intent: ToggleAmiMuteIntent()) {
        Label(context.state.muted ? context.attributes.unmuteLabel : context.attributes.muteLabel,
              systemImage: context.state.muted ? "mic.fill" : "mic.slash.fill")
          .frame(maxWidth: .infinity)
      }
      .tint(.gray)
      Button(intent: EndAmiCallIntent()) {
        Label(context.attributes.endLabel, systemImage: "phone.down.fill")
          .frame(maxWidth: .infinity)
      }
      .tint(.red)
    }
    .buttonStyle(.borderedProminent)
    .font(.subheadline.weight(.semibold))
  }
}

struct AmiLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: AmiCallAttributes.self) { context in
      // Lock screen / banner.
      VStack(alignment: .leading, spacing: 10) {
        HStack(spacing: 10) {
          Image(systemName: icon(context.state))
            .font(.title3.weight(.semibold))
            .foregroundStyle(Color.accentColor)
            .frame(width: 28)
          VStack(alignment: .leading, spacing: 2) {
            Text(context.attributes.title).font(.headline)
            Text(context.state.label).font(.subheadline).foregroundStyle(.secondary)
          }
          Spacer()
        }
        CallButtons(context: context)
      }
      .padding(14)
      .activityBackgroundTint(Color(.systemBackground).opacity(0.9))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Label(context.attributes.title, systemImage: icon(context.state))
            .font(.headline)
            .foregroundStyle(Color.accentColor)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(context.state.label).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
        DynamicIslandExpandedRegion(.bottom) {
          CallButtons(context: context)
        }
      } compactLeading: {
        Image(systemName: icon(context.state)).foregroundStyle(Color.accentColor)
      } compactTrailing: {
        Text(context.attributes.title).font(.caption2.weight(.semibold))
      } minimal: {
        Image(systemName: icon(context.state)).foregroundStyle(Color.accentColor)
      }
    }
  }
}
