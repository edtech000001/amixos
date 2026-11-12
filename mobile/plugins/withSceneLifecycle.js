// Adopt the UIScene lifecycle. iOS 27 refuses to launch apps linked against
// the iOS 27 SDK that still use the app-delegate-only lifecycle
// (_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption trap), so
// this must be in place before building with Xcode 27. Expo SDK 54's
// templates don't do it, and ios/ is regenerated (CNG), hence a plugin.
//
// Design: AppDelegate still creates the window in didFinishLaunching (the
// dev launcher and RN factory grab `delegate.window` right there); the scene
// delegate then attaches that SAME window to the scene. URL / universal-link
// events now arrive on the scene, so they're forwarded to the app delegate,
// where Expo subscribers (expo-linking, Google Sign-In, dev launcher) and
// RCTLinkingManager already handle them.
const { withInfoPlist, withAppDelegate } = require('expo/config-plugins');

const SCENE_DELEGATE = `
// [withSceneLifecycle] — see mobile/plugins/withSceneLifecycle.js
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    let window = appDelegate.window ?? UIWindow(windowScene: windowScene)
    window.windowScene = windowScene
    window.frame = windowScene.coordinateSpace.bounds
    appDelegate.window = window
    self.window = window
    window.makeKeyAndVisible()

    // Cold start from a link: deliver it like the pre-scene launch did.
    for context in connectionOptions.urlContexts {
      openURL(context)
    }
    for activity in connectionOptions.userActivities {
      continueActivity(activity)
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      openURL(context)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    continueActivity(userActivity)
  }

  private func openURL(_ context: UIOpenURLContext) {
    var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    options[.sourceApplication] = context.options.sourceApplication
    options[.annotation] = context.options.annotation
    options[.openInPlace] = context.options.openInPlace
    _ = UIApplication.shared.delegate?.application?(UIApplication.shared, open: context.url, options: options)
  }

  private func continueActivity(_ activity: NSUserActivity) {
    _ = UIApplication.shared.delegate?.application?(UIApplication.shared, continue: activity, restorationHandler: { _ in })
  }
}
`;

module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return c;
  });
  config = withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift') {
      throw new Error('withSceneLifecycle expects a Swift AppDelegate');
    }
    if (!c.modResults.contents.includes('class SceneDelegate')) {
      c.modResults.contents += SCENE_DELEGATE;
    }
    return c;
  });
  return config;
};
