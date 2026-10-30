import UIKit
import AppTrackingTransparency
import Capacitor

/// App Tracking Transparency (owner answer 11, 29 Oct 2026: Google Analytics in the app, only
/// with permission).
///
/// JS name `CNTracking`. mobile/web-ios/cn-ios-boot.js exposes it as window.CNNative.trackingStatus()
/// and window.CNNative.requestTracking():
///   getStatus()  -> { status }   never shows a prompt          (alias: trackingStatus)
///   request()    -> { status }   shows Apple's prompt if the person has not answered yet
///                                (alias: requestTracking)
/// status is "notDetermined" | "restricted" | "denied" | "authorized".
///
/// Google Analytics may load only when status is "authorized", and must be checked again on every
/// launch and resume (the person can change it in Settings at any time). The GA hosts are listed
/// as NSPrivacyTrackingDomains in PrivacyInfo.xcprivacy, so iOS also blocks them until allowed.
@objc(TrackingPlugin)
public final class TrackingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TrackingPlugin"
    public let jsName = "CNTracking"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "trackingStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestTracking", returnType: CAPPluginReturnPromise)
    ]

    private var pending = false
    private var activeObserver: NSObjectProtocol?

    static func name(for status: ATTrackingManager.AuthorizationStatus) -> String {
        switch status {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        @unknown default: return "denied" // unknown future value: treat as "no tracking"
        }
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        call.resolve(["status": Self.name(for: ATTrackingManager.trackingAuthorizationStatus)])
    }

    @objc func trackingStatus(_ call: CAPPluginCall) {
        getStatus(call)
    }

    @objc func requestTracking(_ call: CAPPluginCall) {
        request(call)
    }

    @objc func request(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let current = ATTrackingManager.trackingAuthorizationStatus
            guard current == .notDetermined else {
                call.resolve(["status": Self.name(for: current)])
                return
            }
            guard !self.pending else {
                call.reject("A tracking request is already showing.", "IN_PROGRESS")
                return
            }
            self.pending = true
            self.whenActive { self.ask(call, retriesLeft: 1) }
        }
    }

    /// Apple only shows the prompt while the app is active; otherwise the handler runs at once
    /// with no answer. In that case wait for the app to be active and ask once more.
    private func ask(_ call: CAPPluginCall, retriesLeft: Int) {
        ATTrackingManager.requestTrackingAuthorization { _ in
            DispatchQueue.main.async {
                let status = ATTrackingManager.trackingAuthorizationStatus
                if status == .notDetermined && retriesLeft > 0 {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                        self.whenActive { self.ask(call, retriesLeft: retriesLeft - 1) }
                    }
                    return
                }
                self.pending = false
                call.resolve(["status": Self.name(for: status)])
            }
        }
    }

    /// Runs `work` now if the app is active, otherwise the next time it becomes active. Main thread.
    private func whenActive(_ work: @escaping () -> Void) {
        if UIApplication.shared.applicationState == .active {
            work()
            return
        }
        if let previous = activeObserver {
            NotificationCenter.default.removeObserver(previous)
        }
        activeObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self = self else { return }
            if let observer = self.activeObserver {
                NotificationCenter.default.removeObserver(observer)
                self.activeObserver = nil
            }
            work()
        }
    }
}
