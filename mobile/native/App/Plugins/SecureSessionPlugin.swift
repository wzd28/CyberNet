import Foundation
import Security
import Capacitor

/// Keychain storage for the Supabase session (BUILD-PLAN §7.6.3, guideline 1.6).
///
/// JS name `SecureSession`. The web bundle wraps it as supabase-js `auth.storage`:
///   get({ key })          -> { value: string | null }
///   set({ key, value })   -> {}
///   remove({ key })       -> {}
///   clear()               -> {}   (sign-out and account deletion)
///
/// Items: kSecClassGenericPassword, service "app.cybernetai.session", account = key,
/// kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly (never synced to iCloud, never restored to
/// another device).
@objc(SecureSessionPlugin)
public final class SecureSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SecureSessionPlugin"
    public let jsName = "SecureSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    private static let service = "app.cybernetai.session"
    private static let installMarker = "cn.secureSession.installed"
    private static let maxKeyLength = 256

    #if targetEnvironment(simulator)
    // Unsigned simulator builds (the CI screenshot runs) have no keychain entitlement, so the
    // keychain answers errSecMissingEntitlement (-34018). There, and only there, the session
    // lives in a private defaults suite instead. Device and TestFlight builds always use the
    // keychain; none of this code is compiled into them.
    private static let simulatorSuite = "app.cybernetai.session.simulator"
    private static let simulatorStore = UserDefaults(suiteName: simulatorSuite)!
    #endif

    override public func load() {
        // Keychain items survive deleting the app. A fresh install must start signed out,
        // so the first launch removes anything an earlier install left behind.
        let defaults = UserDefaults.standard
        if !defaults.bool(forKey: Self.installMarker) {
            _ = Self.deleteAll()
            #if targetEnvironment(simulator)
            Self.simulatorStore.removePersistentDomain(forName: Self.simulatorSuite)
            #endif
            defaults.set(true, forKey: Self.installMarker)
        }
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let key = Self.key(from: call) else { return }
        var query = Self.query(for: key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        switch status {
        case errSecSuccess:
            if let data = result as? Data, let value = String(data: data, encoding: .utf8) {
                call.resolve(["value": value])
            } else {
                call.resolve(["value": NSNull()])
            }
        case errSecItemNotFound:
            call.resolve(["value": NSNull()])
        default:
            #if targetEnvironment(simulator)
            if status == errSecMissingEntitlement {
                if let value = Self.simulatorStore.string(forKey: key) {
                    call.resolve(["value": value])
                } else {
                    call.resolve(["value": NSNull()])
                }
                return
            }
            #endif
            call.reject("The saved sign-in could not be read (\(status)).", "KEYCHAIN_ERROR")
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let key = Self.key(from: call) else { return }
        guard let value = call.getString("value") else {
            call.reject("A value is required.", "INVALID_ARGUMENT")
            return
        }
        let attributes: [String: Any] = [
            kSecValueData as String: Data(value.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        var status = SecItemUpdate(Self.query(for: key) as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var item = Self.query(for: key)
            item.merge(attributes) { _, new in new }
            status = SecItemAdd(item as CFDictionary, nil)
        }
        #if targetEnvironment(simulator)
        if status == errSecMissingEntitlement {
            Self.simulatorStore.set(value, forKey: key)
            call.resolve()
            return
        }
        #endif
        if status == errSecSuccess {
            call.resolve()
        } else {
            call.reject("The sign-in could not be saved (\(status)).", "KEYCHAIN_ERROR")
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = Self.key(from: call) else { return }
        let status = SecItemDelete(Self.query(for: key) as CFDictionary)
        #if targetEnvironment(simulator)
        if status == errSecMissingEntitlement {
            Self.simulatorStore.removeObject(forKey: key)
            call.resolve()
            return
        }
        #endif
        if status == errSecSuccess || status == errSecItemNotFound {
            call.resolve()
        } else {
            call.reject("The saved sign-in could not be removed (\(status)).", "KEYCHAIN_ERROR")
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        let status = Self.deleteAll()
        #if targetEnvironment(simulator)
        if status == errSecMissingEntitlement {
            Self.simulatorStore.removePersistentDomain(forName: Self.simulatorSuite)
            call.resolve()
            return
        }
        #endif
        if status == errSecSuccess || status == errSecItemNotFound {
            call.resolve()
        } else {
            call.reject("The saved sign-in could not be removed (\(status)).", "KEYCHAIN_ERROR")
        }
    }

    // MARK: - Helpers

    private static func key(from call: CAPPluginCall) -> String? {
        guard let key = call.getString("key"), !key.isEmpty, key.count <= maxKeyLength else {
            call.reject("A key is required.", "INVALID_ARGUMENT")
            return nil
        }
        return key
    }

    private static func query(for key: String? = nil) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service
        ]
        if let key = key {
            query[kSecAttrAccount as String] = key
        }
        return query
    }

    private static func deleteAll() -> OSStatus {
        return SecItemDelete(query() as CFDictionary)
    }
}
