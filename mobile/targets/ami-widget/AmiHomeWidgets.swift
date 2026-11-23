import AppIntents
import SwiftUI
import WidgetKit

// Home-screen / Smart Stack / lock-screen widgets. Data is the JSON snapshot
// the app writes to the App Group (mobile/lib/widgetSnapshot.ts) — KEEP the
// shape in sync. The widget never fetches anything itself.

private let appGroup = "group.com.amixos.app"

struct AmiSnapshot: Decodable {
  struct Labels: Decodable {
    var title = "Hoy", jobs = "trabajos", done = "terminados", next = "Sigue", none = "Sin trabajos hoy"
    var unassigned = "sin cuadrilla", overdue = "vencidas", talk = "Hablar con Ami"
    var money = "Cobros", paidMonth = "cobrado este mes", owed = "vencido por cobrar"
    var noAccess = "Solo para dueños y administradores", open = "Abre Amixos para cargar"
  }
  var date = ""
  var business = ""
  var jobs = 0
  var done = 0
  var unassigned = 0
  var next = ""
  var nextTime = ""
  var overdue = -1
  var overdueAmount = ""
  var paidMonth = ""
  var labels = Labels()

  /// "HOY · Prime Solutions" — which business this is (people with several
  /// businesses see the one last open in the app).
  func header(_ title: String) -> String {
    business.isEmpty ? title.uppercased() : "\(title.uppercased()) · \(business)"
  }

  static func load() -> AmiSnapshot? {
    guard let raw = UserDefaults(suiteName: appGroup)?.string(forKey: "today"),
          let data = raw.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(AmiSnapshot.self, from: data)
  }

  /// Written on an earlier day: job counts no longer describe "today".
  var isStale: Bool {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    return date != f.string(from: Date())
  }
}

struct AmiEntry: TimelineEntry {
  let date: Date
  let snap: AmiSnapshot?
}

struct AmiProvider: TimelineProvider {
  func placeholder(in context: Context) -> AmiEntry {
    AmiEntry(date: .now, snap: AmiSnapshot(jobs: 4, done: 1, unassigned: 1, next: "Remodelación cocina", nextTime: "9:00 AM", overdue: 2, overdueAmount: "$3,200", paidMonth: "$12,400"))
  }
  func getSnapshot(in context: Context, completion: @escaping (AmiEntry) -> Void) {
    completion(context.isPreview ? placeholder(in: context) : AmiEntry(date: .now, snap: AmiSnapshot.load()))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<AmiEntry>) -> Void) {
    // The app reloads us whenever it refreshes the snapshot; also re-read
    // after midnight so yesterday's counts flip to "open the app".
    let midnight = Calendar.current.startOfDay(for: .now.addingTimeInterval(86_400))
    completion(Timeline(entries: [AmiEntry(date: .now, snap: AmiSnapshot.load())], policy: .after(midnight)))
  }
}

private struct OpenAppHint: View {
  let text: String
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Image(systemName: "sun.max.fill").foregroundStyle(Color.accentColor)
      Text(text).font(.caption).foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

private struct TalkButton: View {
  let label: String
  var body: some View {
    Button(intent: StartAmiCallIntent()) {
      Label(label, systemImage: "waveform")
        .font(.caption.weight(.semibold))
        .frame(maxWidth: .infinity)
    }
    .buttonStyle(.borderedProminent)
    .tint(Color.accentColor)
  }
}

// MARK: - "Hoy" (today's jobs) ------------------------------------------------

struct AmiTodayView: View {
  @Environment(\.widgetFamily) var family
  let entry: AmiEntry

