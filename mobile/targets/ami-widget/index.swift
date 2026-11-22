import SwiftUI
import WidgetKit

@main
struct AmiWidgetBundle: WidgetBundle {
  var body: some Widget {
    AmiLiveActivity()
    AmiTodayWidget()
    AmiMoneyWidget()
    if #available(iOS 18.0, *) {
      AmiCallControl()
    }
  }
}
