import AVFoundation
import SwiftUI

@MainActor
final class MicrophoneAuthorization: ObservableObject {
    enum Status: Equatable {
        case unknown
        case authorized
        case denied
    }

    @Published private(set) var status: Status = .unknown

    init() {
        refresh()
    }

    func refresh() {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            status = .authorized
        case .denied, .restricted:
            status = .denied
        case .notDetermined:
            status = .unknown
        @unknown default:
            status = .denied
        }
    }

    func request() {
        AVCaptureDevice.requestAccess(for: .audio) { [weak self] granted in
            Task { @MainActor in
                self?.status = granted ? .authorized : .denied
            }
        }
    }
}
