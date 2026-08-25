import Foundation
import HealthKit

struct HealthSyncResult { let status: String; let imported: Int }

final class AppleHealthSync {
    static let shared = AppleHealthSync()
    private let store = HKHealthStore()

    private var readTypes: Set<HKObjectType> {
        var types: Set<HKObjectType> = [HKObjectType.workoutType()]
        [HKQuantityTypeIdentifier.heartRate, .distanceWalkingRunning, .activeEnergyBurned,
         .stepCount, .runningSpeed].compactMap(HKObjectType.quantityType(forIdentifier:)).forEach { types.insert($0) }
        return types
    }

    func run(url: URL) async -> HealthSyncResult {
        guard HKHealthStore.isHealthDataAvailable(),
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let token = parts.value("token"), let upload = parts.value("uploadUrl"),
              let uploadURL = URL(string: upload),
              let startMs = Double(parts.value("startTime") ?? ""),
              let endMs = Double(parts.value("endTime") ?? ""),
              uploadURL.scheme == "https",
              uploadURL.host == "asia-northeast3-amicicalender.cloudfunctions.net",
              uploadURL.path == "/uploadSamsungHealthRuns" else {
            return HealthSyncResult(status: "invalid-request", imported: 0)
        }
        do {
            try await store.requestAuthorization(toShare: [], read: readTypes)
            let workouts = try await runningWorkouts(from: Date(timeIntervalSince1970: startMs / 1000), to: Date(timeIntervalSince1970: endMs / 1000))
            var imported = 0
            for page in workouts.chunked(into: 30) {
                let runs = try await page.asyncMap { try await normalize($0) }
                try await uploadPage(token: token, runs: runs, complete: imported + page.count >= workouts.count, to: uploadURL)
                imported += page.count
            }
            if workouts.isEmpty { try await uploadPage(token: token, runs: [], complete: true, to: uploadURL) }
            return HealthSyncResult(status: "success", imported: imported)
        } catch let error as HKError where error.code == .errorAuthorizationDenied {
            return HealthSyncResult(status: "permission-denied", imported: 0)
        } catch {
            return HealthSyncResult(status: "sync-failed", imported: 0)
        }
    }

    private func runningWorkouts(from start: Date, to end: Date) async throws -> [HKWorkout] {
        let date = HKQuery.predicateForSamples(withStart: start, end: end)
        let running = HKQuery.predicateForWorkouts(with: .running)
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: .workoutType(), predicate: NSCompoundPredicate(andPredicateWithSubpredicates: [date, running]), limit: HKObjectQueryNoLimit, sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]) { _, samples, error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: (samples as? [HKWorkout]) ?? []) }
            }
            store.execute(query)
        }
    }

    private func normalize(_ workout: HKWorkout) async throws -> [String: Any] {
        async let heart = samples(.heartRate, workout: workout)
        async let speed = samples(.runningSpeed, workout: workout)
        let heartSamples = try await heart
        let speedSamples = try await speed
        var run: [String: Any] = [
            "source": "apple-health", "sourceId": workout.uuid.uuidString,
            "startTime": workout.startDate.timeIntervalSince1970 * 1000,
            "endTime": workout.endDate.timeIntervalSince1970 * 1000,
            "durationSec": workout.duration
        ]
        if let distance = workout.totalDistance?.doubleValue(for: .meter()) { run["distanceM"] = distance }
        if let energy = workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()) { run["calories"] = energy }
        let hrs = heartSamples.map { $0.quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute())) }
        if !hrs.isEmpty { run["avgHr"] = hrs.reduce(0, +) / Double(hrs.count); run["maxHr"] = hrs.max() }
        var timeline: [[String: Any]] = heartSamples.map { ["t": $0.startDate.timeIntervalSince1970 * 1000, "hr": $0.quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))] }
        for sample in speedSamples {
            let time = sample.startDate.timeIntervalSince1970 * 1000
            let value = sample.quantity.doubleValue(for: HKUnit.meter().unitDivided(by: .second()))
            if let index = timeline.indices.min(by: { abs((timeline[$0]["t"] as! Double) - time) < abs((timeline[$1]["t"] as! Double) - time) }), abs((timeline[index]["t"] as! Double) - time) < 15_000 {
                timeline[index]["speed"] = value
            } else { timeline.append(["t": time, "speed": value]) }
        }
        run["samples"] = timeline.sorted { ($0["t"] as! Double) < ($1["t"] as! Double) }.evenlyLimited(to: 1200)
        return run
    }

    private func samples(_ identifier: HKQuantityTypeIdentifier, workout: HKWorkout) async throws -> [HKQuantitySample] {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { return [] }
        return try await withCheckedThrowingContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart: workout.startDate, end: workout.endDate)
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: (samples as? [HKQuantitySample]) ?? []) }
            }
            store.execute(query)
        }
    }

    private func uploadPage(token: String, runs: [[String: Any]], complete: Bool, to url: URL) async throws {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["token": token, "runs": runs, "complete": complete])
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw URLError(.badServerResponse) }
    }
}

private extension URLComponents {
    func value(_ name: String) -> String? { queryItems?.first { $0.name == name }?.value }
}
private extension Array {
    func chunked(into size: Int) -> [[Element]] { stride(from: 0, to: count, by: size).map { Array(self[$0..<Swift.min($0 + size, count)]) } }
    func asyncMap<T>(_ transform: (Element) async throws -> T) async throws -> [T] { var result: [T] = []; for item in self { result.append(try await transform(item)) }; return result }
    func evenlyLimited(to limit: Int) -> [Element] { guard count > limit else { return self }; return (0..<limit).map { self[Int((Double($0) * Double(count - 1) / Double(limit - 1)).rounded())] } }
}
