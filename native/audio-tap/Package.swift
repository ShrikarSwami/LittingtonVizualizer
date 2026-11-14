// swift-tools-version:5.9
import PackageDescription

// Build from this directory (npm run build:native does): the Info.plist path below is relative to it.
let package = Package(
    name: "AudioTap",
    platforms: [.macOS("14.2")],
    targets: [
        .executableTarget(
            name: "AudioTap",
            path: "Sources/AudioTap",
            linkerSettings: [
                // Embed Info.plist in the binary so macOS can show the audio-capture prompt for it.
                .unsafeFlags(["-Xlinker", "-sectcreate", "-Xlinker", "__TEXT",
                              "-Xlinker", "__info_plist", "-Xlinker", "Info.plist"])
            ]
        )
    ]
)
