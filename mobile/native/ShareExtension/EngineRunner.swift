import UIKit
import WebKit

/// One verdict from the engine, as returned by `cnRun` in engine.html.
struct EngineVerdict: Decodable {
    let band: String       // "scam" | "unverified" | "safe" | "none"
    let headline: String   // "SCAM" | "CAN'T CONFIRM" | "LOW RISK" | "NOT A SCAM" | "NOTHING TO CHECK"
    let score: Double
    let lead: String
    let points: [String]
    let action: String
    let subject: String
}

/// Runs the website's own detection engine (cybernet-engine.js, unchanged) in a hidden WKWebView,
/// so the Share Extension gives exactly the same answer as the app and the website
/// (BUILD-PLAN §7.3: the engine needs WebKit's URL/IDNA handling). The page and the engine are
/// files inside the extension; nothing is fetched from the network.
final class EngineRunner: NSObject, WKNavigationDelegate {
    enum EngineError: Error {
        case unavailable
        case badResult
        case timeout
    }

    private var webView: WKWebView?
    private var ready = false
    private var broken = false
    private var waiting: [() -> Void] = []

    /// Adds the hidden web view behind `container`'s content and starts loading the engine.
    func attach(to container: UIView) {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 1, height: 1), configuration: configuration)
        webView.navigationDelegate = self
        webView.isUserInteractionEnabled = false
        webView.isAccessibilityElement = false
        webView.accessibilityElementsHidden = true
        // Kept in the view hierarchy (behind the verdict screen) so WebKit does not pause it.
        container.insertSubview(webView, at: 0)
        self.webView = webView

        guard let page = Bundle.main.url(forResource: "engine", withExtension: "html") else {
            markBroken()
            return
        }
        webView.loadFileURL(page, allowingReadAccessTo: Bundle.main.bundleURL)
    }

    /// kind: "url" ["url": …], "text" ["text": …] or "image" ["qr": …, "text": …]. Main thread.
    func run(kind: String, payload: [String: String],
             completion: @escaping (Result<EngineVerdict, Error>) -> Void) {
        var finished = false
        let finish: (Result<EngineVerdict, Error>) -> Void = { result in
            guard !finished else { return }
            finished = true
            completion(result)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) {
            finish(.failure(EngineError.timeout))
        }

        let work: () -> Void = { [weak self] in
            guard let webView = self?.webView else {
                finish(.failure(EngineError.unavailable))
                return
            }
            webView.callAsyncJavaScript("return window.cnRun(kind, payload);",
                                        arguments: ["kind": kind, "payload": payload],
                                        in: nil,
                                        in: .page) { result in
                switch result {
                case .success(let value):
                    guard let json = value as? String,
                          let data = json.data(using: .utf8),
                          let verdict = try? JSONDecoder().decode(EngineVerdict.self, from: data) else {
                        finish(.failure(EngineError.badResult))
                        return
                    }
                    finish(.success(verdict))
                case .failure(let error):
                    finish(.failure(error))
                }
            }
        }

        if ready {
            work()
        } else if broken {
            finish(.failure(EngineError.unavailable))
        } else {
            waiting.append(work)
        }
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        ready = true
        let queued = waiting
        waiting.removeAll()
        queued.forEach { $0() }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        markBroken()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        markBroken()
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // The system ended the page (memory pressure). Load it again; queued checks wait for it.
        ready = false
        if let page = Bundle.main.url(forResource: "engine", withExtension: "html") {
            webView.loadFileURL(page, allowingReadAccessTo: Bundle.main.bundleURL)
        } else {
            markBroken()
        }
    }

    private func markBroken() {
        broken = true
        let queued = waiting
        waiting.removeAll()
        queued.forEach { $0() } // each one sees webView without a loaded engine and fails cleanly
    }
}
