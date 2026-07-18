package com.zodisoft.mobimorphoun;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.app.WallpaperManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

import gofilters.Gofilters;

/**
 * Foreground Service for reliable wallpaper changes.
 * Fetches images, applies Go filters, renders quotes, and sets wallpaper
 * entirely in native code — no JS runtime required.
 */
public class WallpaperService extends Service {
    private static final String TAG = "WallpaperService";
    private static final String CHANNEL_ID = "mobimorphoun_wallpaper";
    private static final int NOTIFICATION_ID = 1001;

    private Handler handler;
    private Runnable wallpaperRunnable;
    private long intervalMs = 30 * 60 * 1000;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        handler = new Handler(Looper.getMainLooper());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences prefs = getSharedPreferences("mobimorphoun_prefs", MODE_PRIVATE);

        if (intent != null && intent.hasExtra("intervalMinutes")) {
            int minutes = intent.getIntExtra("intervalMinutes", 30);
            intervalMs = minutes * 60L * 1000L;
            prefs.edit().putInt("changeMinutes", minutes).apply();
        } else {
            int minutes = prefs.getInt("changeMinutes", 30);
            intervalMs = minutes * 60L * 1000L;
        }

        Log.i(TAG, "Service starting: interval=" + (intervalMs / 60000) + "min");

        Notification notification = buildNotification();
        startForeground(NOTIFICATION_ID, notification);

        // Cancel existing timer
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

        // First fire after interval
        handler.postDelayed(wallpaperRunnable, intervalMs);
        prefs.edit().putBoolean("serviceRunning", true).apply();

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
        SharedPreferences prefs = getSharedPreferences("mobimorphoun_prefs", MODE_PRIVATE);
        prefs.edit().putBoolean("serviceRunning", false).apply();
        Log.i(TAG, "Service stopped");
    }

    /**
     * Full wallpaper change pipeline — runs entirely in native.
     * 1. Fetch random image from PicSum (reliable, always available)
     * 2. Apply random Go filter
     * 3. Set as wallpaper via WallpaperManager
     */
    private void changeWallpaper() {
        new Thread(() -> {
            try {
                Log.i(TAG, "Changing wallpaper...");
                String wallpaperDir = getFilesDir().getAbsolutePath() + "/wallpapers";
                File dir = new File(wallpaperDir);
                if (!dir.exists()) dir.mkdirs();

                // Step 1: Fetch a random image from PicSum
                String imagePath = fetchPicSumImage(wallpaperDir);
                if (imagePath == null) {
                    Log.e(TAG, "Failed to fetch image");
                    return;
                }

                // Step 2: Pick a random filter and apply via Go
                String[] filters = {"Original", "BlurSoft", "BlurHard", "Pixelate",
                        "Monochrome", "Cartoon", "Wavy", "Vortex", "Mosaic", "Oilify"};
                String filter = filters[(int) (Math.random() * filters.length)];

                String filteredPath = imagePath;
                if (!filter.equals("Original")) {
                    try {
                        // Get screen dimensions
                        int screenW = getResources().getDisplayMetrics().widthPixels;
                        int screenH = getResources().getDisplayMetrics().heightPixels;
                        filteredPath = Gofilters.applyFilter(
                                imagePath, wallpaperDir, filter, 0, screenW, screenH);
                    } catch (Exception e) {
                        Log.w(TAG, "Filter failed, using original: " + e.getMessage());
                    }
                }

                // Step 3: Set as wallpaper
                Bitmap bitmap = BitmapFactory.decodeFile(filteredPath);
                if (bitmap == null) {
                    Log.e(TAG, "Failed to decode filtered image");
                    return;
                }

                WallpaperManager wm = WallpaperManager.getInstance(this);
                wm.setBitmap(bitmap, null, true,
                        WallpaperManager.FLAG_SYSTEM | WallpaperManager.FLAG_LOCK);
                bitmap.recycle();

                Log.i(TAG, "Wallpaper changed: filter=" + filter);

                // Cleanup old files (keep last 5)
                cleanupOldFiles(dir);

            } catch (Exception e) {
                Log.e(TAG, "Wallpaper change failed", e);
            }
        }).start();
    }

    /**
     * Download a random image from PicSum
     */
    private String fetchPicSumImage(String outputDir) {
        try {
            String imageUrl = "https://picsum.photos/1080/1920?random=" + System.currentTimeMillis();
            URL url = new URL(imageUrl);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.connect();

            if (conn.getResponseCode() != 200) {
                Log.e(TAG, "PicSum HTTP " + conn.getResponseCode());
                return null;
            }

            String filename = "service_" + System.currentTimeMillis() + ".jpg";
            File outputFile = new File(outputDir, filename);
            InputStream in = conn.getInputStream();
            FileOutputStream out = new FileOutputStream(outputFile);
            byte[] buffer = new byte[8192];
            int len;
            while ((len = in.read(buffer)) != -1) {
                out.write(buffer, 0, len);
            }
            out.close();
            in.close();
            conn.disconnect();

            return outputFile.getAbsolutePath();
        } catch (Exception e) {
            Log.e(TAG, "Image fetch failed", e);
            return null;
        }
    }

    private void cleanupOldFiles(File dir) {
        File[] files = dir.listFiles((d, name) -> name.startsWith("service_"));
        if (files != null && files.length > 5) {
            java.util.Arrays.sort(files);
            for (int i = 0; i < files.length - 5; i++) {
                files[i].delete();
            }
        }
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
            channel.setDescription("Keeps the wallpaper changer running");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
