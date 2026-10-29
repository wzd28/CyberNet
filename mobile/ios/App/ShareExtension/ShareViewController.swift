import UIKit
import SwiftUI
import UniformTypeIdentifiers
import ImageIO
import Vision

/// Longest text sent to the engine or kept for the app.
let maxSharedTextLength = 10_000

/// "Share to CyberNet AI" (BUILD-PLAN §7.3). Principal class of the Share Extension.
///
/// Checks a shared link, text or picture on the iPhone with the bundled engine and shows the
/// verdict. It has no network code, no account and no purchases. Pictures are read with Apple's
/// Vision framework on the device (QR codes and printed text). The item is then left in the App
/// Group for 24 hours so the app can offer an AI explanation (only after the person allows AI
/// analysis there).
final class ShareViewController: UIViewController {
    private let model = VerdictModel()
    private let engine = EngineRunner()
    private let store = SharedInboxStore()
    private var copyText = ""

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        engine.attach(to: view)

        let screen = VerdictView(model: model,
                                 onCopy: { [weak self] in self?.copyResult() },
                                 onDone: { [weak self] in self?.close() })
        let host = UIHostingController(rootView: screen)
        addChild(host)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        host.didMove(toParent: self)

        readSharedItem()
    }

    // MARK: - Reading what was shared

    private func readSharedItem() {
        let items = (extensionContext?.inputItems ?? []).compactMap { $0 as? NSExtensionItem }
        let providers = items.flatMap { $0.attachments ?? [] }
        let imageType = UTType.image.identifier
        let urlType = UTType.url.identifier
        let textType = UTType.plainText.identifier

        if let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(imageType) }) {
            loadImage(from: provider, type: imageType)
        } else if let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(urlType) }) {
            loadLink(from: provider, type: urlType)
        } else if let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(textType) }) {
            loadText(from: provider, type: textType)
        } else {
            showMessage("There is nothing CyberNet AI can check in what you shared. Share a link, some text or a screenshot.")
        }
    }

    private func loadLink(from provider: NSItemProvider, type: String) {
        provider.loadItem(forTypeIdentifier: type, options: nil) { [weak self] item, _ in
            var link: String?
            if let url = item as? URL {
                link = url.isFileURL ? nil : url.absoluteString
            } else if let data = item as? Data, let url = URL(dataRepresentation: data, relativeTo: nil) {
                link = url.isFileURL ? nil : url.absoluteString
            } else if let string = item as? String {
                link = string
            }
            let shared = link
            DispatchQueue.main.async {
                guard let self = self else { return }
                guard let link = shared?.trimmingCharacters(in: .whitespacesAndNewlines), !link.isEmpty else {
                    self.showMessage("CyberNet AI can check web links, text and screenshots, but not this kind of file.")
                    return
                }
                let scheme = URL(string: link)?.scheme?.lowercased() ?? ""
                if scheme == "http" || scheme == "https" {
                    self.check(kind: "url", payload: ["url": link]) { verdict in
                        self.store.add(kind: "url", text: nil, url: link, imageJPEG: nil, verdict: verdict)
                    }
                } else {
                    let text = String(link.prefix(maxSharedTextLength))
                    self.check(kind: "text", payload: ["text": text]) { verdict in
                        self.store.add(kind: "text", text: text, url: nil, imageJPEG: nil, verdict: verdict)
                    }
                }
            }
        }
    }

    private func loadText(from provider: NSItemProvider, type: String) {
        provider.loadItem(forTypeIdentifier: type, options: nil) { [weak self] item, _ in
            var text: String?
            if let string = item as? String {
                text = string
            } else if let attributed = item as? NSAttributedString {
                text = attributed.string
            } else if let data = item as? Data {
                text = String(data: data, encoding: .utf8)
            }
            let shared = text
            DispatchQueue.main.async {
                guard let self = self else { return }
                guard let raw = shared?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else {
                    self.showMessage("The shared text was empty.")
                    return
                }
                let text = String(raw.prefix(maxSharedTextLength))
                self.check(kind: "text", payload: ["text": text]) { verdict in
                    self.store.add(kind: "text", text: text, url: nil, imageJPEG: nil, verdict: verdict)
                }
            }
        }
    }

    private func loadImage(from provider: NSItemProvider, type: String) {
        provider.loadItem(forTypeIdentifier: type, options: nil) { [weak self] item, _ in
            // This handler runs off the main thread; a shared file is only readable while it runs.
            var source: CGImageSource?
            if let url = item as? URL {
                source = CGImageSourceCreateWithURL(url as CFURL, nil)
            } else if let data = item as? Data {
                source = CGImageSourceCreateWithData(data as CFData, nil)
            } else if let image = item as? UIImage, let data = image.jpegData(compressionQuality: 0.9) {
                source = CGImageSourceCreateWithData(data as CFData, nil)
            }
            guard let imageSource = source, let picture = SharedPicture.downscaled(imageSource) else {
                DispatchQueue.main.async {
                    self?.showMessage("CyberNet AI couldn't open this picture.")
                }
                return
            }
            let found = SharedPicture.read(picture)
            let jpeg = UIImage(cgImage: picture).jpegData(compressionQuality: 0.8)
            var payload: [String: String] = [:]
            if let qr = found.qr { payload["qr"] = qr }
            if let words = found.text { payload["text"] = String(words.prefix(maxSharedTextLength)) }
            let request = payload

            DispatchQueue.main.async {
                guard let self = self else { return }
                self.check(kind: "image", payload: request) { verdict in
                    self.store.add(kind: "image", text: nil, url: found.qr, imageJPEG: jpeg, verdict: verdict)
                }
            }
        }
    }

    // MARK: - Checking and showing the verdict

    private func check(kind: String, payload: [String: String],
                       handOff: @escaping (SharedInboxItem.Verdict?) -> SharedInboxItem?) {
        engine.run(kind: kind, payload: payload) { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(let verdict):
                self.copyText = Self.copyText(for: verdict)
                self.model.phase = .verdict(verdict)
                self.announce(verdict)
                if verdict.band != "none" {
                    let saved = SharedInboxItem.Verdict(band: verdict.band, headline: verdict.headline, score: verdict.score)
                    self.model.savedForApp = handOff(saved) != nil
                }
            case .failure:
                self.model.savedForApp = handOff(nil) != nil
                self.showMessage(self.model.savedForApp
                    ? "CyberNet AI couldn't check this here. Open CyberNet AI: your item is waiting there for 24 hours."
                    : "CyberNet AI couldn't check this here. Copy it and paste it into Check in the app.")
            }
        }
    }

    private func announce(_ verdict: EngineVerdict) {
        let feedback = UINotificationFeedbackGenerator()
        switch verdict.band {
        case "scam": feedback.notificationOccurred(.error)
        case "unverified": feedback.notificationOccurred(.warning)
        case "safe": feedback.notificationOccurred(.success)
        default: break
        }
        UIAccessibility.post(notification: .announcement, argument: "Result: \(verdict.headline)")
    }

    private func showMessage(_ text: String) {
        model.phase = .message(text)
    }

    private static func copyText(for verdict: EngineVerdict) -> String {
        var lines = ["CyberNet AI result: \(verdict.headline)"]
        if !verdict.lead.isEmpty { lines.append(verdict.lead) }
        lines.append(contentsOf: verdict.points.map { "• \($0)" })
        if !verdict.action.isEmpty { lines.append(verdict.action) }
        return lines.joined(separator: "\n")
    }

    private func copyResult() {
        guard !copyText.isEmpty else { return }
        UIPasteboard.general.string = copyText
        model.copied = true
    }

    private func close() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
}

