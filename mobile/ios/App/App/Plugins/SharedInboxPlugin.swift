import Foundation
import Capacitor

/// Reads what the Share Extension left for the app (BUILD-PLAN §7.3 "Hand-off"). Used by
/// mobile/web-ios/ios.js when the app starts or comes back to the front.
///
/// JS name `SharedInbox`:
///   read()          -> { available, items: [{ id, kind, text, url, imageDataUrl, createdAt, localVerdict }] }
///                      oldest first (newest last). kind is "text" | "url" | "image"; createdAt is an
///                      ISO 8601 date; imageDataUrl is a "data:image/jpeg;base64,…" URL for pictures;
///                      localVerdict is { band, headline, score } (the on-device check) or null.
///                      Items older than 24 hours are deleted before the list is returned.
///   remove({ id })  -> {}   after the item was used or dismissed
///   clear()         -> {}   sign-out and account deletion
/// Nothing is sent anywhere by this plugin; the page asks for AI consent before any upload.
@objc(SharedInboxPlugin)
public final class SharedInboxPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SharedInboxPlugin"
    public let jsName = "SharedInbox"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    private let store = SharedInboxStore()

    @objc func read(_ call: CAPPluginCall) {
        let items: [[String: Any]] = store.items().map { item in
            var imageDataUrl: String?
            if let url = store.imageURL(for: item), let data = try? Data(contentsOf: url) {
                imageDataUrl = "data:image/jpeg;base64," + data.base64EncodedString()
            }
            return item.jsObject(imageDataUrl: imageDataUrl)
        }
        call.resolve(["available": store.isAvailable, "items": items])
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("An id is required.", "INVALID_ARGUMENT")
            return
        }
        store.remove(id: id)
        call.resolve()
    }

    @objc func clear(_ call: CAPPluginCall) {
        store.removeAll()
        call.resolve()
    }
}
