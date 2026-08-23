import Foundation

enum AppConfigurationError: Error, Equatable {
    case missingDashboardURL
    case insecureDashboardURL
}

struct AppConfiguration: Equatable {
    let dashboardURL: URL

    static let current: AppConfiguration = {
        do {
            return try AppConfiguration(infoDictionary: Bundle.main.infoDictionary ?? [:])
        } catch {
            fatalError("A valid HTTPS AppBaseURL is required in Info.plist")
        }
    }()

    init(infoDictionary: [String: Any]) throws {
        guard
            let rawValue = infoDictionary["AppBaseURL"] as? String,
            let url = URL(string: rawValue),
            url.host != nil
        else {
            throw AppConfigurationError.missingDashboardURL
        }
        try self.init(dashboardURL: url)
    }

    init(dashboardURL: URL) throws {
        guard
            dashboardURL.scheme?.lowercased() == "https",
            dashboardURL.host != nil,
            dashboardURL.user == nil,
            dashboardURL.password == nil
        else {
            throw AppConfigurationError.insecureDashboardURL
        }
        self.dashboardURL = dashboardURL
    }

    func trustsMediaOrigin(scheme: String, host: String, port: Int) -> Bool {
        trustsDashboardOrigin(scheme: scheme, host: host, port: port)
    }

    func trustsDashboardOrigin(scheme: String, host: String, port: Int) -> Bool {
        let normalizedScheme = scheme.lowercased()
        let expectedPort = dashboardURL.port ?? 443
        let normalizedPort = port == 0 && normalizedScheme == "https" ? 443 : port
        return normalizedScheme == "https"
            && host.caseInsensitiveCompare(dashboardURL.host ?? "") == .orderedSame
            && normalizedPort == expectedPort
    }

    func allowsInAppNavigation(to url: URL) -> Bool {
        guard
            let scheme = url.scheme?.lowercased(),
            let host = url.host?.lowercased(),
            scheme == "https",
            url.user == nil,
            url.password == nil
        else {
            return false
        }

        if trustsDashboardOrigin(
            scheme: scheme,
            host: host,
            port: url.port ?? 0
        ) {
            return true
        }

        let isCloudflareAccess = host == "cloudflareaccess.com"
            || host.hasSuffix(".cloudflareaccess.com")
        return isCloudflareAccess && (url.port == nil || url.port == 443)
    }
}
