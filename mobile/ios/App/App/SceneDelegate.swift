import UIKit
import Capacitor

// Capacitor 8.5 template SceneDelegate, with two changes: the root view controller is
// MainViewController (the web UI plus the native tab bar) instead of CAPBridgeViewController,
// and a privacy cover hides the screen in the app switcher (security audit Nov 2026, APP-7).
// Copied into ios/App/App/ by scripts/add-share-extension.cjs.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    // APP-7: iOS takes the app-switcher snapshot after sceneDidEnterBackground, so a cover added
    // there keeps a checked message, an AI answer or a Recovery case out of the snapshot. Not in
    // sceneWillResignActive: that also fires for Face ID, Control Center and the Sign in with
    // Apple / web sign-in sheets, and would blank the app during sign-in.
    private var privacyCover: UIView?
    private static let coverColor = UIColor(red: 0x06 / 255, green: 0x0A / 255, blue: 0x14 / 255, alpha: 1)

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        guard let window, privacyCover == nil else { return }
        let cover = UIView(frame: window.bounds)
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        cover.backgroundColor = Self.coverColor
        cover.isAccessibilityElement = false
        if let mark = UIImage(systemName: "shield.lefthalf.filled") {
            let image = UIImageView(image: mark)
            image.tintColor = UIColor(red: 0x22 / 255, green: 0xD3 / 255, blue: 0xEE / 255, alpha: 1)
            image.contentMode = .scaleAspectFit
            image.translatesAutoresizingMaskIntoConstraints = false
            cover.addSubview(image)
            NSLayoutConstraint.activate([
                image.centerXAnchor.constraint(equalTo: cover.centerXAnchor),
                image.centerYAnchor.constraint(equalTo: cover.centerYAnchor),
                image.widthAnchor.constraint(equalToConstant: 72),
                image.heightAnchor.constraint(equalToConstant: 72)
            ])
        }
        window.addSubview(cover)
        privacyCover = cover
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        privacyCover?.removeFromSuperview()
        privacyCover = nil
    }
}
