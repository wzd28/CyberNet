import UIKit
import StoreKit
import Capacitor

/// Apple In-App Purchase (StoreKit 2) for the plans in the app (owner decision, 30 Oct 2026: Free, Pro and
/// Business in the app, bought with In-App Purchase as App Review guideline 3.1.1 requires).
///
/// JS name `CNStore`. mobile/web-ios/store.js is the only caller. This plugin buys, lists and restores; it
/// never decides who has a plan. Every transaction leaves as Apple's signed text (`jws`), and the server
/// (POST /api/apple-verify) checks the signature, the app, the product and the account before anything is
/// granted. The page calls `finish` only after the server has answered, so a purchase that could not be
/// confirmed stays unfinished and comes back on the next launch.
///
///   products({ ids? })                 -> { products: [{ id, displayName, description, displayPrice, price,
///                                          currencyCode, periodUnit, periodCount, familyShareable }], missing }
///                                         price is the number as text ("9.99"); periodUnit is "day" | "week" |
///                                         "month" | "year" (null if unknown); ids outside the five plans go to
///                                         `missing` and are never asked from Apple
///   purchase({ productId, appAccountToken })
///                                      -> { status: "success" | "pending" | "cancelled",
///                                          jws, renewalInfoJws, transactionId, originalTransactionId,
///                                          productId, expires }      (everything after status: "success" only)
///                                         appAccountToken is the signed-in account's id (a UUID); Apple signs
///                                         it into the transaction so the server can match it to the account.
///                                         "pending" is Ask to Buy / Strong Customer Authentication: the
///                                         transaction arrives later as a `transactionUpdate` event.
///   currentEntitlements()              -> { transactions: [Entry] }   verified plans that are active now
///   unfinished()                       -> { transactions: [Entry] }   verified, not yet finished
///   restore()                          -> { transactions: [Entry] }   AppStore.sync() first (may ask for the
///                                                                      Apple ID), then currentEntitlements()
///   finish({ transactionId })          -> {}      tells Apple the plan was delivered; an unknown id is a no-op
///   manageSubscriptions()              -> {}      Apple's Manage Subscriptions sheet; returns when it closes
///
///   Entry = { jws, renewalInfoJws (or null), transactionId, originalTransactionId, productId,
///             expires (milliseconds since 1970, or null) }   ids are text so they never lose digits in JS
///
/// Event `transactionUpdate` (addListener): { jws, renewalInfoJws (or null), transactionId, productId } for a
/// verified transaction that did not come from a call on this page: a renewal, an Ask to Buy approval, a
/// purchase made on another device, or one left unfinished at the last launch. Events are kept until the
/// page has a listener. The plugin never finishes a transaction from this stream.
///
/// Errors: INVALID_ARGUMENT, NOT_AVAILABLE (no products, no store, no window), UNVERIFIED (Apple's own check on
/// the phone failed: nothing is granted and nothing is finished), CANCELED (the person closed the Apple ID
/// sheet in restore), FAILED. The messages are plain sentences with no plan names or prices (they may reach
/// a toast). Nothing here logs a signed transaction, a token or an account id.
///
/// No Info.plist key and no entitlement is needed: In-App Purchase is an App ID capability, and Family
/// Sharing is off on every product. `import StoreKit` links the framework by itself.
@objc(StoreKitPlugin)
public final class StoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreKitPlugin"
    public let jsName = "CNStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "products", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "currentEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unfinished", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manageSubscriptions", returnType: CAPPluginReturnPromise)
    ]

    /// The one subscription group "CyberNet AI Plans". Must equal netlify/lib/apple-products.mjs and
    /// mobile/web-ios/store.js (mobile/tests/run-bundle.mjs compares them). Any other product is ignored.
    private static let productIds: Set<String> = [
        "app.cybernetai.pro.monthly",
        "app.cybernetai.pro.yearly",
        "app.cybernetai.business5.monthly",
        "app.cybernetai.business10.monthly",
        "app.cybernetai.business20.monthly"
    ]

    /// Verified transactions that were handed to the page and not finished yet, by transaction id.
    private let pending = PendingTransactions()
    private var updatesTask: Task<Void, Never>?

    // MARK: - Transaction updates

    /// Runs once, when the bridge registers the plugin (before the page can call it). StoreKit hands over
    /// every unfinished transaction at app start through this stream, then every later change.
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

    /// Remembers the transaction and tells the page. Never finishes it: only `finish`, called by the page after
    /// the server has recorded the transaction, does that.
    private func received(_ result: VerificationResult<Transaction>) async {
        if case .unverified(let transaction, _) = result {
            CAPLog.print("StoreKitPlugin: ignored an update that did not verify (\(transaction.productID))")
            return
        }
        guard case .verified(let transaction) = result, Self.productIds.contains(transaction.productID) else { return }
        await pending.remember(result)
        let renewal = await Self.renewalInfoJws(for: transaction)
        let event: [String: Any] = [
            "jws": result.jwsRepresentation,
            "renewalInfoJws": Self.textOrNull(renewal),
            "transactionId": String(transaction.id),
            "productId": transaction.productID
        ]
        DispatchQueue.main.async {
            self.notifyListeners("transactionUpdate", data: event, retainUntilConsumed: true)
        }
    }

    // MARK: - Methods

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
                call.reject("The plans can't be loaded right now.", "NOT_AVAILABLE")
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"), Self.productIds.contains(productId) else {
            call.reject("This plan is not available.", "INVALID_ARGUMENT")
            return
        }
        guard let token = call.getString("appAccountToken"), let account = UUID(uuidString: token) else {
            call.reject("An account is required to choose a plan.", "INVALID_ARGUMENT")
            return
        }
        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("This plan is not available right now.", "NOT_AVAILABLE")
                    return
                }
                let options: Set<Product.PurchaseOption> = [.appAccountToken(account)]
                let scene = await self.currentScene()
                let outcome: Product.PurchaseResult
                if #available(iOS 17.0, *), let scene = scene {
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
                    let data = await Self.entry(verification, transaction, status: "success")
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
        Task {
            guard let scene = await self.currentScene() else {
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

    /// Verified plans that are active now, as entries. Anything that is not one of our products is skipped.
    private static func entitlements() async -> [[String: Any]] {
        var items: [[String: Any]] = []
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result, productIds.contains(transaction.productID) else { continue }
            items.append(await entry(result, transaction))
        }
        return items
    }

    /// One transaction as the page gets it: Apple's signed text plus the ids the page needs to show progress.
    private static func entry(_ result: VerificationResult<Transaction>, _ transaction: Transaction,
                              status: String? = nil) async -> [String: Any] {
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
        let renewal = await renewalInfoJws(for: transaction)
        object["renewalInfoJws"] = textOrNull(renewal)
        if let status = status {
            object["status"] = status
        }
        return object
    }

    /// Apple's signed renewal information (auto-renew on or off, grace period) when StoreKit has it. Optional:
    /// the server works without it.
    private static func renewalInfoJws(for transaction: Transaction) async -> String? {
        let status = await transaction.subscriptionStatus
        return status?.renewalInfo.jwsRepresentation
    }

    private static func textOrNull(_ text: String?) -> Any {
        if let text = text {
            return text
        }
        return NSNull()
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
            "price": String(describing: product.price),
            "currencyCode": product.priceFormatStyle.currencyCode,
            "periodUnit": unit,
            "periodCount": count,
            "familyShareable": product.isFamilyShareable
        ]
    }

    private static func fail(_ call: CAPPluginCall, _ error: Error, message: String) {
        if error is Product.PurchaseError {
            call.reject("This plan is not available right now.", "NOT_AVAILABLE")
        } else if let kit = error as? StoreKitError {
            switch kit {
            case .userCancelled: call.reject("That was cancelled.", "CANCELED")
            case .notAvailableInStorefront: call.reject("This plan is not available right now.", "NOT_AVAILABLE")
            default: call.reject(message, "FAILED")
            }
        } else {
            call.reject(message, "FAILED")
        }
    }
}

/// The verified transactions this launch has seen and not finished, by id. An actor, because the updates
/// stream, the page's calls and `finish` run on different threads.
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
