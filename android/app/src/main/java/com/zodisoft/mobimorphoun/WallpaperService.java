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
    private Runnable picTimerRunnable;
    private Runnable quoteTimerRunnable;
    private long picIntervalMs = 5 * 60 * 1000;
    private long quoteIntervalMs = 2 * 60 * 1000;
    private String currentFilteredPath = null; // Stable filtered image for quote re-renders

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

        // Read intervals
        if (intent != null && intent.hasExtra("intervalMinutes")) {
            int picMin = intent.getIntExtra("intervalMinutes", 5);
            int quoteMin = intent.getIntExtra("quoteIntervalMinutes", 2);
            picIntervalMs = picMin * 60L * 1000L;
            quoteIntervalMs = quoteMin * 60L * 1000L;
            prefs.edit()
                .putInt("changeMinutes", picMin)
                .putInt("quoteChangeMinutes", quoteMin)
                .apply();
        } else {
            int picMin = prefs.getInt("changeMinutes", 5);
            int quoteMin = prefs.getInt("quoteChangeMinutes", 2);
            picIntervalMs = picMin * 60L * 1000L;
            quoteIntervalMs = quoteMin * 60L * 1000L;
        }

        Log.i(TAG, "Service starting: pic=" + (picIntervalMs / 60000) + "min, quote=" + (quoteIntervalMs / 60000) + "min");

        startForeground(NOTIFICATION_ID, buildNotification("Active"));

        // Setup pic timer (new image + filter + quote)
        if (picTimerRunnable != null) handler.removeCallbacks(picTimerRunnable);
        picTimerRunnable = new Runnable() {
            @Override
            public void run() {
                doChangeWallpaper();
                handler.postDelayed(this, picIntervalMs);
            }
        };
        handler.postDelayed(picTimerRunnable, picIntervalMs);

        // Setup quote timer (same image, new quote)
        if (quoteTimerRunnable != null) handler.removeCallbacks(quoteTimerRunnable);
        quoteTimerRunnable = new Runnable() {
            @Override
            public void run() {
                doChangeQuoteOnly();
                handler.postDelayed(this, quoteIntervalMs);
            }
        };
        handler.postDelayed(quoteTimerRunnable, quoteIntervalMs);

        return START_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (handler != null) {
            if (picTimerRunnable != null) handler.removeCallbacks(picTimerRunnable);
            if (quoteTimerRunnable != null) handler.removeCallbacks(quoteTimerRunnable);
        }
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

            // 3. Save filtered image as stable file for quote re-renders
            String stableFiltered = wallpaperDir + "/currentFiltered.jpg";
            copyFile(filteredPath, stableFiltered);
            currentFilteredPath = stableFiltered;

            // 4. Render quote onto image via Go
            String finalPath = filteredPath;
            try {
                String fontPath = "/system/fonts/Roboto-Regular.ttf";
                int sw = getResources().getDisplayMetrics().widthPixels;
                // Pick a random quote from bundled stoic/kennedy set
                String[] quotes = {
                    "The happiness of your life depends upon the quality of your thoughts.|Marcus Aurelius",
                    "We suffer more often in imagination than in reality.|Seneca",
                    "Waste no more time arguing about what a good man should be. Be one.|Marcus Aurelius",
                    "Washington could mess up a one-car parade.|Sen. John Kennedy",
                    "The short answer is no. The long answer is hell no.|Sen. John Kennedy",
                    "Our federal government has become a dumpster fire the size of a shopping mall.|Sen. John Kennedy",
                    "Quit spending money we do not have on crap we do not need.|Sen. John Kennedy",
                    "You have power over your mind, not outside events.|Marcus Aurelius",
                    "It is not that we have a short time to live, but that we waste a great deal of it.|Seneca",
                    "The best social program is a job.|Sen. John Kennedy",
                    "Difficulties strengthen the mind, as labor does the body.|Seneca",
                    "Those people are goofier than a football bat.|Sen. John Kennedy",
                    "First say to yourself what you would be; and then do what you have to do.|Epictetus",
                    "I believe love is the answer but I also believe owning a handgun just in case is a good idea.|Sen. John Kennedy",
                    "Very little is needed to make a happy life; it is all within yourself.|Marcus Aurelius"
                };
                String picked = quotes[(int)(Math.random() * quotes.length)];
                String[] parts = picked.split("\\|");
                String statement = parts[0];
                String author = parts.length > 1 ? parts[1] : "";

                finalPath = Gofilters.renderQuote(
                        filteredPath, wallpaperDir, fontPath,
                        statement, author, "center",
                        0, 28, "#FFFFFF", "#000000",
                        200, 200, sw);
                Log.i(TAG, "Quote rendered: " + author);
            } catch (Exception e) {
                Log.w(TAG, "Quote render failed, using filtered only: " + e.getMessage());
                finalPath = filteredPath;
            }

            // 5. Set as wallpaper
            Bitmap bmp = BitmapFactory.decodeFile(finalPath);
            if (bmp == null) { Log.e(TAG, "Decode failed"); return; }

            WallpaperManager.getInstance(this).setBitmap(bmp, null, true,
                    WallpaperManager.FLAG_SYSTEM | WallpaperManager.FLAG_LOCK);
            bmp.recycle();

            // 4. Save to history JSON (JS reads this)
            saveToHistory(finalPath, originalPath, filterName, "PicSum");

            Log.i(TAG, "Done: " + filterName);
            updateNotification("Last: " + filterName);

        } catch (Exception e) {
            Log.e(TAG, "Change failed", e);
        }
    }

    /**
     * Quote-only change — re-renders the current filtered image with a new quote.
     */
    private void doChangeQuoteOnly() {
        try {
            if (currentFilteredPath == null || !new File(currentFilteredPath).exists()) {
                Log.i(TAG, "No filtered image yet, skipping quote-only change");
                return;
            }

            Log.i(TAG, "Changing quote only...");
            String wallpaperDir = getFilesDir().getAbsolutePath() + "/wallpapers";
            int sw = getResources().getDisplayMetrics().widthPixels;

            String finalPath = currentFilteredPath;
            try {
                String fontPath = "/system/fonts/Roboto-Regular.ttf";
                String[] quotes = {
                    "The happiness of your life depends upon the quality of your thoughts.|Marcus Aurelius",
                    "We suffer more often in imagination than in reality.|Seneca",
                    "Washington could mess up a one-car parade.|Sen. John Kennedy",
                    "The short answer is no. The long answer is hell no.|Sen. John Kennedy",
                    "Our federal government has become a dumpster fire the size of a shopping mall.|Sen. John Kennedy",
                    "Quit spending money we do not have on crap we do not need.|Sen. John Kennedy",
                    "You have power over your mind, not outside events.|Marcus Aurelius",
                    "Difficulties strengthen the mind, as labor does the body.|Seneca",
                    "Those people are goofier than a football bat.|Sen. John Kennedy",
                    "First say to yourself what you would be; and then do what you have to do.|Epictetus",
                    "Very little is needed to make a happy life; it is all within yourself.|Marcus Aurelius",
                    "I believe love is the answer but I also believe owning a handgun just in case is a good idea.|Sen. John Kennedy"
                };
                String picked = quotes[(int)(Math.random() * quotes.length)];
                String[] parts = picked.split("\\|");
                String statement = parts[0];
                String author = parts.length > 1 ? parts[1] : "";

                finalPath = Gofilters.renderQuote(
                        currentFilteredPath, wallpaperDir, fontPath,
                        statement, author, "center",
                        0, 28, "#FFFFFF", "#000000",
                        200, 200, sw);
            } catch (Exception e) {
                Log.w(TAG, "Quote render failed: " + e.getMessage());
                return;
            }

            Bitmap bmp = BitmapFactory.decodeFile(finalPath);
            if (bmp == null) return;

            WallpaperManager.getInstance(this).setBitmap(bmp, null, true,
                    WallpaperManager.FLAG_SYSTEM | WallpaperManager.FLAG_LOCK);
            bmp.recycle();

            saveToHistory(finalPath, currentFilteredPath, "QuoteChange", "PicSum");
            Log.i(TAG, "Quote changed");
            updateNotification("Quote updated");
        } catch (Exception e) {
            Log.e(TAG, "Quote-only change failed", e);
        }
    }

    private void copyFile(String src, String dst) {
        try {
            FileInputStream fis = new FileInputStream(src);
            FileOutputStream fos = new FileOutputStream(dst);
            byte[] buf = new byte[8192];
            int len;
            while ((len = fis.read(buf)) != -1) fos.write(buf, 0, len);
            fos.close();
            fis.close();
        } catch (Exception e) {
            Log.w(TAG, "Copy failed: " + e.getMessage());
        }
    }

    private static final int MAX_HISTORY = 8;

    /**
     * Save wallpaper info to a JSON file the JS UI reads.
     * Maintains history of last 8 entries.
     * Copies rendered + original images to a dedicated history/ directory
     * with stable numbered filenames (rendered_0.jpg, original_0.jpg, etc.)
     * so the UI can reliably display them.
     */
    private void saveToHistory(String filteredPath, String originalPath, String filter, String source) {
        try {
            // Ensure history directory exists
            String historyDir = getFilesDir().getAbsolutePath() + "/history";
            new File(historyDir).mkdirs();

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

            // Parse existing entries to shift slots
            // We shift all existing images down by one slot (0→1, 1→2, etc.)
            // and delete slot MAX_HISTORY-1 if it exists (the oldest)
            // First, delete the oldest slot's files if they exist (slot MAX_HISTORY-1)
            File oldRendered = new File(historyDir, "rendered_" + (MAX_HISTORY - 1) + ".jpg");
            File oldOriginal = new File(historyDir, "original_" + (MAX_HISTORY - 1) + ".jpg");
            if (oldRendered.exists()) oldRendered.delete();
            if (oldOriginal.exists()) oldOriginal.delete();

            // Shift all files down: slot N becomes slot N+1 (from end to start)
            for (int i = MAX_HISTORY - 2; i >= 0; i--) {
                File srcRendered = new File(historyDir, "rendered_" + i + ".jpg");
                File srcOriginal = new File(historyDir, "original_" + i + ".jpg");
                File dstRendered = new File(historyDir, "rendered_" + (i + 1) + ".jpg");
                File dstOriginal = new File(historyDir, "original_" + (i + 1) + ".jpg");
                if (srcRendered.exists()) srcRendered.renameTo(dstRendered);
                if (srcOriginal.exists()) srcOriginal.renameTo(dstOriginal);
            }

            // Copy new images into slot 0
            String renderedDest = historyDir + "/rendered_0.jpg";
            String originalDest = historyDir + "/original_0.jpg";
            copyFile(filteredPath, renderedDest);
            copyFile(originalPath, originalDest);

            // Build new history entry pointing to the stable history files
            long now = System.currentTimeMillis();
            String entry = "{\"saveName\":\"" + renderedDest + "\""
                    + ",\"originalLocalUri\":\"" + originalDest + "\""
                    + ",\"filter\":\"" + filter + "\""
                    + ",\"source\":\"" + source + "\""
                    + ",\"timestamp\":" + now + "}";

            // Prepend new entry
            if (history.equals("[]")) {
                history = "[" + entry + "]";
            } else {
                history = "[" + entry + "," + history.substring(1);
            }

            // Keep only MAX_HISTORY entries
            int depth = 0;
            int count = 0;
            int cutAt = -1;
            for (int i = 0; i < history.length(); i++) {
                char c = history.charAt(i);
                if (c == '{') { depth++; if (depth == 1) count++; }
                if (c == '}') depth--;
                if (count > MAX_HISTORY && depth == 0) { cutAt = i + 1; break; }
            }
            if (cutAt > 0 && cutAt < history.length()) {
                history = history.substring(0, cutAt) + "]";
            }

            // Also update the saveName/originalLocalUri of existing entries
            // to reflect their shifted slot positions
            // We rebuild the JSON to ensure paths match the shifted files
            history = rebuildHistoryPaths(history, historyDir);

            // Write
            FileOutputStream fos = new FileOutputStream(histFile);
            fos.write(history.getBytes());
            fos.close();

            Log.i(TAG, "History saved: " + count + " entries, file size=" + histFile.length());

        } catch (Exception e) {
            Log.e(TAG, "Save history failed", e);
        }
    }

    /**
     * Rebuild history JSON so each entry's saveName/originalLocalUri points
     * to the correct numbered slot in the history directory.
     */
    private String rebuildHistoryPaths(String historyJson, String historyDir) {
        try {
            // Simple approach: parse entries, reassign paths by index
            StringBuilder result = new StringBuilder("[");
            int entryIndex = 0;
            int depth = 0;
            int entryStart = -1;

            for (int i = 0; i < historyJson.length(); i++) {
                char c = historyJson.charAt(i);
                if (c == '{') {
                    depth++;
                    if (depth == 1) entryStart = i;
                }
                if (c == '}') {
                    depth--;
                    if (depth == 0 && entryStart >= 0) {
                        String entryStr = historyJson.substring(entryStart, i + 1);
                        // Extract filter, source, timestamp from original entry
                        String filter = extractJsonValue(entryStr, "filter");
                        String source = extractJsonValue(entryStr, "source");
                        String timestamp = extractJsonValue(entryStr, "timestamp");

                        String renderedPath = historyDir + "/rendered_" + entryIndex + ".jpg";
                        String originalPath = historyDir + "/original_" + entryIndex + ".jpg";

                        if (entryIndex > 0) result.append(",");
                        result.append("{\"saveName\":\"").append(renderedPath).append("\"");
                        result.append(",\"originalLocalUri\":\"").append(originalPath).append("\"");
                        result.append(",\"filter\":\"").append(filter).append("\"");
                        result.append(",\"source\":\"").append(source).append("\"");
                        result.append(",\"timestamp\":").append(timestamp).append("}");

                        entryIndex++;
                        entryStart = -1;
                    }
                }
            }
            result.append("]");
            return result.toString();
        } catch (Exception e) {
            Log.w(TAG, "rebuildHistoryPaths failed, using original: " + e.getMessage());
            return historyJson;
        }
    }

    /**
     * Extract a value from a simple flat JSON object string.
     */
    private String extractJsonValue(String json, String key) {
        String searchKey = "\"" + key + "\":";
        int idx = json.indexOf(searchKey);
        if (idx < 0) return "";
        int valStart = idx + searchKey.length();
        // Skip whitespace
        while (valStart < json.length() && json.charAt(valStart) == ' ') valStart++;
        if (valStart >= json.length()) return "";

        if (json.charAt(valStart) == '"') {
            // String value
            int valEnd = json.indexOf('"', valStart + 1);
            if (valEnd < 0) return "";
            return json.substring(valStart + 1, valEnd);
        } else {
            // Numeric or other value
            int valEnd = valStart;
            while (valEnd < json.length() && json.charAt(valEnd) != ',' && json.charAt(valEnd) != '}') {
                valEnd++;
            }
            return json.substring(valStart, valEnd).trim();
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
