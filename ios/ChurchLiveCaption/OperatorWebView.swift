import SwiftUI
import UIKit
import WebKit

enum WebLoadState: Equatable {
    case loading
    case ready
    case failed(String)
}

struct OperatorWebView: UIViewRepresentable {
    let configuration: AppConfiguration
    let reloadToken: UUID
    @Binding var loadState: WebLoadState
    @Binding var serviceStatus: String
    @Binding var serviceMessage: String
    @Binding var microphoneActive: Bool

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIView(context: Context) -> WKWebView {
        let contentController = WKUserContentController()
        contentController.add(context.coordinator, name: "captionState")
        contentController.addUserScript(
            WKUserScript(
                source: Self.bridgeScript,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )

        let webConfiguration = WKWebViewConfiguration()
        webConfiguration.websiteDataStore = .default()
        webConfiguration.userContentController = contentController
        webConfiguration.allowsInlineMediaPlayback = true
        webConfiguration.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: webConfiguration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        context.coordinator.attach(to: webView)
        webView.load(URLRequest(url: configuration.dashboardURL))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.parent = self
        guard context.coordinator.reloadToken != reloadToken else { return }
        context.coordinator.reloadToken = reloadToken
        loadState = .loading
        webView.reloadFromOrigin()
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "captionState")
        coordinator.detach()
    }

    private static let bridgeScript = """
    (() => {
      if (window.__churchCaptionNativeBridgeInstalled) return;
      window.__churchCaptionNativeBridgeInstalled = true;
      const send = (detail) => {
        try {
          window.webkit.messageHandlers.captionState.postMessage(detail || {});
        } catch (_) {}
      };
      window.addEventListener('church-caption-state', (event) => send(event.detail));
      send({
        status: 'loading-channel',
        message: 'Loading the secure operator dashboard…',
        microphoneActive: false
      });
    })();
    """

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        var parent: OperatorWebView
        var reloadToken: UUID
        private weak var webView: WKWebView?
        private static let allowedServiceStatuses: Set<String> = [
            "loading-channel",
            "idle",
            "starting",
            "live",
            "pausing",
            "paused",
            "resuming",
            "ending",
            "taken-over",
            "error"
        ]

        init(parent: OperatorWebView) {
            self.parent = parent
            reloadToken = parent.reloadToken
            super.init()
        }

        func attach(to webView: WKWebView) {
            self.webView = webView
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(appWillResignActive),
                name: UIApplication.willResignActiveNotification,
                object: nil
            )
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(appDidBecomeActive),
                name: UIApplication.didBecomeActiveNotification,
                object: nil
            )
        }

        func detach() {
            NotificationCenter.default.removeObserver(self)
            webView = nil
        }

        deinit {
            NotificationCenter.default.removeObserver(self)
        }

        @objc private func appWillResignActive() {
            parent.microphoneActive = false
            if ["starting", "live", "resuming"].contains(parent.serviceStatus) {
                parent.serviceStatus = "pausing"
                parent.serviceMessage = "App inactive. Stopping audio capture…"
            }
            webView?.evaluateJavaScript(
                "window.dispatchEvent(new CustomEvent('church-caption-native-background'));"
            )
        }

        @objc private func appDidBecomeActive() {
            webView?.evaluateJavaScript(
                "window.dispatchEvent(new CustomEvent('church-caption-native-foreground'));"
            )
        }

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard
                message.name == "captionState",
                message.frameInfo.isMainFrame,
                parent.configuration.trustsDashboardOrigin(
                    scheme: message.frameInfo.securityOrigin.protocol,
                    host: message.frameInfo.securityOrigin.host,
                    port: message.frameInfo.securityOrigin.port
                ),
                let payload = message.body as? [String: Any]
            else { return }

            if
                let status = payload["status"] as? String,
                Self.allowedServiceStatuses.contains(status)
            {
                parent.serviceStatus = status
            }
            if let rawMessage = payload["message"] as? String {
                let trimmed = rawMessage.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty {
                    parent.serviceMessage = String(trimmed.prefix(240))
                }
            }
            if let microphoneActive = payload["microphoneActive"] as? Bool {
                parent.microphoneActive = microphoneActive
            }
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation?) {
            parent.loadState = .loading
            parent.microphoneActive = false
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation?) {
            parent.loadState = .ready
            if webView.url?.host?.caseInsensitiveCompare(
                parent.configuration.dashboardURL.host ?? ""
            ) != .orderedSame {
                parent.serviceStatus = "authentication"
                parent.serviceMessage = "Cloudflare Access sign-in required."
            }
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation?,
            withError error: Error
        ) {
            parent.loadState = .failed(error.localizedDescription)
            parent.serviceMessage = error.localizedDescription
        }

        func webView(
            _ webView: WKWebView,
            didFail navigation: WKNavigation?,
            withError error: Error
        ) {
            parent.loadState = .failed(error.localizedDescription)
            parent.serviceMessage = error.localizedDescription
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            parent.loadState = .loading
            webView.reload()
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            if url.absoluteString == "about:blank" {
                decisionHandler(.allow)
                return
            }

            if parent.configuration.allowsInAppNavigation(to: url) {
                if navigationAction.targetFrame == nil {
                    webView.load(navigationAction.request)
                    decisionHandler(.cancel)
                } else {
                    decisionHandler(.allow)
                }
                return
            }

            let scheme = url.scheme?.lowercased()
            if
                navigationAction.navigationType == .linkActivated,
                scheme == "https" || scheme == "mailto" || scheme == "tel"
            {
                UIApplication.shared.open(url)
            }
            decisionHandler(.cancel)
        }

        @available(iOS 15.0, *)
        func webView(
            _ webView: WKWebView,
            requestMediaCapturePermissionFor origin: WKSecurityOrigin,
            initiatedByFrame frame: WKFrameInfo,
            type: WKMediaCaptureType,
            decisionHandler: @escaping @MainActor @Sendable (WKPermissionDecision) -> Void
        ) {
            guard type == .microphone, frame.isMainFrame else {
                decisionHandler(.deny)
                return
            }

            let trusted = parent.configuration.trustsMediaOrigin(
                scheme: origin.protocol,
                host: origin.host,
                port: origin.port
            )
            decisionHandler(trusted ? .grant : .deny)
        }
    }
}
