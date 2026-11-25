import UIKit
import StoreKit
import Capacitor

/// Apple In-App Purchase (StoreKit 2) for CyberNet AI Pro (app 1.1; owner decisions 20 Nov 2026: Pro Monthly and Pro Yearly
/// only, sold with In-App Purchase as App Review guideline 3.1.1 requires; Business is never sold in the app).
///
/// IAP builds only: a CN_NO_IAP=1 build (mobile/scripts/add-share-extension.cjs) leaves this file out of the Xcode project and
/// cuts its registration out of MainViewController.swift.
///
/// JS name `CNStore`. mobile/web-ios/store.js is the only caller. This plugin buys, lists and restores; it never decides who
/// has Pro. Every transaction leaves as Apple's signed text (`jws`), and the server (POST /api/apple-verify) checks the
/// signature, the app, the product and the account before anything is granted. The page calls `finish` only after the server
/// has stored the transaction, so a purchase that could not be confirmed stays unfinished and comes back on the next launch.
///
///   canMakePayments()                  -> { allowed }   false when Screen Time or a profile blocks purchases
///   products({ ids? })                 -> { products: [{ id, displayName, description, displayPrice, price, currencyCode,
///                                          periodUnit, periodCount }], missing }
///                                         price is the number as text ("9.99"), only used to compute a saving; the page
///                                         shows displayPrice (Apple's localized text). periodUnit is "day" | "week" |
///                                         "month" | "year" (null if unknown). Ids outside the two Pro ids go to `missing`
///                                         and are never asked from Apple.
///   purchase({ productId, appAccountToken })
///                                      -> { status: "success" | "pending" | "cancelled", ...Entry on "success" }
///                                         appAccountToken is the signed-in account's id (a UUID); Apple signs it into the
///                                         transaction so the server can match it to the account. "pending" is Ask to Buy /
///                                         Strong Customer Authentication: the transaction arrives later as a
///                                         `transactionUpdate` event.
///   currentEntitlements()              -> { transactions: [Entry] }   verified Pro transactions that are active now
///   unfinished()                       -> { transactions: [Entry] }   verified, not yet finished
///   restore()                          -> { transactions: [Entry] }   AppStore.sync() first (may ask for the Apple
///                                                                      Account password), then currentEntitlements()
///   finish({ transactionId })          -> {}      tells Apple the purchase was delivered; an unknown id is a no-op
///   manageSubscriptions()              -> {}      Apple's Manage Subscriptions sheet; returns when it closes
///   redeemCode()                       -> {}      Apple's offer-code redemption sheet (iOS 16+); a redeemed code arrives
///                                         as a `transactionUpdate` event like any other new transaction
///   refundRequest({ transactionId? })  -> { status: "success" | "cancelled" }   Apple's refund sheet for that transaction
///                                         (default: the active Pro transaction)
///
///   Entry = { jws, renewalInfoJws (or null), transactionId, originalTransactionId, productId,
///             expires (milliseconds since 1970, or null) }   ids are text so they never lose digits in JS
///
/// Event `transactionUpdate` (addListener): an Entry for a verified transaction that did not come from a call on this page: a
/// renewal, an Ask to Buy approval, a purchase on another device, or one left unfinished at the last launch. Capacitor keeps
/// events (retainUntilConsumed) until the page adds a listener, so nothing is lost while the page is still loading. The plugin
/// never finishes a transaction from this stream.
///
/// Errors: INVALID_ARGUMENT, NOT_AVAILABLE (no products, no store, no window), UNVERIFIED (Apple's own check on the phone
/// failed: nothing is granted and nothing is finished), CANCELED, FAILED. The messages are plain sentences with no prices (they
/// may reach a toast). Nothing here logs a signed transaction, a token or an account id.
///
/// No Info.plist key and no entitlement is needed: In-App Purchase is an App ID capability, and Family Sharing is off on both
/// products. `import StoreKit` links the framework by itself. Deployment target iOS 16: every call here is iOS 15+, and
/// `purchase(confirmIn:)` (iOS 17) sits behind #available.
@objc(StoreKitPlugin)
public final class StoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreKitPlugin"
    public let jsName = "CNStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "canMakePayments", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "products", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "currentEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unfinished", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manageSubscriptions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "redeemCode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "refundRequest", returnType: CAPPluginReturnPromise)
    ]

    /// The one subscription group "CyberNet AI Pro". Must equal netlify/lib/apple-products.mjs and mobile/web-ios/store.js
    /// (mobile/tests/run-bundle.mjs compares the three). Any other product is ignored.
    static let productIds: Set<String> = [
        "app.cybernetai.pro.monthly",
        "app.cybernetai.pro.yearly"
    ]

    /// Verified transactions that were handed to the page and not finished yet, by transaction id.
    private let pending = PendingTransactions()
    private var updatesTask: Task<Void, Never>?

    // MARK: - Transaction updates

    /// Runs once, when the bridge registers the plugin (before the page can call it). StoreKit hands over every unfinished
    /// transaction at app start through this stream, then every later change (Apple: listen from launch).
    override public func load() {
        updatesTask = Task.detached(priority: .utility) { [weak self] in
            for await result in Transaction.updates {
                guard let plugin = self else { return }
                await plugin.received(result)
            }
        }
    }

    deinit {
        updatesTask?.cancel()
    }

    /// Remembers the transaction and tells the page. Never finishes it: only `finish`, called by the page after the server
    /// has stored the transaction, does that.
    private func received(_ result: VerificationResult<Transaction>) async {
        guard case .verified(let transaction) = result else {
            CAPLog.print("StoreKitPlugin: ignored an update that did not verify")
            return
        }
        guard Self.productIds.contains(transaction.productID) else { return }
        await pending.remember(result)
        let event = await Self.entry(result, transaction)
        DispatchQueue.main.async { [weak self] in
            self?.notifyListeners("transactionUpdate", data: event, retainUntilConsumed: true)
        }
    }

    // MARK: - Methods

    @objc func canMakePayments(_ call: CAPPluginCall) {
        call.resolve(["allowed": AppStore.canMakePayments])
    }

    @objc func products(_ call: CAPPluginCall) {
        let asked = call.getArray("ids", String.self) ?? Self.productIds.sorted()
        let wanted = asked.filter { Self.productIds.contains($0) }
        let unknown = asked.filter { !Self.productIds.contains($0) }
        Task {
            do {
                let found = try await Product.products(for: wanted)
                let foundIds = Set(found.map { $0.id })
                let missing = unknown + wanted.filter { !foundIds.contains($0) }
                let list = found.sorted { $0.id < $1.id }.map { Self.describe($0) }
                call.resolve(["products": list, "missing": missing])
            } catch {
                call.reject("Pro can't be loaded right now.", "NOT_AVAILABLE")
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"), Self.productIds.contains(productId) else {
            call.reject("This option is not available.", "INVALID_ARGUMENT")
            return
        }
        guard let token = call.getString("appAccountToken"), let account = UUID(uuidString: token) else {
            call.reject("Sign in first.", "INVALID_ARGUMENT")
            return
        }
        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("Pro is not available right now.", "NOT_AVAILABLE")
                    return
                }
                let options: Set<Product.PurchaseOption> = [.appAccountToken(account)]
                let outcome: Product.PurchaseResult
                let window = await self.currentScene()
                if #available(iOS 17.0, *), let scene = window {
                    outcome = try await product.purchase(confirmIn: scene, options: options)
                } else {
                    outcome = try await product.purchase(options: options)
                }
                switch outcome {
                case .success(let verification):
                    guard case .verified(let transaction) = verification else {
                        // Apple's own check on the phone failed: grant nothing and finish nothing.
                        call.reject("The purchase could not be confirmed. Please try again.", "UNVERIFIED")
                        return
                    }
                    await self.pending.remember(verification)
                    var data = await Self.entry(verification, transaction)
                    data["status"] = "success"
                    call.resolve(data)
                case .pending:
                    call.resolve(["status": "pending"])
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                @unknown default:
                    call.reject("The purchase did not finish. Please try again.", "FAILED")
                }
            } catch {
                Self.fail(call, error, message: "The purchase did not finish. Please try again.")
            }
        }
    }

    @objc func currentEntitlements(_ call: CAPPluginCall) {
        Task {
            let items = await Self.entitlements()
            call.resolve(["transactions": items])
        }
    }

    @objc func unfinished(_ call: CAPPluginCall) {
        Task {
            var items: [[String: Any]] = []
            var seen = Set<UInt64>()
            for await result in Transaction.unfinished {
                guard case .verified(let transaction) = result, Self.productIds.contains(transaction.productID) else { continue }
                seen.insert(transaction.id)
                items.append(await Self.entry(result, transaction))
            }
            for result in await self.pending.all() {
                guard case .verified(let transaction) = result, !seen.contains(transaction.id) else { continue }
                items.append(await Self.entry(result, transaction))
            }
            call.resolve(["transactions": items])
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
            } catch {
                if let kit = error as? StoreKitError, case .userCancelled = kit {
                    call.reject("Restoring was cancelled.", "CANCELED")
                } else {
                    call.reject("Purchases could not be restored. Please try again.", "FAILED")
                }
                return
            }
            let items = await Self.entitlements()
            call.resolve(["transactions": items])
        }
    }

    @objc func finish(_ call: CAPPluginCall) {
        guard let text = call.getString("transactionId"), let id = UInt64(text) else {
            call.reject("A transaction is required.", "INVALID_ARGUMENT")
            return
        }
        Task {
            if let result = await self.pending.take(id) {
                if case .verified(let transaction) = result {
                    await transaction.finish()
                }
            } else {
                // Left over from an earlier launch: not in memory, but still unfinished at Apple.
                for await result in Transaction.unfinished {
                    if case .verified(let transaction) = result, transaction.id == id, Self.productIds.contains(transaction.productID) {
                        await transaction.finish()
                        break
                    }
                }
            }
            call.resolve()
        }
    }

    @objc func manageSubscriptions(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let scene = self.currentScene() else {
                call.reject("Subscriptions can't be managed right now.", "NOT_AVAILABLE")
                return
            }
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve()
            } catch {
                call.reject("Subscriptions can't be managed right now.", "FAILED")
            }
        }
    }

    @objc func redeemCode(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let scene = self.currentScene() else {
                call.reject("Codes can't be redeemed right now.", "NOT_AVAILABLE")
                return
            }
            do {
                try await AppStore.presentOfferCodeRedeemSheet(in: scene)
                call.resolve()
            } catch {
                call.reject("Codes can't be redeemed right now.", "FAILED")
            }
        }
    }

    @objc func refundRequest(_ call: CAPPluginCall) {
        let asked = call.getString("transactionId").flatMap { UInt64($0) }
        Task { @MainActor in
            var id = asked
            if id == nil {
                for await result in Transaction.currentEntitlements {
                    if case .verified(let transaction) = result, Self.productIds.contains(transaction.productID) {
                        id = transaction.id
                        break
                    }
                }
            }
            guard let transactionId = id, let scene = self.currentScene() else {
                call.reject("A refund can't be requested right now.", "NOT_AVAILABLE")
                return
            }
            do {
                let status = try await Transaction.beginRefundRequest(for: transactionId, in: scene)
                switch status {
                case .success: call.resolve(["status": "success"])
                case .userCancelled: call.resolve(["status": "cancelled"])
                @unknown default: call.resolve(["status": "cancelled"])
                }
            } catch {
                call.reject("A refund can't be requested right now.", "FAILED")
            }
        }
    }

    // MARK: - Helpers

    /// The window the store sheets belong to. Main thread (UIKit).
    @MainActor
    private func currentScene() -> UIWindowScene? {
        if let scene = bridge?.webView?.window?.windowScene {
            return scene
        }
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first
    }

    /// Verified Pro transactions that are active now, as entries. Anything that is not one of our products is skipped.
    private static func entitlements() async -> [[String: Any]] {
        var items: [[String: Any]] = []
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result, productIds.contains(transaction.productID) else { continue }
            items.append(await entry(result, transaction))
        }
        return items
    }

    /// One transaction as the page gets it: Apple's signed text plus the ids the page needs to show progress.
    private static func entry(_ result: VerificationResult<Transaction>, _ transaction: Transaction) async -> [String: Any] {
        var object: [String: Any] = [
            "jws": result.jwsRepresentation,
            "transactionId": String(transaction.id),
            "originalTransactionId": String(transaction.originalID),
            "productId": transaction.productID
        ]
        if let date = transaction.expirationDate {
            object["expires"] = Int((date.timeIntervalSince1970 * 1000).rounded())
        } else {
            object["expires"] = NSNull()
        }
        if let renewal = await transaction.subscriptionStatus?.renewalInfo.jwsRepresentation {
            object["renewalInfoJws"] = renewal
        } else {
            object["renewalInfoJws"] = NSNull()
        }
        return object
    }

    private static func describe(_ product: Product) -> [String: Any] {
        var unit: Any = NSNull()
        var count: Any = NSNull()
        if let period = product.subscription?.subscriptionPeriod {
            switch period.unit {
            case .day: unit = "day"
            case .week: unit = "week"
            case .month: unit = "month"
            case .year: unit = "year"
            @unknown default: unit = NSNull()
            }
            count = period.value
        }
        return [
            "id": product.id,
            "displayName": product.displayName,
            "description": product.description,
            "displayPrice": product.displayPrice,
            "price": NSDecimalNumber(decimal: product.price).stringValue,
            "currencyCode": product.priceFormatStyle.currencyCode,
            "periodUnit": unit,
            "periodCount": count
        ]
    }

    private static func fail(_ call: CAPPluginCall, _ error: Error, message: String) {
        if error is Product.PurchaseError {
            call.reject("Pro is not available right now.", "NOT_AVAILABLE")
        } else if let kit = error as? StoreKitError {
            switch kit {
            case .userCancelled: call.reject("That was cancelled.", "CANCELED")
            case .notAvailableInStorefront: call.reject("Pro is not available right now.", "NOT_AVAILABLE")
            case .networkError: call.reject("You're offline. Connect to the internet and try again.", "NOT_AVAILABLE")
            default: call.reject(message, "FAILED")
            }
        } else {
            call.reject(message, "FAILED")
        }
    }
}

/// The verified transactions this launch has seen and not finished, by id. An actor, because the updates stream, the page's
/// calls and `finish` run on different threads.
private actor PendingTransactions {
    private var items: [UInt64: VerificationResult<Transaction>] = [:]

    func remember(_ result: VerificationResult<Transaction>) {
        if case .verified(let transaction) = result {
            items[transaction.id] = result
        }
    }

    func take(_ id: UInt64) -> VerificationResult<Transaction>? {
        return items.removeValue(forKey: id)
    }

    func all() -> [VerificationResult<Transaction>] {
        return Array(items.values)
    }
}
