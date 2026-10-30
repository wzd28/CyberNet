import UIKit
import WebKit
import Capacitor

/// The app's root screen: Capacitor's web view (the CyberNet AI web UI from the bundled `public/`
/// folder) with a native UIKit tab bar on top (BUILD-PLAN §6.6).
///
/// Contract with the web bundle (mobile/web-ios/ios.js):
/// - A tab tap fires the window event `cnTab`; `event.tab` is "check" | "scan" | "recovery" | "learn" |
///   "account". The page decides what to show; the Scan tab opens the QR scanner.
/// - The window event `cnTabBarMetrics` (`event.height`, `event.hidden`) reports how much of the page
///   the bar covers, in CSS pixels, home-indicator area included (0 while hidden). ios.js turns it into
///   `--cn-native-tabbar-h`. The `CNTabBar` plugin (TabBarPlugin.swift) answers the same with
///   getMetrics(), highlights a tab with select({ tab }) and hides the bar with setHidden({ hidden }).
/// - The bar also hides itself while the keyboard is up.
final class MainViewController: CAPBridgeViewController, UITabBarDelegate {

    struct Tab {
        let id: String
        let title: String
        let symbol: String
        let hint: String
    }

    static let tabs: [Tab] = [
        Tab(id: "check", title: "Check", symbol: "checkmark.shield",
            hint: "Check a message or a link on your iPhone."),
        Tab(id: "scan", title: "Scan QR", symbol: "qrcode.viewfinder",
            hint: "Opens the camera to read a QR code. Nothing opens until you choose."),
        Tab(id: "recovery", title: "Recovery", symbol: "lifepreserver",
            hint: "Steps to take after a scam or a hacked account."),
        Tab(id: "learn", title: "Learn", symbol: "book",
            hint: "Short guides about common scams."),
        Tab(id: "account", title: "Account", symbol: "person.crop.circle",
            hint: "Sign in, privacy and data, notifications and support.")
    ]

    /// Height of a standard iPhone tab bar above the home-indicator area, in points.
    private static let barContentHeight: CGFloat = 49

    private let tabBar = UITabBar()
    private var keyboardIsVisible = false
    private var hiddenByPage = false
    private var publishedMetrics: (height: Int, hidden: Bool)?
    private var loadingObservation: NSKeyValueObservation?

    // MARK: - Capacitor

    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        // App-local plugins (this target, no third-party code).
        bridge?.registerPluginInstance(SecureSessionPlugin())
        bridge?.registerPluginInstance(SharedInboxPlugin())
        bridge?.registerPluginInstance(TrackingPlugin())
        bridge?.registerPluginInstance(AppleSignInPlugin())
        bridge?.registerPluginInstance(WebAuthPlugin())
        bridge?.registerPluginInstance(TabBarPlugin())

