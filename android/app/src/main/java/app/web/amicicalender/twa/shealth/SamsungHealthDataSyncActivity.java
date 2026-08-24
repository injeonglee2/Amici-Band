package app.web.amicicalender.twa.shealth;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Looper;

import com.google.gson.Gson;
import com.samsung.android.sdk.health.data.HealthDataService;
import com.samsung.android.sdk.health.data.HealthDataStore;
import com.samsung.android.sdk.health.data.data.HealthDataPoint;
import com.samsung.android.sdk.health.data.data.entries.ExerciseSession;
import com.samsung.android.sdk.health.data.error.ResolvablePlatformException;
import com.samsung.android.sdk.health.data.permission.AccessType;
import com.samsung.android.sdk.health.data.permission.Permission;
import com.samsung.android.sdk.health.data.request.DataType;
import com.samsung.android.sdk.health.data.request.DataTypes;
import com.samsung.android.sdk.health.data.request.LocalTimeFilter;
import com.samsung.android.sdk.health.data.request.Ordering;
import com.samsung.android.sdk.health.data.request.ReadDataRequest;
import com.samsung.android.sdk.health.data.response.DataResponse;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Reads Samsung Health exercise sessions and sends normalized running summaries to Amici. */
public final class SamsungHealthDataSyncActivity extends Activity {
    private static final int PAGE_SIZE = 100;
    private static final long EARLIEST_SYNC_TIME = 946684800000L; // 2000-01-01T00:00:00Z

    private HealthDataStore store;
    private String token;
    private String uploadUrl;
    private long startTime;
    private long endTime;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Uri request = getIntent().getData();
        token = request == null ? null : request.getQueryParameter("token");
        uploadUrl = request == null ? null : request.getQueryParameter("uploadUrl");
        startTime = boundedTime(request == null ? null : request.getQueryParameter("startTime"), EARLIEST_SYNC_TIME);
        endTime = boundedTime(request == null ? null : request.getQueryParameter("endTime"), System.currentTimeMillis());
        if (token == null || token.isEmpty() || !isAllowedUploadUrl(uploadUrl) || endTime <= startTime) {
            returnToWeb("invalid-request");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            returnToWeb("unsupported-android");
            return;
        }

