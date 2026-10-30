import UIKit
import Capacitor

/// Keeps the native tab bar in step with the page (BUILD-PLAN §6.6). Used by mobile/web-ios/ios.js.
///
/// JS name `CNTabBar`:
///   select({ tab })        -> {}                  highlights "check" | "scan" | "recovery" | "learn" | "account"
///                                                  (no `cnTab` event is sent back)
///   setHidden({ hidden })  -> {}                  e.g. while the keyboard or a full-screen sheet is up
///   getMetrics()           -> { height, hidden }  the bar's overlap with the page in CSS pixels,
///                                                  home-indicator area included (0 when hidden)
/// Changes are also pushed as the window event `cnTabBarMetrics` (MainViewController.swift).
@objc(TabBarPlugin)
public final class TabBarPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TabBarPlugin"
    public let jsName = "CNTabBar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "select", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setHidden", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getMetrics", returnType: CAPPluginReturnPromise)
    ]

    @objc func select(_ call: CAPPluginCall) {
        guard let tab = call.getString("tab") else {
            call.reject("A tab is required.", "INVALID_ARGUMENT")
            return
        }
        DispatchQueue.main.async {
            guard let shell = self.bridge?.viewController as? MainViewController else {
                call.unavailable("The tab bar is not available.")
                return
            }
            if shell.selectTab(tab) {
                call.resolve()
            } else {
                call.reject("Unknown tab \"\(tab)\".", "INVALID_ARGUMENT")
            }
        }
    }

    @objc func setHidden(_ call: CAPPluginCall) {
        let hidden = call.getBool("hidden", false)
        DispatchQueue.main.async {
            guard let shell = self.bridge?.viewController as? MainViewController else {
                call.unavailable("The tab bar is not available.")
                return
            }
            shell.setTabBarHiddenByPage(hidden)
            call.resolve()
        }
    }

    @objc func getMetrics(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let shell = self.bridge?.viewController as? MainViewController else {
                call.unavailable("The tab bar is not available.")
                return
            }
            let metrics = shell.tabBarMetrics()
            call.resolve(["height": metrics.height, "hidden": metrics.hidden])
        }
    }
}
