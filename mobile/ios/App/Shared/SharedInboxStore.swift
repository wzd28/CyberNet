import Foundation

// Compiled into BOTH the app and the Share Extension (extension-safe APIs only).
//
// The Share Extension checks an item on the iPhone and leaves it here, so the app can offer an
// AI explanation later (BUILD-PLAN §7.3 "Hand-off"). Public APIs only: App Group UserDefaults
// (key "cn.inbox", a JSON array) and JPEG files in the App Group container's "inbox" folder.
// Items expire after 24 hours. Nothing in this file sends data anywhere.

struct SharedInboxItem: Codable, Equatable {
    struct Verdict: Codable, Equatable {
        var band: String      // "scam" | "unverified" | "safe" | "none"
        var headline: String  // the label shown, e.g. "SCAM", "LOW RISK"
        var score: Double
    }

    var id: String
    var kind: String          // "text" | "url" | "image"
    var text: String?
    var url: String?
    var imageFile: String?
    var createdAt: Double     // milliseconds since 1970 (JavaScript time)
    var localVerdict: Verdict?

    /// The shape SharedInboxPlugin.read() returns to JavaScript (null for missing values).
    /// createdAt becomes an ISO 8601 date, which Date.parse() reads.
    func jsObject(imageDataUrl: String?) -> [String: Any] {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var object: [String: Any] = [
            "id": id,
            "kind": kind,
            "createdAt": formatter.string(from: Date(timeIntervalSince1970: createdAt / 1000))
        ]
        if let text = text { object["text"] = text } else { object["text"] = NSNull() }
        if let url = url { object["url"] = url } else { object["url"] = NSNull() }
        if let image = imageDataUrl { object["imageDataUrl"] = image } else { object["imageDataUrl"] = NSNull() }
        if let verdict = localVerdict {
            let verdictObject: [String: Any] = [
                "band": verdict.band,
                "headline": verdict.headline,
                "score": verdict.score
            ]
            object["localVerdict"] = verdictObject
        } else {
            object["localVerdict"] = NSNull()
        }
        return object
    }
}

struct SharedInboxStore {
    static let appGroup = "group.app.cybernetai"
    static let defaultsKey = "cn.inbox"
    static let maxAgeSeconds: Double = 24 * 60 * 60
    static let maxItems = 5 // keeps read() small: pictures cross the bridge as data URLs
    static let maxTextLength = 10_000

    private let defaults: UserDefaults?
    private let folder: URL?

    init() {
        defaults = UserDefaults(suiteName: Self.appGroup)
        folder = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: Self.appGroup)?
            .appendingPathComponent("inbox", isDirectory: true)
    }

    /// False when the App Group is not available (for example an unsigned simulator build).
    var isAvailable: Bool {
        return defaults != nil && folder != nil
    }

    /// Items younger than 24 hours, oldest first. Expired items and their pictures are deleted.
    func items(now: Date = Date()) -> [SharedInboxItem] {
        let all = load()
        let cutoff = (now.timeIntervalSince1970 - Self.maxAgeSeconds) * 1000
        let fresh = all.filter { $0.createdAt >= cutoff }
        if fresh.count != all.count {
            all.filter { $0.createdAt < cutoff }.forEach { deleteImage(of: $0) }
            save(fresh)
        }
        return fresh
    }

    func item(id: String) -> SharedInboxItem? {
        return items().first { $0.id == id }
    }

    /// Saves a shared item (and its picture, already JPEG-encoded). Returns nil if the App Group
    /// is unavailable or the picture could not be written.
    @discardableResult
    func add(kind: String, text: String?, url: String?, imageJPEG: Data?,
             verdict: SharedInboxItem.Verdict?) -> SharedInboxItem? {
        guard isAvailable, let folder = folder else { return nil }
        let id = UUID().uuidString
        var imageFile: String?
        if let jpeg = imageJPEG {
            let name = "\(id).jpg"
            do {
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                try jpeg.write(to: folder.appendingPathComponent(name),
                               options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                imageFile = name
            } catch {
                return nil
            }
        }
        let item = SharedInboxItem(
            id: id,
            kind: kind,
            text: text.map { String($0.prefix(Self.maxTextLength)) },
            url: url,
            imageFile: imageFile,
            createdAt: Date().timeIntervalSince1970 * 1000,
            localVerdict: verdict)
        var list = items()
        list.append(item)
        while list.count > Self.maxItems {
            deleteImage(of: list.removeFirst())
        }
        save(list)
        return item
    }

    func remove(id: String) {
        var list = load()
        guard let index = list.firstIndex(where: { $0.id == id }) else { return }
        deleteImage(of: list.remove(at: index))
        save(list)
    }

    func removeAll() {
        defaults?.removeObject(forKey: Self.defaultsKey)
        if let folder = folder {
            try? FileManager.default.removeItem(at: folder)
        }
    }

    func imageURL(for item: SharedInboxItem) -> URL? {
        guard let name = item.imageFile, let folder = folder, Self.isPlainFileName(name) else { return nil }
        return folder.appendingPathComponent(name)
    }

    // MARK: - Storage

    private static func isPlainFileName(_ name: String) -> Bool {
        return !name.isEmpty && !name.contains("/") && !name.contains("\\") && !name.contains("..")
    }

    private func load() -> [SharedInboxItem] {
        guard let json = defaults?.string(forKey: Self.defaultsKey),
              let data = json.data(using: .utf8),
              let list = try? JSONDecoder().decode([SharedInboxItem].self, from: data) else { return [] }
        return list
    }

    private func save(_ list: [SharedInboxItem]) {
        guard let defaults = defaults else { return }
        if list.isEmpty {
            defaults.removeObject(forKey: Self.defaultsKey)
            return
        }
        if let data = try? JSONEncoder().encode(list), let json = String(data: data, encoding: .utf8) {
            defaults.set(json, forKey: Self.defaultsKey)
        }
    }

    private func deleteImage(of item: SharedInboxItem) {
        if let url = imageURL(for: item) {
            try? FileManager.default.removeItem(at: url)
        }
    }
}
