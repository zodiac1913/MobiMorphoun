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
import android.os.HandlerThread;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

import gofilters.Gofilters;

/**
 * Foreground Service — single source of truth for wallpaper changes.
 * Handles timer-based changes AND manual "Next" triggers.
 * Writes history to a JSON file that the JS UI reads for display.
 */
public class WallpaperService extends Service {
    private static final String TAG = "MobiWallpaper";
    private static final String CHANNEL_ID = "mobimorphoun_wallpaper";
    private static final int NOTIFICATION_ID = 1001;
    public static final String ACTION_CHANGE_NOW = "com.zodisoft.mobimorphoun.CHANGE_NOW";

    private Handler handler;
    private HandlerThread handlerThread;
    private Runnable timerRunnable;
    private long intervalMs = 5 * 60 * 1000;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        handlerThread = new HandlerThread("WallpaperTimer");
        handlerThread.start();
        handler = new Handler(handlerThread.getLooper());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences prefs = getSharedPreferences("mobimorphoun_prefs", MODE_PRIVATE);

        // Check if this is a "change now" trigger
        if (intent != null && ACTION_CHANGE_NOW.equals(intent.getAction())) {
            Log.i(TAG, "Manual change triggered");
            handler.post(this::doChangeWallpaper);
            return START_STICKY;
        }

        // Read interval
        if (intent != null && intent.hasExtra("intervalMinutes")) {
            int minutes = intent.getIntExtra("intervalMinutes", 5);
            intervalMs = minutes * 60L * 1000L;
            prefs.edit().putInt("changeMinutes", minutes).apply();
        } else {
            int minutes = prefs.getInt("changeMinutes", 5);
            intervalMs = minutes * 60L * 1000L;
        }

        Log.i(TAG, "Service starting: interval=" + (intervalMs / 60000) + "min");

        startForeground(NOTIFICATION_ID, buildNotification("Active"));

        // Setup timer
        if (timerRunnable != null) {
            handler.removeCallbacks(timerRunnable);
        }
        timerRunnable = new Runnable() {
            @Override
            public void run() {
                doChangeWallpaper();
                handler.postDelayed(this, intervalMs);
            }
        };
        handler.postDelayed(timerRunnable, intervalMs);

