package app.web.amicicalender.twa;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.CalendarContract;
import android.widget.Toast;

/**
 * Receives amicicalender://calendar/add links from the TWA and opens the
 * device calendar's native event editor with the Amici event pre-filled.
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

        Intent insert = new Intent(Intent.ACTION_INSERT)
                .setData(CalendarContract.Events.CONTENT_URI)
                .putExtra(CalendarContract.Events.TITLE, title)
                .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, begin)
                .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, end);

        if (!location.isEmpty()) {
            insert.putExtra(CalendarContract.Events.EVENT_LOCATION, location);
        }
        if (!description.isEmpty()) {
            insert.putExtra(CalendarContract.Events.DESCRIPTION, description);
        }

        try {
            startActivity(insert);
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "일정을 추가할 캘린더 앱이 없어요.", Toast.LENGTH_LONG).show();
        } finally {
            finish();
        }
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
