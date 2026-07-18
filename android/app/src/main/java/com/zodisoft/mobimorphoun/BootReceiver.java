package com.zodisoft.mobimorphoun;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

/**
 * Starts the WallpaperService when the phone boots up.
 */
public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "BootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            Log.i(TAG, "Boot completed — starting WallpaperService");

            SharedPreferences prefs = context.getSharedPreferences("mobimorphoun_prefs", Context.MODE_PRIVATE);
            int minutes = prefs.getInt("changeMinutes", 30);

            Intent serviceIntent = new Intent(context, WallpaperService.class);
            serviceIntent.putExtra("intervalMinutes", minutes);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        }
    }
}
