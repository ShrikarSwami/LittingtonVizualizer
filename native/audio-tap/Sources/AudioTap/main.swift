// AudioTap — captures the audio of every process whose bundle ID starts with one of
// the given prefixes (a Core Audio process tap, macOS 14.2+) and writes it to stdout
// as mono float32 little-endian PCM. Status goes to stderr as one JSON object per line.
//
//   AudioTap com.spotify.client
//   AudioTap com.google.Chrome
//
// The tap never changes what you hear: audio keeps playing through the normal output.

import AudioToolbox
import CoreAudio
import Foundation

setvbuf(stderr, nil, _IOLBF, 0)
signal(SIGPIPE, SIG_IGN)

let prefixes = Array(CommandLine.arguments.dropFirst())
guard !prefixes.isEmpty else {
    FileHandle.standardError.write("usage: AudioTap <bundle-id-prefix> [...]\n".data(using: .utf8)!)
    exit(2)
}

// MARK: - Own the permission prompt
//
// macOS attributes privacy prompts to the "responsible" process, which for a child process is
// whatever launched the chain (the Electron app, or a terminal during development). Re-launching
// ourselves with responsibility disclaimed makes this helper its own responsible process, so the
// audio-capture prompt is shown once, for this binary, however the app was started.

var disclaimedChild: pid_t = 0

func relaunchDisclaimed() {
    guard getenv("LV_TAP_CHILD") == nil,
          let symbol = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "responsibility_spawnattrs_setdisclaim"),
          let path = Bundle.main.executablePath else { return }
    typealias Disclaim = @convention(c) (UnsafeMutablePointer<posix_spawnattr_t?>, Int32) -> Int32
    var attributes: posix_spawnattr_t?
    posix_spawnattr_init(&attributes)
    defer { posix_spawnattr_destroy(&attributes) }
    guard unsafeBitCast(symbol, to: Disclaim.self)(&attributes, 1) == 0 else { return }

    setenv("LV_TAP_CHILD", "1", 1)
    let argv: [UnsafeMutablePointer<CChar>?] = CommandLine.arguments.map { strdup($0) } + [nil]
    guard posix_spawn(&disclaimedChild, path, nil, &attributes, argv, environ) == 0 else {
        unsetenv("LV_TAP_CHILD")
        return   // fall back to capturing in this process
    }
    for sig in [SIGINT, SIGTERM] { signal(sig) { kill(disclaimedChild, $0) } }
    var status: Int32 = 0
    while waitpid(disclaimedChild, &status, 0) < 0 && errno == EINTR {}
    exit((status & 0x7f) == 0 ? (status >> 8) & 0xff : 1)
}

relaunchDisclaimed()

func log(_ fields: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: fields),
       let line = String(data: data, encoding: .utf8) {
        fputs(line + "\n", stderr)
    }
}

// MARK: - Core Audio property helpers

func address(_ selector: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(
        mSelector: selector,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain)
}

func readValue<T>(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector, _ initial: T) -> T? {
    var addr = address(selector)
    var size = UInt32(MemoryLayout<T>.size)
    var value = initial
    let err = withUnsafeMutablePointer(to: &value) {
        AudioObjectGetPropertyData(object, &addr, 0, nil, &size, $0)
    }
    return err == noErr ? value : nil
}

func readString(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector) -> String? {
    var addr = address(selector)
    var size = UInt32(MemoryLayout<CFString?>.size)
    var value: Unmanaged<CFString>?
    let err = AudioObjectGetPropertyData(object, &addr, 0, nil, &size, &value)
    guard err == noErr, let value else { return nil }
    return value.takeRetainedValue() as String
}

func readObjectList(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector) -> [AudioObjectID] {
    var addr = address(selector)
    var size: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(object, &addr, 0, nil, &size) == noErr, size > 0 else { return [] }
    var list = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
    guard AudioObjectGetPropertyData(object, &addr, 0, nil, &size, &list) == noErr else { return [] }
    return list
}

let systemObject = AudioObjectID(kAudioObjectSystemObject)

/// Audio process objects whose bundle ID matches one of the requested prefixes.
func matchingProcesses() -> [AudioObjectID] {
    readObjectList(systemObject, kAudioHardwarePropertyProcessObjectList).filter { object in
        guard let bundle = readString(object, kAudioProcessPropertyBundleID) else { return false }
        return prefixes.contains { bundle.hasPrefix($0) }
    }.sorted()
}

func defaultOutputUID() -> String? {
    guard let device = readValue(systemObject, kAudioHardwarePropertyDefaultSystemOutputDevice,
                                 AudioObjectID(kAudioObjectUnknown)),
          device != kAudioObjectUnknown else { return nil }
    return readString(device, kAudioDevicePropertyDeviceUID)
}

// MARK: - Tap session

final class TapSession {
    private var tapID = AudioObjectID(kAudioObjectUnknown)
    private var aggregateID = AudioObjectID(kAudioObjectUnknown)
    private var procID: AudioDeviceIOProcID?
    private let queue = DispatchQueue(label: "audiotap.io", qos: .userInteractive)
    private var mono = [Float](repeating: 0, count: 8192)

