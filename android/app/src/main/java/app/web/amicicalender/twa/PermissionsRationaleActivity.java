package app.web.amicicalender.twa;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Health Connect 권한 화면에서 열리는 데이터 이용 안내. */
public class PermissionsRationaleActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER_VERTICAL);
        layout.setPadding(dp(28), dp(28), dp(28), dp(28));
        layout.setBackgroundColor(Color.rgb(10, 10, 18));

        TextView title = new TextView(this);
        title.setText("Health Connect 데이터 이용 안내");
        title.setTextColor(Color.WHITE);
        title.setTextSize(22);
        title.setTypeface(title.getTypeface(), 1);
        layout.addView(title, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView body = new TextView(this);
        body.setText("Amici는 사용자가 직접 동기화를 요청한 경우에만 러닝 운동의 날짜, 거리, 시간, 심박, 케이던스와 1km 구간을 읽습니다.\n\n읽은 정보는 본인의 개인 기록 채널에만 저장되며, 위치 경로와 원본 센서 표본은 서버에 저장하지 않습니다. 언제든 Health Connect 설정에서 Amici의 접근 권한을 해제할 수 있습니다.");
        body.setTextColor(Color.rgb(205, 205, 218));
        body.setTextSize(16);
        body.setLineSpacing(0, 1.35f);
        LinearLayout.LayoutParams bodyParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bodyParams.topMargin = dp(20);
        layout.addView(body, bodyParams);
        setContentView(layout);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