  var body: some View {
    let s = entry.snap ?? AmiSnapshot()
    let L = s.labels
    if entry.snap == nil || s.isStale {
      if family == .accessoryRectangular {
        Text(L.open).font(.caption)
      } else {
        OpenAppHint(text: L.open)
      }
    } else {
      switch family {
      case .accessoryRectangular:
        VStack(alignment: .leading, spacing: 1) {
          if !s.business.isEmpty { Text(s.business).font(.caption2).lineLimit(1) }
          Text("\(L.title) · \(s.jobs) \(L.jobs)").font(.headline).widgetAccentable()
          if !s.next.isEmpty {
            Text([s.nextTime, s.next].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption).lineLimit(1)
          } else if s.jobs == 0 {
            Text(L.none).font(.caption)
          }
        }
      case .systemMedium:
        HStack(alignment: .top, spacing: 12) {
          summary(s, L)
          VStack(alignment: .leading, spacing: 6) {
            if s.overdue >= 0 {
              Label("\(s.overdue) \(L.overdue)", systemImage: "exclamationmark.circle.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(s.overdue > 0 ? .orange : .secondary)
              if s.overdue > 0 { Text(s.overdueAmount).font(.caption).foregroundStyle(.secondary) }
            }
            Spacer(minLength: 0)
            TalkButton(label: L.talk)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
      default:
        summary(s, L)
      }
    }
  }

  @ViewBuilder
  private func summary(_ s: AmiSnapshot, _ L: AmiSnapshot.Labels) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(s.header(L.title)).font(.caption2.weight(.bold)).foregroundStyle(Color.accentColor).lineLimit(1)
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        Text("\(s.jobs)").font(.system(size: 34, weight: .bold, design: .rounded))
        Text(L.jobs).font(.caption).foregroundStyle(.secondary)
      }
      if s.jobs == 0 {
        Text(L.none).font(.caption).foregroundStyle(.secondary)
      } else if !s.next.isEmpty {
        Text(L.next).font(.caption2).foregroundStyle(.secondary)
        Text(s.next).font(.caption.weight(.semibold)).lineLimit(2)
        if !s.nextTime.isEmpty { Text(s.nextTime).font(.caption2).foregroundStyle(.secondary) }
      } else {
        Text("\(s.done) \(L.done)").font(.caption).foregroundStyle(.secondary)
      }
      Spacer(minLength: 0)
      if s.unassigned > 0 {
        Label("\(s.unassigned) \(L.unassigned)", systemImage: "person.fill.questionmark")
          .font(.caption2.weight(.semibold)).foregroundStyle(.orange)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

struct AmiTodayWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "AmiToday", provider: AmiProvider()) { entry in
      AmiTodayView(entry: entry)
        .containerBackground(.fill.tertiary, for: .widget)
        .widgetURL(URL(string: "amixos://dashboard/trabajos"))
    }
    .configurationDisplayName("Hoy")
    .description("Trabajos de hoy, el siguiente y lo pendiente.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
  }
}

// MARK: - "Cobros" (owners / admins) -----------------------------------------

struct AmiMoneyView: View {
  let entry: AmiEntry
  var body: some View {
    let s = entry.snap ?? AmiSnapshot()
    let L = s.labels
    if entry.snap == nil {
      OpenAppHint(text: L.open)
    } else if s.paidMonth.isEmpty {
      VStack(alignment: .leading, spacing: 4) {
        Image(systemName: "lock.fill").foregroundStyle(.secondary)
        Text(L.noAccess).font(.caption).foregroundStyle(.secondary)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    } else {
      VStack(alignment: .leading, spacing: 4) {
        Text(s.header(L.money)).font(.caption2.weight(.bold)).foregroundStyle(Color.accentColor).lineLimit(1)
        Text(s.paidMonth).font(.system(size: 26, weight: .bold, design: .rounded)).minimumScaleFactor(0.6).lineLimit(1)
        Text(L.paidMonth).font(.caption2).foregroundStyle(.secondary)
        Spacer(minLength: 0)
        if s.overdue > 0 {
          Text(s.overdueAmount).font(.subheadline.weight(.semibold)).foregroundStyle(.orange)
          Text("\(L.owed) · \(s.overdue)").font(.caption2).foregroundStyle(.secondary)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
  }
}

struct AmiMoneyWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "AmiMoney", provider: AmiProvider()) { entry in
      AmiMoneyView(entry: entry)
        .containerBackground(.fill.tertiary, for: .widget)
        .widgetURL(URL(string: "amixos://dashboard/facturas"))
    }
    .configurationDisplayName("Cobros")
    .description("Cobrado este mes y lo vencido por cobrar.")
    .supportedFamilies([.systemSmall])
  }
}

// MARK: - Control Center / lock-screen button (iOS 18) -----------------------

@available(iOS 18.0, *)
struct AmiCallControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "com.amixos.app.ami-call") {
      ControlWidgetButton(action: StartAmiCallIntent()) {
        Label("Ami", systemImage: "waveform")
      }
    }
    .displayName("Hablar con Ami")
    .description("Abre Amixos y empieza una llamada con Ami.")
  }
}