    func start(processes: [AudioObjectID], outputUID: String) -> Bool {
        let description = CATapDescription(stereoMixdownOfProcesses: processes)
        description.uuid = UUID()
        description.name = "LittingtonVizualizer"
        description.isPrivate = true
        description.muteBehavior = .unmuted

        var err = AudioHardwareCreateProcessTap(description, &tapID)
        guard err == noErr else {
            log(["event": "error", "stage": "create-tap", "code": Int(err)])
            return false
        }

        let aggregate: [String: Any] = [
            kAudioAggregateDeviceNameKey: "LittingtonVizualizer Tap",
            kAudioAggregateDeviceUIDKey: UUID().uuidString,
            kAudioAggregateDeviceMainSubDeviceKey: outputUID,
            kAudioAggregateDeviceIsPrivateKey: true,
            kAudioAggregateDeviceIsStackedKey: false,
            kAudioAggregateDeviceTapAutoStartKey: true,
            kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: outputUID]],
            kAudioAggregateDeviceTapListKey: [[
                kAudioSubTapDriftCompensationKey: true,
                kAudioSubTapUIDKey: description.uuid.uuidString,
            ]],
        ]
        err = AudioHardwareCreateAggregateDevice(aggregate as CFDictionary, &aggregateID)
        guard err == noErr else {
            log(["event": "error", "stage": "create-aggregate", "code": Int(err)])
            stop()
            return false
        }

        guard let format = readValue(tapID, kAudioTapPropertyFormat, AudioStreamBasicDescription()) else {
            log(["event": "error", "stage": "read-format"])
            stop()
            return false
        }
        let channels = max(1, Int(format.mChannelsPerFrame))
        let interleaved = (format.mFormatFlags & kAudioFormatFlagIsNonInterleaved) == 0
        let isFloat = (format.mFormatFlags & kAudioFormatFlagIsFloat) != 0 && format.mBitsPerChannel == 32
        guard isFloat else {
            log(["event": "error", "stage": "format", "detail": "tap is not float32"])
            stop()
            return false
        }

        err = AudioDeviceCreateIOProcIDWithBlock(&procID, aggregateID, queue) { [weak self] _, input, _, _, _ in
            self?.handle(input: input, channels: channels, interleaved: interleaved)
        }
        guard err == noErr, let procID else {
            log(["event": "error", "stage": "create-ioproc", "code": Int(err)])
            stop()
            return false
        }
        err = AudioDeviceStart(aggregateID, procID)
        guard err == noErr else {
            log(["event": "error", "stage": "start", "code": Int(err)])
            stop()
            return false
        }

        log(["event": "format", "sampleRate": format.mSampleRate, "channels": channels,
             "processes": processes.count])
        return true
    }

    private func handle(input: UnsafePointer<AudioBufferList>, channels: Int, interleaved: Bool) {
        let buffers = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: input))
        guard let first = buffers.first, let firstData = first.mData else { return }
        let samplesInFirst = Int(first.mDataByteSize) / MemoryLayout<Float>.size
        let frames = interleaved ? samplesInFirst / channels : samplesInFirst
        guard frames > 0 else { return }
        if mono.count < frames { mono = [Float](repeating: 0, count: frames) }

        if interleaved {
            let source = firstData.assumingMemoryBound(to: Float.self)
            let scale = 1 / Float(channels)
            for frame in 0..<frames {
                var sum: Float = 0
                for channel in 0..<channels { sum += source[frame * channels + channel] }
                mono[frame] = sum * scale
            }
        } else {
            for frame in 0..<frames { mono[frame] = 0 }
            var used: Float = 0
            for buffer in buffers {
                guard let data = buffer.mData else { continue }
                let source = data.assumingMemoryBound(to: Float.self)
                let count = min(frames, Int(buffer.mDataByteSize) / MemoryLayout<Float>.size)
                for frame in 0..<count { mono[frame] += source[frame] }
                used += 1
            }
            if used > 1 { for frame in 0..<frames { mono[frame] /= used } }
        }

        let written = mono.withUnsafeBytes { bytes in
            write(STDOUT_FILENO, bytes.baseAddress, frames * MemoryLayout<Float>.size)
        }
        if written < 0 && errno == EPIPE { exit(0) }   // the app went away
    }

    func stop() {
        if aggregateID != kAudioObjectUnknown {
            if let procID {
                AudioDeviceStop(aggregateID, procID)
                AudioDeviceDestroyIOProcID(aggregateID, procID)
            }
            AudioHardwareDestroyAggregateDevice(aggregateID)
        }
        if tapID != kAudioObjectUnknown { AudioHardwareDestroyProcessTap(tapID) }
        procID = nil
        aggregateID = AudioObjectID(kAudioObjectUnknown)
        tapID = AudioObjectID(kAudioObjectUnknown)
    }
}

// MARK: - Supervisor: rebuild the tap when the app's audio processes or the output device change

var session: TapSession?
var currentProcesses: [AudioObjectID] = []
var currentOutput: String?
var waitingLogged = false

func refresh() {
    let processes = matchingProcesses()
    let output = defaultOutputUID()
    if processes == currentProcesses && output == currentOutput && (session != nil || processes.isEmpty) {
        return
    }
    session?.stop()
    session = nil
    currentProcesses = processes
    currentOutput = output

    guard !processes.isEmpty, let output else {
        if !waitingLogged { log(["event": "waiting"]); waitingLogged = true }
        return
    }
    waitingLogged = false
    let next = TapSession()
    if next.start(processes: processes, outputUID: output) {
        session = next
    } else {
        currentProcesses = []   // try again on the next tick
    }
}

let timer = DispatchSource.makeTimerSource(queue: .main)
timer.schedule(deadline: .now(), repeating: .seconds(2))
timer.setEventHandler { refresh() }
timer.resume()

for sig in [SIGINT, SIGTERM] {
    signal(sig, SIG_IGN)
    let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
    source.setEventHandler { session?.stop(); exit(0) }
    source.resume()
    _ = Unmanaged.passRetained(source as AnyObject)
}

// Exit if the parent closes our stdin (the Electron app quit or crashed).
DispatchQueue.global().async {
    var byte: UInt8 = 0
    while read(STDIN_FILENO, &byte, 1) > 0 {}
    DispatchQueue.main.async { session?.stop(); exit(0) }
}

dispatchMain()
