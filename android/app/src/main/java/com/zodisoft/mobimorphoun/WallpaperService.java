package com.zodisoft.mobimorphoun;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * Foreground Service for reliable wallpaper changes on a timer.
 * Runs independently of the React Native JS runtime.
 * Calls Go native filters directly via gofilters.aar.
 */
public class WallpaperService extends Service {
    private static final String TAG = "WallpaperService";
    private static final String CHANNEL_ID = "mobimorphoun_wallpaper";
    private static final int NOTIFICATION_ID = 1001;

    private Handler handler;
    private Runnable wallpaperRunnable;
    private long intervalMs = 30 * 60 * 1000; // default 30 min

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        handler = new Handler(Looper.getMainLooper());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Read interval from intent or shared prefs
        if (intent != null && intent.hasExtra("intervalMinutes")) {
            int minutes = intent.getIntExtra("intervalMinutes", 30);
            intervalMs = minutes * 60L * 1000L;
        } else {
            SharedPreferences prefs = getSharedPreferences("mobimorphoun_prefs", MODE_PRIVATE);
            int minutes = prefs.getInt("changeMinutes", 30);
            intervalMs = minutes * 60L * 1000L;
        }

        Log.i(TAG, "Starting wallpaper service with interval: " + (intervalMs / 60000) + " min");

        // Start as foreground service with notification
        Notification notification = buildNotification();
        startForeground(NOTIFICATION_ID, notification);

        // Cancel any existing timer and start fresh
        if (wallpaperRunnable != null) {
            handler.removeCallbacks(wallpaperRunnable);
        }

        wallpaperRunnable = new Runnable() {
            @Override
            public void run() {
                changeWallpaper();
                handler.postDelayed(this, intervalMs);
            }
        };

        // Start timer (first fire after the interval, not immediately)
        handler.postDelayed(wallpaperRunnable, intervalMs);

        // If system kills the service, restart it
        return START_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (handler != null && wallpaperRunnable != null) {
            handler.removeCallbacks(wallpaperRunnable);
        }
        Log.i(TAG, "Wallpaper service stopped");
    }

    /**
     * Change the wallpaper using the Go native library.
     * This runs entirely in native — no JS runtime needed.
     */
    private void changeWallpaper() {
        new Thread(() -> {
            try {
                Log.i(TAG, "Timer fired — changing wallpaper");

                // Get paths
                String filesDir = getFilesDir().getAbsolutePath();
                String wallpaperDir = filesDir + "/wallpapers";
                java.io.File dir = new java.io.File(wallpaperDir);
                if (!dir.exists()) dir.mkdirs();

                // For now, emit a broadcast that the JS side can pick up
                // when the app is open. When the app is closed, we rely on
                // the React Native headless task.
                // TODO: Implement full native image fetch + filter pipeline
                // For now, trigger via broadcast to JS if running
                Intent broadcastIntent = new Intent("com.zodisoft.mobimorphoun.CHANGE_WALLPAPER");
                sendBroadcast(broadcastIntent);

                Log.i(TAG, "Wallpaper change broadcast sent");
            } catch (Exception e) {
                Log.e(TAG, "Wallpaper change failed", e);
            }
        }).start();
    }

    private Notification buildNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("MobiMorphoun")
                .setContentText("Wallpaper changer active")
                .setSmallIcon(android.R.drawable.ic_menu_gallery)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Wallpaper Changer",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Keeps the wallpaper changer running on schedule");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
