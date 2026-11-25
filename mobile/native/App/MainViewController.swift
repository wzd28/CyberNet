import UIKit
import WebKit
import Capacitor

/// The app's root screen: Capacitor's web view (the CyberNet AI web UI from the bundled `public/`
/// folder) with a native UIKit tab bar on top (BUILD-PLAN §6.6).
///
/// Contract with the web bundle (mobile/web-ios/ios.js):
/// - A tab tap fires the window event `cnTab`; `event.tab` is "home" | "check" | "scan" | "recovery" |
///   "learn" | "account" (this order). The page decides what to show; the Scan tab opens the QR scanner.
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

    /// Six items, Home first (owner, 10 Nov 2026: the website's Home page is the app's first tab; the app still opens
    /// on Check). The ids and their order must equal TABS in mobile/web-ios/ios.js (mobile/tests/run-bundle.mjs compares them).
    static let tabs: [Tab] = [
        Tab(id: "home", title: "Home", symbol: "house",
            hint: "Overview of CyberNet AI: check a message and see how it works."),
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

    /// Brand colours (ui-src/DESIGN.md): cyan for the selected tab, a muted slate for the others, the navy page.
    private static let accentColor = UIColor(red: 0x22 / 255, green: 0xD3 / 255, blue: 0xEE / 255, alpha: 1)
    private static let mutedColor = UIColor(red: 0x8A / 255, green: 0x95 / 255, blue: 0xA7 / 255, alpha: 1)
    private static let pageColor = UIColor(red: 0x06 / 255, green: 0x0A / 255, blue: 0x14 / 255, alpha: 1)

    private let tabBar = UITabBar()
    private var keyboardIsVisible = false
    private var hiddenByPage = false
    private var publishedMetrics: (height: Int, hidden: Bool)?
    private var loadingObservation: NSKeyValueObservation?
    /// True once the current page has finished loading. A window event sent before that reaches a page whose
    /// Capacitor runtime is not there yet, which logged a "JS Eval error" at every launch (1.1 bug 21).
    private var pageLoaded = false

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
        bridge?.registerPluginInstance(ReviewPromptPlugin())
        // @iap
        // In-app purchase builds only: the StoreKit plugin (CNStore) is registered here. A CN_NO_IAP=1 build
        // (mobile/scripts/add-share-extension.cjs) cuts this block out and leaves StoreKitPlugin.swift out of the project.
        bridge?.registerPluginInstance(StoreKitPlugin())
        // @end-iap

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
        // The app is dark only (the web layer sets color-scheme: dark); the native chrome follows it in every system
        // appearance, so a Light Mode iPhone never shows a light bar under the navy page.
        overrideUserInterfaceStyle = .dark
        view.backgroundColor = Self.pageColor
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
            let loading = change.newValue ?? false
            DispatchQueue.main.async {
                guard let self else { return }
                self.pageLoaded = !loading
                if !loading { self.publishTabBarMetrics(force: true) }
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
            let image = UIImage(systemName: tab.symbol)
            // the selected tab shows the filled symbol where SF Symbols has one (qrcode.viewfinder has none)
            let item = UITabBarItem(title: tab.title, image: image, selectedImage: UIImage(systemName: tab.symbol + ".fill") ?? image)
            item.tag = index
            item.accessibilityLabel = tab.title
            item.accessibilityHint = tab.hint
            item.accessibilityIdentifier = "tab-\(tab.id)"
            return item
        }
        // the app opens on Check, the second tab (ios.js highlights the page's tab as soon as it has loaded)
        tabBar.selectedItem = tabBar.items?.first(where: { $0.accessibilityIdentifier == "tab-check" }) ?? tabBar.items?.first
        applyBrandAppearance()
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

    /// A dark material bar with the CyberNet cyan for the selected tab (1.1 design item 1). Both appearances are set, so
    /// the bar looks the same whether or not content scrolls under it (UIKit, iOS 15+ API; the app targets iOS 16).
    private func applyBrandAppearance() {
        tabBar.overrideUserInterfaceStyle = .dark
        let appearance = UITabBarAppearance()
        appearance.configureWithDefaultBackground()
        appearance.backgroundEffect = UIBlurEffect(style: .systemChromeMaterialDark)
        appearance.backgroundColor = Self.pageColor.withAlphaComponent(0.72)
        appearance.shadowColor = UIColor(red: 148 / 255, green: 163 / 255, blue: 184 / 255, alpha: 0.14)
        for layout in [appearance.stackedLayoutAppearance, appearance.inlineLayoutAppearance, appearance.compactInlineLayoutAppearance] {
            layout.normal.iconColor = Self.mutedColor
            layout.normal.titleTextAttributes = [.foregroundColor: Self.mutedColor]
            layout.selected.iconColor = Self.accentColor
            layout.selected.titleTextAttributes = [.foregroundColor: Self.accentColor]
        }
        tabBar.standardAppearance = appearance
        tabBar.scrollEdgeAppearance = appearance
        tabBar.tintColor = Self.accentColor
        tabBar.unselectedItemTintColor = Self.mutedColor
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

    /// VoiceOver (1.1.1): while a sheet is open in the page the bar stays visible but VoiceOver skips it,
    /// the native half of the page's aria-modal.
    func setTabBarAccessibilityHidden(_ hidden: Bool) {
        tabBar.accessibilityElementsHidden = hidden
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
        guard pageLoaded else { return } // the load observer publishes as soon as the page is there
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
