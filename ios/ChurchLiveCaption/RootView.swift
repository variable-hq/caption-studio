import SwiftUI
import UIKit

struct RootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("acknowledged-audio-processing-v1") private var acknowledged = false
    @StateObject private var microphone = MicrophoneAuthorization()

    var body: some View {
        Group {
            if acknowledged {
                DashboardContainerView()
            } else {
                PrivacyPreflightView(
                    microphone: microphone,
                    onContinue: { acknowledged = true }
                )
            }
        }
        .tint(.primary)
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                microphone.refresh()
            }
        }
    }
}

private struct PrivacyPreflightView: View {
    @ObservedObject var microphone: MicrophoneAuthorization
    let onContinue: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Spacer(minLength: 36)

                Image(systemName: "captions.bubble.fill")
                    .font(.system(size: 52, weight: .semibold))
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 10) {
                    Text("Church Live Caption")
                        .font(.largeTitle.bold())
                    Text("Internal TestFlight preflight")
                        .font(.headline)
                        .foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 14) {
                    Label("Approved audio only", systemImage: "checkmark.shield")
                        .font(.headline)
                    Text("Audio is sent in short chunks to protected cloud services for transcription and translation. This application does not archive the audio or sermon transcript. Use only synthetic or explicitly approved audio.")
                        .foregroundStyle(.secondary)
                    Text("Cloudflare Access sign-in is required. Keep OBS channel URLs out of screenshots, feedback, and messages.")
                        .foregroundStyle(.secondary)
                }
                .padding(18)
                .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))

                microphoneActions

                Spacer(minLength: 24)
            }
            .frame(maxWidth: 560, alignment: .leading)
            .padding(24)
            .frame(maxWidth: .infinity)
        }
        .background(Color(uiColor: .systemBackground))
    }

    @ViewBuilder
    private var microphoneActions: some View {
        switch microphone.status {
        case .unknown:
            Button("Allow microphone") {
                microphone.request()
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)

            Button("Continue in view-only mode", action: onContinue)
                .buttonStyle(.bordered)
                .controlSize(.large)
        case .authorized:
            Label("Microphone permission granted", systemImage: "mic.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)

            Button("Open secure dashboard", action: onContinue)
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
        case .denied:
            Label("Microphone permission is off", systemImage: "mic.slash.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)

            Button("Open microphone settings") {
                guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                UIApplication.shared.open(url)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)

            Button("Continue in view-only mode", action: onContinue)
                .buttonStyle(.bordered)
                .controlSize(.large)
        }
    }
}

private struct DashboardContainerView: View {
    @State private var reloadToken = UUID()
    @State private var loadState: WebLoadState = .loading
    @State private var serviceStatus = "setup"
    @State private var serviceMessage = "Opening the secure operator dashboard…"
    @State private var microphoneActive = false
    @State private var showingSafetyInfo = false

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Circle()
                    .fill(statusColor)
                    .frame(width: 9, height: 9)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 1) {
                    Text(statusLabel)
                        .font(.subheadline.weight(.semibold))
                    Text(serviceMessage)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer(minLength: 8)

                if microphoneActive {
                    Image(systemName: "mic.fill")
                        .foregroundStyle(.orange)
                        .accessibilityLabel("Microphone active")
                }

                Button {
                    showingSafetyInfo = true
                } label: {
                    Image(systemName: "info.circle")
                }
                .accessibilityLabel("Show beta safety information")

                Button {
                    reloadToken = UUID()
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .accessibilityLabel("Reload secure dashboard")
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(.bar)

            Divider()

            OperatorWebView(
                configuration: .current,
                reloadToken: reloadToken,
                loadState: $loadState,
                serviceStatus: $serviceStatus,
                serviceMessage: $serviceMessage,
                microphoneActive: $microphoneActive
            )
        }
        .sheet(isPresented: $showingSafetyInfo) {
            NavigationStack {
                List {
                    Section("Internal beta boundary") {
                        Text("Use synthetic or explicitly approved audio only. The build is not approved for unattended or production services.")
                        Text("Audio is processed by protected Cloudflare and Groq services. This app does not enable background recording.")
                        Text("Never include caption content or OBS bearer URLs in TestFlight feedback screenshots.")
                    }
                }
                .navigationTitle("Beta safety")
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { showingSafetyInfo = false }
                    }
                }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private var statusLabel: String {
        if case .failed = loadState { return "Dashboard unavailable" }
        if loadState == .loading { return "Connecting securely" }
        switch serviceStatus {
        case "authentication": return "Sign in required"
        case "live": return "Captions live"
        case "paused": return "Service paused"
        case "error": return "Service needs attention"
        case "starting", "resuming", "pausing", "ending": return "Service updating"
        default: return "Secure dashboard"
        }
    }

    private var statusColor: Color {
        if case .failed = loadState { return .red }
        if serviceStatus == "error" { return .red }
        if serviceStatus == "live" { return .green }
        if serviceStatus == "paused" { return .orange }
        return .secondary
    }
}
