import XCTest
@testable import ChurchLiveCaption

final class AppConfigurationTests: XCTestCase {
    func testLoadsSecureDashboardURL() throws {
        let configuration = try AppConfiguration(
            infoDictionary: [
                "AppBaseURL": "https://church-live-caption.example.test/"
            ]
        )

        XCTAssertEqual(configuration.dashboardURL.host, "church-live-caption.example.test")
    }

    func testRejectsInsecureDashboardURL() {
        XCTAssertThrowsError(
            try AppConfiguration(dashboardURL: URL(string: "http://example.test")!)
        ) { error in
            XCTAssertEqual(error as? AppConfigurationError, .insecureDashboardURL)
        }
    }

    func testTrustsMicrophoneOnlyForExactDashboardOrigin() throws {
        let configuration = try AppConfiguration(
            dashboardURL: URL(string: "https://church-live-caption.example.test")!
        )

        XCTAssertTrue(
            configuration.trustsMediaOrigin(
                scheme: "https",
                host: "church-live-caption.example.test",
                port: 443
            )
        )
        XCTAssertTrue(
            configuration.trustsMediaOrigin(
                scheme: "https",
                host: "church-live-caption.example.test",
                port: 0
            )
        )
        XCTAssertFalse(
            configuration.trustsMediaOrigin(
                scheme: "https",
                host: "login.example.test",
                port: 443
            )
        )
        XCTAssertFalse(
            configuration.trustsMediaOrigin(
                scheme: "http",
                host: "church-live-caption.example.test",
                port: 80
            )
        )
    }

    func testAllowsOnlyDashboardAndCloudflareAccessNavigation() throws {
        let configuration = try AppConfiguration(
            dashboardURL: URL(string: "https://church-live-caption.example.test")!
        )

        XCTAssertTrue(
            configuration.allowsInAppNavigation(
                to: URL(string: "https://church-live-caption.example.test/setup")!
            )
        )
        XCTAssertTrue(
            configuration.allowsInAppNavigation(
                to: URL(string: "https://church-caption.cloudflareaccess.com/cdn-cgi/access/login")!
            )
        )
        XCTAssertFalse(
            configuration.allowsInAppNavigation(
                to: URL(string: "https://example.com")!
            )
        )
        XCTAssertFalse(
            configuration.allowsInAppNavigation(
                to: URL(string: "https://church-caption.cloudflareaccess.com.example.com")!
            )
        )
    }
}
