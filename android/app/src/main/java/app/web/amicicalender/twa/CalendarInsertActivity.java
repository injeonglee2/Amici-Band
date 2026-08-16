package app.web.amicicalender.twa;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Receives amicicalender://calendar/add links from the TWA, writes the event to a
 * temporary .ics file and opens it with ACTION_VIEW. Any calendar app that reads
 * .ics (Samsung / Google Calendar / TimeTree / Naver …) shows up in the chooser and
 * opens its own "add to calendar" flow.
 */
public class CalendarInsertActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Uri data = getIntent().getData();
        if (data == null) {
            finish();
            return;
        }

        String title = value(data, "title");
        String location = value(data, "location");
        String description = value(data, "description");
        long begin = longValue(data, "begin");
        long end = longValue(data, "end");

        try {
            Uri icsUri = writeIcs(title, location, description, begin, end);
            Intent view = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(icsUri, "text/calendar")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(view, "캘린더 앱 선택")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(chooser);
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "일정을 열 캘린더 앱이 없어요.", Toast.LENGTH_LONG).show();
        } catch (Exception error) {
            Toast.makeText(this, "캘린더 파일을 만들지 못했어요.", Toast.LENGTH_LONG).show();
        } finally {
            finish();
        }
    }

    /** 이벤트를 .ics 로 만들어 캐시에 쓰고 FileProvider content:// URI 를 돌려준다. */
    private Uri writeIcs(String title, String location, String description, long begin, long end)
            throws Exception {
        SimpleDateFormat utc = new SimpleDateFormat("yyyyMMdd'T'HHmmss'Z'", Locale.US);
        utc.setTimeZone(TimeZone.getTimeZone("UTC"));

        StringBuilder ics = new StringBuilder();
        ics.append("BEGIN:VCALENDAR\r\n");
        ics.append("VERSION:2.0\r\n");
        ics.append("PRODID:-//Amici Band//KO\r\n");
        ics.append("CALSCALE:GREGORIAN\r\n");
        ics.append("BEGIN:VEVENT\r\n");
        ics.append("UID:").append(System.currentTimeMillis()).append("@amici-band\r\n");
        ics.append("DTSTAMP:").append(utc.format(new Date())).append("\r\n");
        ics.append("DTSTART:").append(utc.format(new Date(begin))).append("\r\n");
        ics.append("DTEND:").append(utc.format(new Date(end))).append("\r\n");
        ics.append("SUMMARY:").append(escape(title)).append("\r\n");
        if (!location.isEmpty()) {
            ics.append("LOCATION:").append(escape(location)).append("\r\n");
        }
        if (!description.isEmpty()) {
            ics.append("DESCRIPTION:").append(escape(description)).append("\r\n");
        }
        ics.append("END:VEVENT\r\n");
        ics.append("END:VCALENDAR\r\n");

        File dir = new File(getCacheDir(), "calendar");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        File file = new File(dir, "event.ics");
        FileOutputStream out = new FileOutputStream(file);
        try {
            out.write(ics.toString().getBytes(StandardCharsets.UTF_8));
        } finally {
            out.close();
        }
        return FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", file);
    }

    /** iCalendar 특수문자 이스케이프 */
    private static String escape(String value) {
        return value
                .replace("\\", "\\\\")
                .replace(";", "\\;")
                .replace(",", "\\,")
                .replace("\r\n", "\\n")
                .replace("\n", "\\n");
    }

    private static String value(Uri data, String key) {
        String value = data.getQueryParameter(key);
        return value == null ? "" : value;
    }

    private static long longValue(Uri data, String key) {
        try {
            return Long.parseLong(value(data, key));
        } catch (NumberFormatException ignored) {
            return 0L;
        }
    }
}
