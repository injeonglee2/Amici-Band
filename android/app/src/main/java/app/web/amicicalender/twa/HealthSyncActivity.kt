package app.web.amicicalender.twa

import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.SpeedRecord
import androidx.health.connect.client.records.StepsCadenceRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.max
import kotlin.math.min
import kotlin.reflect.KClass

/**
 * TWA에서 발급받은 일회용 토큰으로 Health Connect 러닝을 읽어 서버에 전달한다.
 * 원본 위치 경로와 원시 센서 배열은 전송하지 않고 운동 요약과 계산된 1km 구간만 보낸다.
 */
class HealthSyncActivity : ComponentActivity() {
    companion object {
        private const val SYNC_ENDPOINT = "https://asia-northeast3-amicicalender.cloudfunctions.net/uploadSamsungHealthRuns"
    }

    private lateinit var statusText: TextView
    private lateinit var progress: ProgressBar
    private lateinit var closeButton: Button
    private lateinit var client: HealthConnectClient
    private var token = ""
    private var rangeDays = 90L

    private val permissionLauncher = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { granted ->
        val exercisePermission = HealthPermission.getReadPermission(ExerciseSessionRecord::class)
        if (!granted.contains(exercisePermission)) {
            showFailure("운동 기록 권한이 필요해요. Health Connect에서 운동 권한을 허용해 주세요.")
        } else {
            lifecycleScope.launch { runSync() }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
        val uri = intent?.data
        token = uri?.getQueryParameter("token").orEmpty()
        rangeDays = uri?.getQueryParameter("days")?.toLongOrNull()?.coerceIn(1, 3650) ?: 90L
        if (uri?.scheme != "amicicalender" || uri.host != "health" || token.length !in 20..200) {
            showFailure("유효하지 않은 동기화 요청이에요. Amici에서 다시 시작해 주세요.")
            return
        }
        when (HealthConnectClient.getSdkStatus(this)) {
            HealthConnectClient.SDK_AVAILABLE -> {
                client = HealthConnectClient.getOrCreate(this)
                lifecycleScope.launch { requestOrSync() }
            }
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED ->
                showFailure("Health Connect 설치 또는 업데이트가 필요해요.")
            else -> showFailure("이 기기에서는 Health Connect를 사용할 수 없어요.")
        }
    }

    private fun requiredPermissions(): Set<String> = buildSet {
        add(HealthPermission.getReadPermission(ExerciseSessionRecord::class))
        add(HealthPermission.getReadPermission(DistanceRecord::class))
        add(HealthPermission.getReadPermission(SpeedRecord::class))
        add(HealthPermission.getReadPermission(HeartRateRecord::class))
        add(HealthPermission.getReadPermission(StepsRecord::class))
        add(HealthPermission.getReadPermission(StepsCadenceRecord::class))
        add(HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class))
        add(HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class))
        if (rangeDays > 30) add(HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY)
    }

    private suspend fun requestOrSync() {
        val granted = client.permissionController.getGrantedPermissions()
        val requested = requiredPermissions()
        if (granted.containsAll(requested)) runSync() else permissionLauncher.launch(requested)
    }

    private suspend fun runSync() {
        setStatus("러닝 기록을 읽고 있어요…")
        try {
            val end = Instant.now()
            val start = end.minus(Duration.ofDays(rangeDays))
            val sessions = readAll(ExerciseSessionRecord::class, start, end)
                .filter { it.exerciseType == ExerciseSessionRecord.EXERCISE_TYPE_RUNNING || it.exerciseType == ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL }
            val records = JSONArray()
            sessions.forEachIndexed { index, session ->
                setStatus("러닝 기록을 정리하고 있어요… ${index + 1}/${sessions.size}")
                records.put(buildWorkout(session))
            }
            setStatus("개인 기록에 저장하고 있어요…")
            val count = upload(records)
            Toast.makeText(this, "러닝 기록 ${count}건을 동기화했어요.", Toast.LENGTH_LONG).show()
            finish()
        } catch (error: Exception) {
            showFailure(error.message?.takeIf { it.isNotBlank() } ?: "동기화 중 문제가 생겼어요. 다시 시도해 주세요.")
        }
    }

    private suspend fun buildWorkout(session: ExerciseSessionRecord): JSONObject {
        val origin = session.metadata.dataOrigin
        val start = session.startTime
        val end = session.endTime
        val distances = safeRead(DistanceRecord::class, start, end, origin)
        val speedRecords = safeRead(SpeedRecord::class, start, end, origin)
        val heartRecords = safeRead(HeartRateRecord::class, start, end, origin)
        val cadenceRecords = safeRead(StepsCadenceRecord::class, start, end, origin)
        val stepRecords = safeRead(StepsRecord::class, start, end, origin)
        val activeCalories = safeRead(ActiveCaloriesBurnedRecord::class, start, end, origin)
        val totalCalories = safeRead(TotalCaloriesBurnedRecord::class, start, end, origin)

        val heart = heartRecords.flatMap { it.samples }.sortedBy { it.time }
        val cadence = cadenceRecords.flatMap { it.samples }.sortedBy { it.time }
        val distancePoints = lapDistancePoints(session).ifEmpty { speedDistancePoints(session, speedRecords) }
        val splits = buildSplits(distancePoints, heart, cadence)
        val measuredDistance = distances.sumOf { it.distance.inMeters }
        val derivedDistance = distancePoints.lastOrNull()?.distanceM ?: 0.0
        val distanceM = if (measuredDistance >= 100.0) measuredDistance else derivedDistance
        val durationSec = Duration.between(start, end).toMillis() / 1000.0
        val heartValues = heart.map { it.beatsPerMinute.toDouble() }
        val cadenceValues = cadence.map { it.rate }
        val activeKcal = activeCalories.sumOf { it.energy.inKilocalories }
        val totalKcal = totalCalories.sumOf { it.energy.inKilocalories }
        val zone = session.startZoneOffset?.let { ZoneId.ofOffset("UTC", it) } ?: ZoneId.systemDefault()
        return JSONObject().apply {
            put("sourceId", session.metadata.id)
            put("title", session.title.orEmpty())
            put("date", DateTimeFormatter.ISO_LOCAL_DATE.format(start.atZone(zone)))
            put("startTime", start.toEpochMilli())
            put("endTime", end.toEpochMilli())
            put("distanceM", distanceM)
            put("durationSec", durationSec)
            if (heartValues.isNotEmpty()) {
                put("avgHr", heartValues.average())
                put("maxHr", heartValues.maxOrNull())
            }
            if (cadenceValues.isNotEmpty()) {
                put("avgCadence", cadenceValues.average())
                put("maxCadence", cadenceValues.maxOrNull())
            }
            put("steps", stepRecords.sumOf { it.count })
            put("calories", if (activeKcal > 0) activeKcal else totalKcal)
            put("splits", JSONArray(splits.map { it.toJson() }))
        }
    }

    private suspend fun <T : Record> safeRead(type: KClass<T>, start: Instant, end: Instant, origin: DataOrigin): List<T> =
        try { readAll(type, start, end, setOf(origin)) } catch (_: Exception) { emptyList() }

    private suspend fun <T : Record> readAll(
        type: KClass<T>,
        start: Instant,
        end: Instant,
        origins: Set<DataOrigin> = emptySet(),
    ): List<T> {
        val records = mutableListOf<T>()
        var pageToken: String? = null
        do {
            val response = client.readRecords(
                ReadRecordsRequest(
                    recordType = type,
                    timeRangeFilter = TimeRangeFilter.between(start, end),
                    dataOriginFilter = origins,
                    pageSize = 1000,
                    pageToken = pageToken,
                )
            )
            records.addAll(response.records)
            pageToken = response.pageToken
        } while (pageToken != null)
        return records
    }

    private fun lapDistancePoints(session: ExerciseSessionRecord): List<DistancePoint> {
        if (session.laps.none { it.length != null }) return emptyList()
        val points = mutableListOf(DistancePoint(session.startTime.toEpochMilli(), 0.0))
        var distance = 0.0
        session.laps.sortedBy { it.endTime }.forEach { lap ->
            val length = lap.length?.inMeters ?: return@forEach
            if (length > 0) {
                distance += length
                points.add(DistancePoint(lap.endTime.toEpochMilli(), distance))
            }
        }
        return if (points.size >= 2) points else emptyList()
    }

    private fun speedDistancePoints(session: ExerciseSessionRecord, records: List<SpeedRecord>): List<DistancePoint> {
        val samples = records.flatMap { it.samples }.distinctBy { it.time }.sortedBy { it.time }
        if (samples.size < 2) return emptyList()
        val points = mutableListOf(DistancePoint(session.startTime.toEpochMilli(), 0.0))
        var distance = 0.0
        samples.zipWithNext().forEach { (a, b) ->
            val seconds = Duration.between(a.time, b.time).toMillis() / 1000.0
            val speedA = a.speed.inMetersPerSecond
            val speedB = b.speed.inMetersPerSecond
            if (seconds > 0 && seconds <= 30 && speedA in 0.0..12.0 && speedB in 0.0..12.0) {
                distance += ((speedA + speedB) / 2.0) * seconds
            }
            points.add(DistancePoint(b.time.toEpochMilli(), distance))
        }
        return points
    }

    private fun buildSplits(
        points: List<DistancePoint>,
        heart: List<HeartRateRecord.Sample>,
        cadence: List<StepsCadenceRecord.Sample>,
    ): List<Split> {
        if (points.size < 2 || points.last().distanceM < 200) return emptyList()
        val result = mutableListOf<Split>()
        var fromDistance = 0.0
        var fromTime = points.first().timeMs
        var cursor = 1

        fun append(target: Double, partial: Boolean) {
            while (cursor < points.size && points[cursor].distanceM < target) cursor++
            if (cursor >= points.size) return
            val before = points[cursor - 1]
            val after = points[cursor]
            val span = after.distanceM - before.distanceM
            val ratio = if (span <= 0) 1.0 else ((target - before.distanceM) / span).coerceIn(0.0, 1.0)
            val endTime = (before.timeMs + (after.timeMs - before.timeMs) * ratio).toLong()
            val distance = target - fromDistance
            val duration = (endTime - fromTime) / 1000.0
            val pace = duration / (distance / 1000.0)
            if (duration >= 5 && pace in 120.0..1800.0) {
                result.add(
                    Split(
                        index = result.size + 1,
                        distanceM = distance,
                        durationSec = duration,
                        paceSecPerKm = pace,
                        avgHr = heart.filter { it.time.toEpochMilli() in fromTime..endTime }.map { it.beatsPerMinute.toDouble() }.averageOrNull(),
                        avgCadence = cadence.filter { it.time.toEpochMilli() in fromTime..endTime }.map { it.rate }.averageOrNull(),
                        partial = partial,
                        startTimeMs = fromTime,
                        endTimeMs = endTime,
                    )
                )
            }
            fromDistance = target
            fromTime = endTime
        }

        var boundary = 1000.0
        while (boundary <= points.last().distanceM) {
            append(boundary, false)
            boundary += 1000.0
        }
        if (points.last().distanceM - fromDistance >= 200) append(points.last().distanceM, true)
        return result
    }

    private suspend fun upload(records: JSONArray): Int = withContext(Dispatchers.IO) {
        val connection = (URL(SYNC_ENDPOINT).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15000
            readTimeout = 30000
            doOutput = true
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
        }
        val body = JSONObject().put("records", records).toString().toByteArray(Charsets.UTF_8)
        connection.outputStream.use { it.write(body) }
        val code = connection.responseCode
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        val response = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        connection.disconnect()
        if (code !in 200..299) throw IllegalStateException("서버 저장에 실패했어요. ($code)")
        JSONObject(response).optInt("count", records.length())
    }

    private fun buildUi() {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(28), dp(28), dp(28), dp(28))
            setBackgroundColor(Color.rgb(10, 10, 18))
        }
        progress = ProgressBar(this).apply { isIndeterminate = true }
        layout.addView(progress, LinearLayout.LayoutParams(dp(44), dp(44)))
        statusText = TextView(this).apply {
            text = "Health Connect에 연결하고 있어요…"
            setTextColor(Color.WHITE)
            textSize = 17f
            gravity = Gravity.CENTER
        }
        layout.addView(statusText, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(20) })
        closeButton = Button(this).apply {
            text = "닫기"
            visibility = Button.GONE
            setOnClickListener { finish() }
        }
        layout.addView(closeButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)).apply { topMargin = dp(22) })
        setContentView(layout)
    }

    private fun setStatus(message: String) {
        statusText.text = message
    }

    private fun showFailure(message: String) {
        progress.visibility = ProgressBar.GONE
        statusText.text = message
        closeButton.visibility = Button.VISIBLE
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}

private data class DistancePoint(val timeMs: Long, val distanceM: Double)

private data class Split(
    val index: Int,
    val distanceM: Double,
    val durationSec: Double,
    val paceSecPerKm: Double,
    val avgHr: Double?,
    val avgCadence: Double?,
    val partial: Boolean,
    val startTimeMs: Long,
    val endTimeMs: Long,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("index", index)
        put("distanceM", distanceM)
        put("durationSec", durationSec)
        put("paceSecPerKm", paceSecPerKm)
        put("partial", partial)
        put("startTimeMs", startTimeMs)
        put("endTimeMs", endTimeMs)
        avgHr?.let { put("avgHr", it) }
        avgCadence?.let { put("avgCadence", it) }
    }
}

private fun List<Double>.averageOrNull(): Double? = if (isEmpty()) null else average()
