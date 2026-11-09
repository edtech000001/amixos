import ExpoModulesCore
import UIKit
import VisionKit

// Full-screen photo view with Apple's Live Text: long-press / drag over text
// in the photo to select it, then Copy / Look Up / Translate — same as Photos.
// iOS 16+ (VisionKit ImageAnalysisInteraction); on older iOS it is a plain
// image view.
public class LiveTextModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiveText")

    View(LiveTextImageView.self) {
      Events("onLoad", "onError")

      Prop("uri") { (view: LiveTextImageView, uri: String?) in
        view.setUri(uri)
      }
    }
  }
}

class LiveTextImageView: ExpoView {
  let onLoad = EventDispatcher()
  let onError = EventDispatcher()

  private let imageView = UIImageView()
  private var currentUri: String?
  private var task: URLSessionDataTask?
  // ImageAnalysisInteraction (iOS 16+), kept untyped so the class still loads on 15.
  private var interaction: AnyObject?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    imageView.contentMode = .scaleAspectFit
    imageView.isUserInteractionEnabled = true
    addSubview(imageView)
    if #available(iOS 16.0, *), ImageAnalyzer.isSupported {
      let liveText = ImageAnalysisInteraction()
      liveText.preferredInteractionTypes = .automatic
      imageView.addInteraction(liveText)
      interaction = liveText
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    imageView.frame = bounds
  }

  func setUri(_ uri: String?) {
    guard uri != currentUri else { return }
    currentUri = uri
    task?.cancel()
    imageView.image = nil
    if #available(iOS 16.0, *), let liveText = interaction as? ImageAnalysisInteraction {
      liveText.analysis = nil
    }
    guard let uri, let url = URL(string: uri) else { return }
    task = URLSession.shared.dataTask(with: url) { [weak self] data, _, error in
      DispatchQueue.main.async {
        guard let self, self.currentUri == uri else { return }
        guard let data, let image = UIImage(data: data) else {
          if (error as? URLError)?.code != .cancelled {
            self.onError(["message": error?.localizedDescription ?? "image failed to load"])
          }
          return
        }
        self.imageView.image = image
        self.onLoad([:])
        self.analyze(image, for: uri)
      }
    }
    task?.resume()
  }

  // Find the text once the photo is on screen; the interaction then handles
  // selection, the copy menu and the "Live Text" button by itself.
  private func analyze(_ image: UIImage, for uri: String) {
    guard #available(iOS 16.0, *), let liveText = interaction as? ImageAnalysisInteraction else { return }
    Task { @MainActor in
      let analyzer = ImageAnalyzer()
      let configuration = ImageAnalyzer.Configuration([.text])
      guard let analysis = try? await analyzer.analyze(image, configuration: configuration) else { return }
      guard self.currentUri == uri else { return }
      liveText.analysis = analysis
      liveText.preferredInteractionTypes = .automatic
    }
  }
}