        #if DEBUG
        // Capacitor installs its own WKUserContentController after webViewConfiguration(for:), so
        // page scripts are added here, before the first page load (viewDidLoad).
        if let script = Self.debugLaunchScript() {
            webView?.configuration.userContentController.addUserScript(
                WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        #endif
    }

    // MARK: - View lifecycle

    override func viewDidLoad() {
        super.viewDidLoad() // starts loading the web page
        installTabBar()

        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(keyboardWillShow(_:)),
                           name: UIResponder.keyboardWillShowNotification, object: nil)
        center.addObserver(self, selector: #selector(keyboardWillHide(_:)),
                           name: UIResponder.keyboardWillHideNotification, object: nil)

        // After every page load (first launch, or a reload after the system ended the web content
        // process), send the bar metrics to the new page. The observation lasts as long as this
        // controller, which lives as long as the app.
        loadingObservation = webView?.observe(\.isLoading, options: [.new]) { [weak self] _, change in
            guard change.newValue == false else { return }
            DispatchQueue.main.async {
                self?.publishTabBarMetrics(force: true)
            }
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        publishTabBarMetrics()
    }

    // MARK: - Tab bar

    private func installTabBar() {
        tabBar.delegate = self
        tabBar.items = Self.tabs.enumerated().map { index, tab in
            let item = UITabBarItem(title: tab.title, image: UIImage(systemName: tab.symbol), tag: index)
            item.accessibilityLabel = tab.title
            item.accessibilityHint = tab.hint
            item.accessibilityIdentifier = "tab-\(tab.id)"
            return item
        }
        tabBar.selectedItem = tabBar.items?.first
        tabBar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(tabBar)
        NSLayoutConstraint.activate([
            tabBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tabBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tabBar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            tabBar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor,
                                        constant: -Self.barContentHeight)
        ])
    }

    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard Self.tabs.indices.contains(item.tag) else { return }
        let id = Self.tabs[item.tag].id
        bridge?.triggerWindowJSEvent(eventName: "cnTab", data: "{\"tab\":\"\(id)\"}")
    }

    /// Highlights a tab without sending `cnTab` (the page already navigated). Main thread only.
    @discardableResult
    func selectTab(_ id: String) -> Bool {
        guard let index = Self.tabs.firstIndex(where: { $0.id == id }),
              let items = tabBar.items, items.indices.contains(index) else { return false }
        tabBar.selectedItem = items[index]
        return true
    }

    /// Lets the page hide the bar (keyboard, full-screen sheets). Main thread only.
    func setTabBarHiddenByPage(_ hidden: Bool) {
        hiddenByPage = hidden
        updateTabBarVisibility()
    }

    /// How much of the page the bar covers, in points (= CSS pixels), home-indicator area included.
    func tabBarMetrics() -> (height: Int, hidden: Bool) {
        let hidden = tabBar.isHidden
        let height = hidden ? 0 : Int((Self.barContentHeight + view.safeAreaInsets.bottom).rounded())
        return (height, hidden)
    }

    private func updateTabBarVisibility() {
        tabBar.isHidden = keyboardIsVisible || hiddenByPage
        publishTabBarMetrics()
    }

    private func publishTabBarMetrics(force: Bool = false) {
        let metrics = tabBarMetrics()
        if !force, let last = publishedMetrics, last == metrics { return }
        publishedMetrics = metrics
        bridge?.triggerWindowJSEvent(eventName: "cnTabBarMetrics",
                                     data: "{\"height\":\(metrics.height),\"hidden\":\(metrics.hidden)}")
    }

    @objc private func keyboardWillShow(_ notification: Notification) {
        keyboardIsVisible = true
        updateTabBarVisibility()
    }

    @objc private func keyboardWillHide(_ notification: Notification) {
        keyboardIsVisible = false
        updateTabBarVisibility()
    }

    // MARK: - Debug builds only

    #if DEBUG
    /// Simulator runs on CI (BUILD-PLAN §10): hands CN_DEMO_SCREEN / CN_ENGINE_SELFTEST from the
    /// launch environment (`SIMCTL_CHILD_CN_DEMO_SCREEN=…`) or launch arguments
    /// (`-CN_DEMO_SCREEN …`) to web-ios/debug.js as window globals. Not compiled into Release
    /// builds, so the App Store binary has no such hook.
    private static func debugLaunchScript() -> String? {
        let environment = ProcessInfo.processInfo.environment
        var values: [String: String] = [:]
        for key in ["CN_DEMO_SCREEN", "CN_ENGINE_SELFTEST"] {
            if let value = environment[key] ?? UserDefaults.standard.string(forKey: key), !value.isEmpty {
                values[key] = value
            }
        }
        guard !values.isEmpty,
              let data = try? JSONSerialization.data(withJSONObject: values),
              let json = String(data: data, encoding: .utf8) else { return nil }
        return "(function(v){for(var k in v){window[k]=v[k];}})(\(json));"
    }
    #endif
}
