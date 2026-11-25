import UIKit
import StoreKit
import Capacitor

/// The App Store ratings prompt (app 1.1.1). Used by mobile/web-ios/ios.js, which decides when to ask
/// (after the third finished check, at a calm moment, never after Recovery, at most once every 60 days).
///
/// JS name `CNReview`:
///   requestReview()  -> {}   asks iOS to show the rating prompt over the app's window scene.
/// iOS alone decides whether the prompt really appears (at most three times a year, never in TestFlight), and the
/// call never says whether it did, so the promise always resolves once the request is made.
/// AppStore.requestReview(in:) is the iOS 16+ API (the app targets iOS 16), replacing SKStoreReviewController.
@objc(ReviewPromptPlugin)
public final class ReviewPromptPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ReviewPromptPlugin"
    public let jsName = "CNReview"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestReview", returnType: CAPPluginReturnPromise)
    ]

    @objc func requestReview(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let scene = self.currentScene() else {
                call.unavailable("The rating prompt is not available right now.")
                return
            }
            AppStore.requestReview(in: scene)
            call.resolve()
        }
    }

    /// The window scene the web view is in, or the active one. Main thread (UIKit).
    @MainActor
    private func currentScene() -> UIWindowScene? {
        if let scene = bridge?.webView?.window?.windowScene {
            return scene
        }
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first
    }
}
