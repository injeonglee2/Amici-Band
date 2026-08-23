package app.web.amicicalender.twa

import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.aggregate.AggregationResult
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.SpeedRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * Health Connect 러닝 데이터 진단 리더.
 * 목적: 이 기기에서 러닝 데이터가 실제로 읽히는지 / 어떤 필드가 채워지는지 확인.
 * 성공하면 다음 단계로 Firestore 동기화를 붙인다. (아직 저장/전송은 하지 않음)
 */
class HealthDiagnosticActivity : ComponentActivity() {

    private lateinit var out: TextView

    private val perms = setOf(
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(SpeedRecord::class),
        HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(StepsRecord::class),
    )

    private val requestPerms =
        registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted ->
            if (granted.containsAll(perms)) read() else log("권한 거부됨. 허용해야 데이터를 읽을 수 있어요.\n허용된 권한: $granted")
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 32)
        }
        val btn = Button(this).apply { text = "Health Connect 러닝 데이터 읽기" }
        out = TextView(this).apply {
            textSize = 12f
            setTextIsSelectable(true)
            text = "버튼을 눌러 최근 30일 러닝 데이터를 확인하세요."
        }
        root.addView(btn)
        root.addView(ScrollView(this).apply { addView(out) })
        setContentView(root)
        btn.setOnClickListener { start() }
    }

    private fun start() {
        out.text = ""
        when (HealthConnectClient.getSdkStatus(this)) {
            HealthConnectClient.SDK_AVAILABLE -> ensurePermissionsThenRead()
            HealthConnectClient.SDK_UNAVAILABLE ->
                log("이 기기에서 Health Connect를 쓸 수 없어요. (Android 8+ 필요)")
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED ->
                log("Health Connect 앱 설치/업데이트가 필요해요. (Play 스토어에서 'Health Connect')")
            else -> log("Health Connect 상태를 확인할 수 없어요.")
        }
    }

    private fun ensurePermissionsThenRead() {
        lifecycleScope.launch {
            try {
                val client = HealthConnectClient.getOrCreate(this@HealthDiagnosticActivity)
                val granted = client.permissionController.getGrantedPermissions()
                if (granted.containsAll(perms)) read() else requestPerms.launch(perms)
            } catch (e: Exception) {
                log("초기화 오류: ${e.message}")
            }
        }
    }

    private fun read() {
        lifecycleScope.launch {
            try {
                val client = HealthConnectClient.getOrCreate(this@HealthDiagnosticActivity)
                val end = Instant.now()
                val start = end.minus(30, ChronoUnit.DAYS)
                val sessions = client.readRecords(
                    ReadRecordsRequest(
                        ExerciseSessionRecord::class,
                        timeRangeFilter = TimeRangeFilter.between(start, end),
                    ),
                ).records
                val runs = sessions.filter {
                    it.exerciseType == ExerciseSessionRecord.EXERCISE_TYPE_RUNNING ||
                        it.exerciseType == ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL
                }
                log("최근 30일 · 전체 운동 세션 ${sessions.size}건 중 러닝 ${runs.size}건\n")
                if (runs.isEmpty()) {
                    log("러닝 세션이 없습니다.\n삼성헬스 → Health Connect '데이터 공유(권한)'가 켜져 있는지,\nHealth Connect 권한 화면에서 이 앱에 운동/거리/심박 읽기를 허용했는지 확인하세요.")
                    return@launch
                }
                for (r in runs) {
                    log("● ${r.startTime}  ~  ${r.endTime}")
                    log("  duration=${ChronoUnit.SECONDS.between(r.startTime, r.endTime)}초  type=${r.exerciseType}  title=${r.title ?: "-"}")
                    val agg: AggregationResult = client.aggregate(
                        AggregateRequest(
                            metrics = setOf(
                                DistanceRecord.DISTANCE_TOTAL,
                                HeartRateRecord.BPM_AVG,
                                HeartRateRecord.BPM_MAX,
                                TotalCaloriesBurnedRecord.ENERGY_TOTAL,
                                StepsRecord.COUNT_TOTAL,
                            ),
                            timeRangeFilter = TimeRangeFilter.between(r.startTime, r.endTime),
                        ),
                    )
                    log("  거리=${agg[DistanceRecord.DISTANCE_TOTAL]?.inMeters} m")
                    log("  심박 평균=${agg[HeartRateRecord.BPM_AVG]}  최대=${agg[HeartRateRecord.BPM_MAX]} bpm")
                    log("  칼로리=${agg[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories} kcal")
                    log("  걸음=${agg[StepsRecord.COUNT_TOTAL]}")

                    // 실시간(구간) 데이터 — 평균이 아닌 원시 샘플. 이게 있으면 러닝 세부의 페이스↔심박 그래프를 그릴 수 있다.
                    val hrRecs = client.readRecords(
                        ReadRecordsRequest(HeartRateRecord::class, TimeRangeFilter.between(r.startTime, r.endTime)),
                    ).records
                    val hrSamples = hrRecs.sumOf { it.samples.size }
                    val spdRecs = client.readRecords(
                        ReadRecordsRequest(SpeedRecord::class, TimeRangeFilter.between(r.startTime, r.endTime)),
                    ).records
                    val spdSamples = spdRecs.sumOf { it.samples.size }
                    log("  ▸ 실시간 심박 샘플=${hrSamples}개  속도(페이스) 샘플=${spdSamples}개")
                    val hrPreview = hrRecs.flatMap { it.samples }.take(3).joinToString(", ") { "${it.beatsPerMinute}bpm" }
                    if (hrPreview.isNotEmpty()) log("  ▸ 심박 예: $hrPreview …")
                    log("")
                }
            } catch (e: Exception) {
                log("읽기 오류: ${e.message}")
            }
        }
    }

    private fun log(s: String) {
        out.append(s + "\n")
    }
}
