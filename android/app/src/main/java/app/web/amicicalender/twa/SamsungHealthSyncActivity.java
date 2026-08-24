package app.web.amicicalender.twa;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/**
 * 웹의 amici://samsung-health/sync 요청을 SDK 구현으로 전달한다.
 * 공식 AAR이 아직 포함되지 않은 개발 빌드는 웹에 sdk-missing 상태를 안전하게 반환한다.
 */
public class SamsungHealthSyncActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            Class<?> implementation = Class.forName(
                    "app.web.amicicalender.twa.shealth.SamsungHealthDataSyncActivity");
            Intent intent = new Intent(this, implementation);
            intent.setData(getIntent().getData());
            startActivity(intent);
            finish();
        } catch (ClassNotFoundException missingSdk) {
            returnToWeb("sdk-missing");
        }
    }

    private void returnToWeb(String result) {
        Uri url = new Uri.Builder()
                .scheme("https")
                .authority("amicicalender.web.app")
                .appendQueryParameter("healthSync", result)
                .build();
        startActivity(new Intent(Intent.ACTION_VIEW, url));
        finish();
    }
}
