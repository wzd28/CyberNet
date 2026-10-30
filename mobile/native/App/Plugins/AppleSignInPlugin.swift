import UIKit
import AuthenticationServices
import Capacitor

/// Native Sign in with Apple (BUILD-PLAN §7.6.2, owner answer 3). First-party replacement for the
/// third-party plugin the plan named; same JS name and result fields, so the plan's code works:
///
///   const raw = crypto.randomUUID() + crypto.randomUUID();
///   const res = await Capacitor.Plugins.AppleSignIn.signIn({ scopes: ["email", "fullName"], nonce: await sha256Hex(raw) });
///   await supabase.auth.signInWithIdToken({ provider: "apple", token: res.idToken, nonce: raw });
///
/// signIn({ scopes?, nonce?, state? }) ->
///   { user, idToken, authorizationCode, email, givenName, familyName, state }   (missing values are null)
/// Errors: code "CANCELED" (the person closed the sheet: show nothing), "IN_PROGRESS", "FAILED".
/// Apple returns email and name only on the first sign-in for an Apple ID.
/// For account deletion, call signIn() again to get a fresh authorizationCode for token revocation.
@objc(AppleSignInPlugin)
public final class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleSignInPlugin"
    public let jsName = "AppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]

    private var session: AppleSignInSession?

    @objc func signIn(_ call: CAPPluginCall) {
        let scopes = (call.getArray("scopes") ?? ["email", "fullName"]).compactMap { $0 as? String }
        let nonce = call.getString("nonce")
        let state = call.getString("state")

        DispatchQueue.main.async {
            guard self.session == nil else {
                call.reject("Sign in with Apple is already open.", "IN_PROGRESS")
                return
            }
            let request = ASAuthorizationAppleIDProvider().createRequest()
            var requested: [ASAuthorization.Scope] = []
            if scopes.contains("email") { requested.append(.email) }
            if scopes.contains("fullName") || scopes.contains("name") { requested.append(.fullName) }
            request.requestedScopes = requested
            if let nonce = nonce, !nonce.isEmpty { request.nonce = nonce }
            if let state = state, !state.isEmpty { request.state = state }

            let session = AppleSignInSession(
                call: call,
                anchor: { [weak self] in self?.bridge?.webView?.window },
                onFinish: { [weak self] in self?.session = nil })
            self.session = session
            session.start(with: request)
        }
    }
}

/// One Sign in with Apple sheet. Kept alive by the plugin until Apple answers.
final class AppleSignInSession: NSObject, ASAuthorizationControllerDelegate,
                                ASAuthorizationControllerPresentationContextProviding {
    private let call: CAPPluginCall
    private let anchor: () -> UIWindow?
    private let onFinish: () -> Void
    private var controller: ASAuthorizationController?

    init(call: CAPPluginCall, anchor: @escaping () -> UIWindow?, onFinish: @escaping () -> Void) {
        self.call = call
        self.anchor = anchor
        self.onFinish = onFinish
        super.init()
    }

    func start(with request: ASAuthorizationAppleIDRequest) {
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        self.controller = controller
        controller.performRequests()
    }

    func authorizationController(controller: ASAuthorizationController,
                                 didCompleteWithAuthorization authorization: ASAuthorization) {
        defer { finish() }
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            call.reject("Apple returned an unexpected sign-in type.", "FAILED")
            return
        }
        guard let tokenData = credential.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8) else {
            call.reject("Apple did not return a sign-in token. Please try again.", "FAILED")
            return
        }
        let code = credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
        call.resolve([
            "user": credential.user,
            "idToken": idToken,
            "authorizationCode": Self.jsValue(code),
            "email": Self.jsValue(credential.email),
            "givenName": Self.jsValue(credential.fullName?.givenName),
            "familyName": Self.jsValue(credential.fullName?.familyName),
            "state": Self.jsValue(credential.state)
        ])
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        defer { finish() }
        if let authError = error as? ASAuthorizationError, authError.code == .canceled {
            call.reject("Sign in with Apple was cancelled.", "CANCELED", error)
        } else {
            call.reject("Sign in with Apple did not finish. Please try again.", "FAILED", error)
        }
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
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
        controller = nil
        onFinish()
    }

    private static func jsValue(_ value: String?) -> Any {
        if let value = value {
            return value
        }
        return NSNull()
    }
}
