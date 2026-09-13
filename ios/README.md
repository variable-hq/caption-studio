# Deferred Apple feasibility experiment

> **Status — deferred 10 August 2026:** paid Apple Developer Program distribution is not
> part of the current phase. Do not perform signing, App Store Connect, or TestFlight
> work unless the owner records a new decision. The web application is the only active
> product and release path.

This directory contains an internal iPhone/iPad TestFlight feasibility shell for the
Cloudflare-hosted Church Live Caption operator dashboard. It is not a standalone native
caption engine: Cloudflare Access, AI routes, the Durable Object, and OBS delivery remain
on the protected web backend.

## Safety boundary

- Use synthetic or explicitly approved audio only.
- Do not enable background audio or unattended capture.
- Do not embed Cloudflare, Groq, OBS, or Apple credentials in the app or repository.
- Microphone access is granted only to the exact HTTPS dashboard origin configured by
  `APP_BASE_URL`.
- The native lifecycle bridge stops capture when the app becomes inactive, asks the
  server to pause, and reconciles the authoritative channel state on foreground. The
  native header also shows a microphone indicator while the dashboard reports capture.
- The included privacy manifest declares only the native shell's app-local preference
  access. App Store Connect privacy answers still require an owner-approved audit of
  audio, captions, Cloudflare Access, Worker observability, and Groq processing.

## Generate and validate

Requirements: Xcode 26 or newer, XcodeGen, and an installed iOS Simulator runtime.

```bash
npm run ios:generate
npm run ios:build
npm run ios:test
npm run ios:archive:unsigned
```

The commands use `/Applications/Xcode.app` explicitly so they do not depend on the
machine-wide `xcode-select` setting.

## If the experiment is explicitly reopened

1. Replace `APP_BASE_URL` in `project.yml` with an isolated, Cloudflare Access-protected
   demo Worker. The current default URL is the existing Worker and may not contain this
   revision.
2. Confirm the legal publisher and reserve the final bundle identifier. The current
   candidate is `com.lukaskawira.churchlivecaption`.
3. Sign into Xcode with the enrolled Apple Developer account and select the correct team.
   Copy `Config/Signing.sample.xcconfig` to the gitignored `Config/Signing.xcconfig`, set
   `DEVELOPMENT_TEAM`, then run `npm run ios:archive`. That command loads the local file
   explicitly; it does not place the Team ID or credentials in the project.
4. Confirm the microphone purpose string and in-app processing notice with the privacy
   owner.
5. Complete App Store Connect privacy and export-compliance answers. The current web
   backend supports opted-in private sermon history and summaries; include their retention,
   provider processing and independent numeric usage in that review.
6. Test Cloudflare Access, microphone permission, `audio/mp4` MediaRecorder output,
   WebSockets, foreground/background behavior, network loss, and device lock on a
   physical iPhone or iPad.
7. Increment `CURRENT_PROJECT_VERSION` before every upload and associate the build with
   an exact reviewed Git revision.

## Historical internal TestFlight proposal

- App name: **Church Live Caption**
- Version/build: **0.1.0 (1)**
- Category: **Utilities**
- Distribution: **TestFlight Internal Only** for the first feasibility build
- Test group: **Internal — Church Live Caption**

After `npm run ios:archive` succeeds, use Xcode Organizer to validate and upload the
fresh signed archive. No App Store Connect API key, Fastlane, or Transporter automation
is required for the first internal build.
