import SwiftUI
import UIKit

/// State of the share sheet screen.
final class VerdictModel: ObservableObject {
    enum Phase {
        case checking
        case verdict(EngineVerdict)
        case message(String)
    }

    @Published var phase: Phase = .checking
    @Published var savedForApp = false
    @Published var copied = false
}

/// The Share Extension's only screen (BUILD-PLAN §7.3 "UI"): a risk badge (words and an icon,
/// never colour alone), up to three reasons, what to do, the disclaimer, Copy result and Done.
/// No account, no network, no purchases, no marketing (guideline 4.4).
struct VerdictView: View {
    @ObservedObject var model: VerdictModel
    let onCopy: () -> Void
    let onDone: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    content
                    // verbatim: a "%" in a localized string key would be read as a format specifier.
                    Text(verbatim: "CyberNet AI checks for common scam signs on your iPhone. It is not antivirus software, and no scanner can promise something is 100% safe.")
                        .font(.footnote)
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            Divider()
            buttons
        }
        .background(Color(uiColor: .systemBackground).ignoresSafeArea())
    }

    private var header: some View {
        HStack {
            Text("CyberNet AI")
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            Spacer()
        }
        .frame(minHeight: 44)
        .padding(.horizontal, 20)
        .padding(.vertical, 6)
    }

    @ViewBuilder
    private var content: some View {
        switch model.phase {
        case .checking:
            HStack(spacing: 12) {
                ProgressView()
                Text("Checking on your iPhone…")
                    .font(.body)
            }
            .accessibilityElement(children: .combine)
        case .message(let text):
            Text(text)
                .font(.body)
                .fixedSize(horizontal: false, vertical: true)
        case .verdict(let verdict):
            verdictBody(verdict)
        }
    }

    @ViewBuilder
    private func verdictBody(_ verdict: EngineVerdict) -> some View {
        let style = BadgeStyle(band: verdict.band)
        HStack(spacing: 10) {
            Image(systemName: style.symbol)
                .font(.title2.weight(.semibold))
            Text(verdict.headline)
                .font(.title2.weight(.bold))
        }
        .foregroundColor(.white)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(style.color))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Result: \(verdict.headline)")

        if !verdict.lead.isEmpty {
            Text(verdict.lead)
                .font(.title3.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
        }

        if !verdict.points.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(verdict.points.enumerated()), id: \.offset) { _, point in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("•").accessibilityHidden(true)
                        Text(point).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .font(.body)
        }

        if !verdict.action.isEmpty {
            Text(verdict.action)
                .font(.body.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
        }

        if !verdict.subject.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text("What was checked")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.secondary)
                Text(verdict.subject)
                    .font(.callout)
                    .lineLimit(4)
                    .textSelection(.enabled)
            }
        }

        if model.savedForApp {
            Text("For an AI explanation, open CyberNet AI. Your item is waiting there for 24 hours.")
                .font(.callout)
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var buttons: some View {
        HStack(spacing: 12) {
            Button(action: onCopy) {
                Text(model.copied ? "Copied" : "Copy result")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.bordered)
            .disabled(!canCopy)

            Button(action: onDone) {
                Text("Done")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    private var canCopy: Bool {
        if case .verdict = model.phase { return true }
        return false
    }
}

private struct BadgeStyle {
    let symbol: String
    let color: Color

    init(band: String) {
        switch band {
        case "scam":
            symbol = "exclamationmark.octagon.fill"
            color = Color(red: 0.75, green: 0.11, blue: 0.13)
        case "unverified":
            symbol = "questionmark.diamond.fill"
            color = Color(red: 0.62, green: 0.32, blue: 0.0)
        case "safe":
            symbol = "checkmark.shield.fill"
            color = Color(red: 0.09, green: 0.45, blue: 0.24)
        default:
            symbol = "doc.text.magnifyingglass"
            color = Color(red: 0.30, green: 0.33, blue: 0.40)
        }
    }
}