/// Picture helpers. Not tied to the main thread: they run inside NSItemProvider's handler.
enum SharedPicture {
    /// Decodes at most 2048 px on the long side (never the full-size picture), upright.
    static func downscaled(_ source: CGImageSource) -> CGImage? {
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: 2048
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }

    /// QR payload and printed text, read on the device with Vision.
    static func read(_ picture: CGImage) -> (qr: String?, text: String?) {
        let barcodes = VNDetectBarcodesRequest()
        barcodes.symbologies = [.qr]

        let english = VNRecognizeTextRequest()
        english.recognitionLevel = .accurate
        english.usesLanguageCorrection = true
        let supported = (try? english.supportedRecognitionLanguages()) ?? []
        let englishCodes = supported.filter { $0.lowercased().hasPrefix("en") }
        if !englishCodes.isEmpty {
            english.recognitionLanguages = englishCodes
        }

        let handler = VNImageRequestHandler(cgImage: picture, orientation: .up, options: [:])
        try? handler.perform([barcodes, english])

        let qr = barcodes.results?.compactMap { $0.payloadStringValue }.first { !$0.isEmpty }
        var lines = english.results?.compactMap { $0.topCandidates(1).first?.string } ?? []

        // Arabic, when this iOS version can read it and English found little (UNCERTAIN per iOS
        // version: Vision lists its languages at run time). Run separately, never mixed.
        let arabicCodes = supported.filter { $0.lowercased().hasPrefix("ar") }
        if !arabicCodes.isEmpty && lines.joined().count < 40 {
            let arabic = VNRecognizeTextRequest()
            arabic.recognitionLevel = .accurate
            arabic.recognitionLanguages = arabicCodes
            try? handler.perform([arabic])
            let arabicLines = arabic.results?.compactMap { $0.topCandidates(1).first?.string } ?? []
            if arabicLines.joined().count > lines.joined().count {
                lines = arabicLines
            }
        }

        let text = lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        return (qr, text.isEmpty ? nil : text)
    }
}