        return START_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (handler != null && timerRunnable != null) handler.removeCallbacks(timerRunnable);
        if (handlerThread != null) handlerThread.quitSafely();
        Log.i(TAG, "Service stopped");
    }

    /**
     * The single wallpaper change pipeline.
     * Fetch → Filter (Go) → Set wallpaper → Save to history file.
     */
    private void doChangeWallpaper() {
        try {
            Log.i(TAG, "Changing wallpaper...");

            if (!isNetworkAvailable()) {
                Log.w(TAG, "No network — skipping");
                updateNotification("Skipped — no network");
                return;
            }

            String wallpaperDir = getFilesDir().getAbsolutePath() + "/wallpapers";
            new File(wallpaperDir).mkdirs();

            // 1. Fetch image
            String originalPath = fetchImage(wallpaperDir);
            if (originalPath == null) {
                Log.e(TAG, "Fetch failed");
                return;
            }

            // 2. Pick and apply filter via Go
            String[] filters = {"Original", "Original", "Original",
                    "BlurSoft", "BlurHard", "Pixelate",
                    "Monochrome", "Cartoon", "Wavy", "Vortex", "Mosaic", "Oilify"};
            String filterName = filters[(int)(Math.random() * filters.length)];
            String filteredPath = originalPath;

            if (!filterName.equals("Original")) {
                try {
                    int sw = getResources().getDisplayMetrics().widthPixels;
                    int sh = getResources().getDisplayMetrics().heightPixels;
                    filteredPath = Gofilters.applyFilter(originalPath, wallpaperDir, filterName, 0, sw, sh);
                } catch (Exception e) {
                    Log.w(TAG, "Filter failed: " + e.getMessage());
                    filteredPath = originalPath;
                    filterName = "Original";
                }
            }

            // 3. Set as wallpaper
            Bitmap bmp = BitmapFactory.decodeFile(filteredPath);
            if (bmp == null) { Log.e(TAG, "Decode failed"); return; }

            WallpaperManager.getInstance(this).setBitmap(bmp, null, true,
                    WallpaperManager.FLAG_SYSTEM | WallpaperManager.FLAG_LOCK);
            bmp.recycle();

            // 4. Save to history JSON (JS reads this)
            saveToHistory(filteredPath, originalPath, filterName, "PicSum");

            Log.i(TAG, "Done: " + filterName);
            updateNotification("Last: " + filterName);

        } catch (Exception e) {
            Log.e(TAG, "Change failed", e);
        }
    }

    /**
     * Save wallpaper info to a JSON file the JS UI reads.
     * Maintains history of last 5 entries.
     */
    private void saveToHistory(String filteredPath, String originalPath, String filter, String source) {
        try {
            long now = System.currentTimeMillis();
            String entry = "{\"saveName\":\"" + filteredPath + "\""
                    + ",\"originalLocalUri\":\"" + originalPath + "\""
                    + ",\"filter\":\"" + filter + "\""
                    + ",\"source\":\"" + source + "\""
                    + ",\"timestamp\":" + now + "}";

            // Read existing history
            File histFile = new File(getFilesDir(), "wallpaper_history.json");
            Log.i(TAG, "History file path: " + histFile.getAbsolutePath());

            String history = "[]";
            if (histFile.exists()) {
                FileInputStream fis = new FileInputStream(histFile);
                byte[] data = new byte[(int) histFile.length()];
                fis.read(data);
                fis.close();
                history = new String(data).trim();
                if (history.isEmpty()) history = "[]";
            }

            // Prepend new entry
            if (history.equals("[]")) {
                history = "[" + entry + "]";
            } else {
                history = "[" + entry + "," + history.substring(1);
            }

            // Keep only 5 entries
            int depth = 0;
            int count = 0;
            int cutAt = -1;
            for (int i = 0; i < history.length(); i++) {
                char c = history.charAt(i);
                if (c == '{') { depth++; if (depth == 1) count++; }
                if (c == '}') depth--;
                if (count > 5 && depth == 0) { cutAt = i + 1; break; }
            }
            if (cutAt > 0 && cutAt < history.length()) {
                history = history.substring(0, cutAt) + "]";
            }

            // Write
            FileOutputStream fos = new FileOutputStream(histFile);
            fos.write(history.getBytes());
            fos.close();

            Log.i(TAG, "History saved: " + count + " entries, file size=" + histFile.length());

        } catch (Exception e) {
            Log.e(TAG, "Save history failed", e);
        }
    }

    private String fetchImage(String outputDir) {
        try {
            String url = "https://picsum.photos/1080/1920?random=" + System.currentTimeMillis();
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.connect();

            if (conn.getResponseCode() != 200) return null;

            String filename = "wp_" + System.currentTimeMillis() + ".jpg";
            File out = new File(outputDir, filename);
            InputStream in = conn.getInputStream();
            FileOutputStream fos = new FileOutputStream(out);
            byte[] buf = new byte[8192];
            int len;
            while ((len = in.read(buf)) != -1) fos.write(buf, 0, len);
            fos.close();
            in.close();
            conn.disconnect();
            return out.getAbsolutePath();
        } catch (Exception e) {
            Log.e(TAG, "Fetch failed", e);
            return null;
        }
    }

    private boolean isNetworkAvailable() {
        android.net.ConnectivityManager cm =
                (android.net.ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        android.net.NetworkInfo info = cm.getActiveNetworkInfo();
        return info != null && info.isConnectedOrConnecting();
    }

    private void cleanupOldFiles(File dir) {
        File[] files = dir.listFiles((d, name) -> name.startsWith("wp_"));
        if (files != null && files.length > 10) {
            java.util.Arrays.sort(files);
            for (int i = 0; i < files.length - 10; i++) files[i].delete();
        }
    }

    private Notification buildNotification(String text) {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("MobiMorphoun")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_menu_gallery)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .build();
    }

    private void updateNotification(String text) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(NOTIFICATION_ID, buildNotification(text));
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "Wallpaper Changer", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Keeps wallpaper changer running");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }
}
