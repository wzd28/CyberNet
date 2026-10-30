import UIKit
import AuthenticationServices
import Capacitor

/// The system's secure sign-in sheet, for Sign in with Google (owner approval, 30 Oct 2026).
/// Google refuses to sign anyone in inside an embedded web view, so the page never opens Google itself:
/// it hands Supabase's sign-in address to this plugin, which shows it in ASWebAuthenticationSession.
/// The sheet shares Safari's cookies (a Google account already signed in there is one tap) and gives back
/// only the address it ended on. web-ios/ios.js (section 9) takes it from there.
///
/// JS name `CNWebAuth`:
///   start({ url, callbackScheme }) -> { url }   url: the address the sheet came back with
/// Errors: code "CANCELED" (the person closed the sheet: show nothing), "IN_PROGRESS", "INVALID_URL", "FAILED".
///
/// The page cannot use this to show anything else: only https addresses on the project's own Supabase
/// host open, and only with the app's own callback scheme. A custom callback scheme needs no Info.plist
/// URL type, no associated domain and no entitlement.
@objc(WebAuthPlugin)
public final class WebAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WebAuthPlugin"
    public let jsName = "CNWebAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise)
    ]

    private static let allowedHost = "ndtcxippbufqzwcxkyjd.supabase.co"
    private static let allowedScheme = "app.cybernetai"

    private var session: WebAuthSession?

    @objc func start(_ call: CAPPluginCall) {
        guard let text = call.getString("url"),
              let url = URL(string: text),
              url.scheme?.lowercased() == "https",
              url.host?.lowercased() == Self.allowedHost,
              url.user == nil, url.password == nil, url.port == nil else {
            call.reject("This sign-in address is not allowed.", "INVALID_URL")
            return
        }
        guard call.getString("callbackScheme")?.lowercased() == Self.allowedScheme else {
            call.reject("This sign-in return address is not allowed.", "INVALID_URL")
            return
        }

        DispatchQueue.main.async {
            guard self.session == nil else {
                call.reject("Sign in is already open.", "IN_PROGRESS")
                return
            }
            let session = WebAuthSession(
                call: call,
                anchor: { [weak self] in self?.bridge?.webView?.window },
                onFinish: { [weak self] in self?.session = nil })
            self.session = session
            session.start(url: url, callbackScheme: Self.allowedScheme)
        }
    }
}

/// One sign-in sheet. Kept alive by the plugin until the sheet answers (the system does not retain it).
final class WebAuthSession: NSObject, ASWebAuthenticationPresentationContextProviding {
    private let call: CAPPluginCall
    private let anchor: () -> UIWindow?
    private let onFinish: () -> Void
    private var authSession: ASWebAuthenticationSession?

    init(call: CAPPluginCall, anchor: @escaping () -> UIWindow?, onFinish: @escaping () -> Void) {
        self.call = call
        self.anchor = anchor
        self.onFinish = onFinish
        super.init()
    }

    func start(url: URL, callbackScheme: String) {
        let authSession = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme) { [weak self] callbackURL, error in
            DispatchQueue.main.async {
                self?.complete(callbackURL: callbackURL, error: error, scheme: callbackScheme)
            }
        }
        authSession.presentationContextProvider = self
        authSession.prefersEphemeralWebBrowserSession = false
        self.authSession = authSession
        if !authSession.start() {
            call.reject("The sign-in sheet could not open. Please try again.", "FAILED")
            finish()
        }
    }

    private func complete(callbackURL: URL?, error: Error?, scheme: String) {
        defer { finish() }
        if let error = error {
            if let authError = error as? ASWebAuthenticationSessionError, authError.code == .canceledLogin {
                call.reject("Sign in was cancelled.", "CANCELED", error)
            } else {
                call.reject("Sign in did not finish. Please try again.", "FAILED", error)
            }
            return
        }
        guard let callbackURL = callbackURL, callbackURL.scheme?.lowercased() == scheme else {
            call.reject("Sign in did not finish. Please try again.", "FAILED")
            return
        }
        call.resolve(["url": callbackURL.absoluteString])
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        if let window = anchor() {
            return window
        }
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        if let window = scenes.flatMap({ $0.windows }).first(where: { $0.isKeyWindow }) ?? scenes.first?.windows.first {
            return window
        }
        return ASPresentationAnchor()
    }

    private func finish() {
        authSession = nil
        onFinish()
    }
}