        try {
            store = HealthDataService.getStore(getApplicationContext());
            ensureExercisePermission();
        } catch (Throwable error) {
            handleSdkError(error);
        }
    }

    private void ensureExercisePermission() {
        Set<Permission> required = Collections.singleton(
                Permission.of(DataTypes.EXERCISE, AccessType.READ));
        store.getGrantedPermissionsAsync(required).setCallback(
                Looper.getMainLooper(),
                granted -> {
                    if (granted.containsAll(required)) readRuns();
                    else requestExercisePermission(required);
                },
                this::handleSdkError);
    }

    private void requestExercisePermission(Set<Permission> required) {
        store.requestPermissionsAsync(required, this).setCallback(
                Looper.getMainLooper(),
                granted -> {
                    if (granted.containsAll(required)) readRuns();
                    else returnToWeb("permission-denied");
                },
                this::handleSdkError);
    }

    private void readRuns() {
        readPage(null, 0);
    }

    private void readPage(String pageToken, int importedSoFar) {
        ZoneId zone = ZoneId.systemDefault();
        LocalDateTime start = LocalDateTime.ofInstant(Instant.ofEpochMilli(startTime), zone);
        LocalDateTime end = LocalDateTime.ofInstant(Instant.ofEpochMilli(endTime), zone);
        ReadDataRequest.DualTimeBuilder<HealthDataPoint> builder = DataTypes.EXERCISE
                .getReadDataRequestBuilder()
                .setLocalTimeFilter(LocalTimeFilter.of(start, end))
                .setOrdering(Ordering.DESC)
                .setPageSize(PAGE_SIZE);
        if (pageToken != null && !pageToken.isEmpty()) builder.setPageToken(pageToken);
        ReadDataRequest<HealthDataPoint> request = builder.build();
        store.readDataAsync(request).setCallback(
                Looper.getMainLooper(),
                response -> uploadPage(response, importedSoFar),
                this::handleSdkError);
    }

    private void uploadPage(DataResponse<HealthDataPoint> response, int importedSoFar) {
        List<Map<String, Object>> runs = new ArrayList<>();
        for (HealthDataPoint point : response.getDataList()) {
            List<ExerciseSession> sessions = point.getValue(DataType.ExerciseType.SESSIONS);
            if (sessions == null) continue;
            for (int index = 0; index < sessions.size() && runs.size() < PAGE_SIZE; index++) {
                ExerciseSession session = sessions.get(index);
                if (!isRunning(session.getExerciseType())) continue;
                runs.add(normalize(point, session, index));
            }
            if (runs.size() >= PAGE_SIZE) break;
        }

        String nextPageToken = response.getPageToken();
        boolean complete = nextPageToken == null || nextPageToken.isEmpty();
        Map<String, Object> payload = new HashMap<>();
        payload.put("token", token);
        payload.put("runs", runs);
        payload.put("complete", complete);
        new Thread(() -> {
            if (!postPayload(payload)) {
                returnToWeb("upload-failed");
                return;
            }
            int imported = importedSoFar + runs.size();
            if (complete) returnToWeb("success", imported);
            else runOnUiThread(() -> readPage(nextPageToken, imported));
        }).start();
    }

    private boolean isRunning(DataType.ExerciseType.PredefinedExerciseType type) {
        return type == DataType.ExerciseType.PredefinedExerciseType.RUNNING
                || type == DataType.ExerciseType.PredefinedExerciseType.TRACK_RUNNING
                || type == DataType.ExerciseType.PredefinedExerciseType.TREADMILL;
    }

    private Map<String, Object> normalize(HealthDataPoint point, ExerciseSession session, int index) {
        Map<String, Object> run = new HashMap<>();
        String sourceId = point.getUid() + ":" + index + ":" + session.getStartTime().toEpochMilli();
        run.put("sourceId", sourceId);
        run.put("startTime", session.getStartTime().toEpochMilli());
        run.put("endTime", session.getEndTime().toEpochMilli());
        run.put("durationSec", session.getDuration().getSeconds());
        put(run, "title", session.getCustomTitle());
        put(run, "distanceM", session.getDistance());
        run.put("calories", session.getCalories());
        put(run, "avgHr", session.getMeanHeartRate());
        put(run, "maxHr", session.getMaxHeartRate());
        put(run, "avgCadence", session.getMeanCadence());
        put(run, "maxCadence", session.getMaxCadence());
        put(run, "altitudeGain", session.getAltitudeGain());
        put(run, "vo2Max", session.getVo2Max());
        return run;
    }

    private boolean postPayload(Map<String, Object> payload) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(uploadUrl).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(30_000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            byte[] body = new Gson().toJson(payload).getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(body.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body);
            }
            int status = connection.getResponseCode();
            consume(status >= 400 ? connection.getErrorStream() : connection.getInputStream());
            return status >= 200 && status < 300;
        } catch (Exception error) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void handleSdkError(Throwable error) {
        if (error instanceof ResolvablePlatformException) {
            ResolvablePlatformException resolvable = (ResolvablePlatformException) error;
            if (resolvable.getHasResolution()) {
                try {
                    resolvable.resolve(this);
                    return;
                } catch (Throwable ignored) {
                    // Fall through to a web-visible error if Samsung Health cannot resolve it.
                }
            }
        }
        returnToWeb("sdk-error");
    }

    private void returnToWeb(String result) {
        returnToWeb(result, -1);
    }

    private void returnToWeb(String result, int imported) {
        runOnUiThread(() -> {
            if (isFinishing()) return;
            Uri.Builder builder = new Uri.Builder()
                    .scheme("https")
                    .authority("amicicalender.web.app")
                    .appendQueryParameter("healthSync", result);
            if (imported >= 0) builder.appendQueryParameter("healthImported", String.valueOf(imported));
            Uri url = builder.build();
            startActivity(new Intent(Intent.ACTION_VIEW, url));
            finish();
        });
    }

    private static long boundedTime(String raw, long fallback) {
        try {
            long value = Long.parseLong(raw);
            return Math.max(EARLIEST_SYNC_TIME, Math.min(System.currentTimeMillis() + 86400000L, value));
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private static boolean isAllowedUploadUrl(String value) {
        if (value == null) return false;
        Uri uri = Uri.parse(value);
        return "https".equals(uri.getScheme())
                && "asia-northeast3-amicicalender.cloudfunctions.net".equals(uri.getHost())
                && "/uploadSamsungHealthRuns".equals(uri.getPath());
    }

    private static void put(Map<String, Object> target, String key, Object value) {
        if (value != null) target.put(key, value);
    }

    private static void consume(InputStream stream) {
        if (stream == null) return;
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            while (reader.readLine() != null) { /* drain */ }
        } catch (Exception ignored) {
            // The HTTP status remains authoritative; response text is not needed by the app.
        }
    }
}
