import SwiftUI
import WebKit

struct AmiciWebView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.load(URLRequest(url: URL(string: "https://amicicalender.web.app/")!))
        context.coordinator.webView = webView
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate {
        weak var webView: WKWebView?

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url,
                  url.scheme == "amici", url.host == "apple-health", url.path == "/sync" else {
                decisionHandler(.allow)
                return
            }
            decisionHandler(.cancel)
            Task { @MainActor in
                let result = await AppleHealthSync.shared.run(url: url)
                var destination = URLComponents(string: "https://amicicalender.web.app/")!
                destination.queryItems = [
                    URLQueryItem(name: "healthSync", value: result.status),
                    URLQueryItem(name: "healthImported", value: String(result.imported))
                ]
                if let target = destination.url { webView.load(URLRequest(url: target)) }
            }
        }
    }
}
