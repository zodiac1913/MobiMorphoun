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

            String wallpaperDir = getFilesDir().getAbsolutePath() + "/wallpapers";
            new File(wallpaperDir).mkdirs();

            // 1. Fetch image from configured source
            String[] fetchResult = null;
            if (isNetworkAvailable()) {
                fetchResult = fetchImageFromSource(wallpaperDir);
            } else {
                Log.w(TAG, "No network");
                updateNotification("No network — using local images");
            }

            // 2. If online sources failed or no network, fall back to local images
            //    (history pics in DCIM/MobiMorphoun or camera roll)
            if (fetchResult == null) {
                fetchResult = fetchLocalFallback(wallpaperDir);
            }

            if (fetchResult == null) {
                Log.e(TAG, "All sources failed including local fallback");
                updateNotification("No images available");
                return;
            }
            String originalPath = fetchResult[0];
            String sourceName = fetchResult[1];

            // 2. Pick and apply filter via Go (honors the user's enabled-filter toggles)
            String filterName = pickEnabledFilter();
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
                // Pick a quote from the user's enabled quote libraries (synced from JS).
                String picked = pickQuote();
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
            saveToHistory(finalPath, originalPath, filterName, sourceName);

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
                // Pick a quote from the user's enabled quote libraries (synced from JS).
                String picked = pickQuote();
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

            // Quote-only changes do NOT create new history entries —
            // same pic, just a different quote overlay. No new files needed.
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
    private static final String HISTORY_DIR = android.os.Environment.getExternalStorageDirectory().getAbsolutePath() + "/DCIM/MobiMorphoun";

    /**
     * Save wallpaper info to a JSON file the JS UI reads.
     * Maintains history of last 8 pairs in /sdcard/DCIM/MobiMorphoun.
     * Files are named pic{YYYYMMDDHHmmss}.jpg (rendered) and raw{YYYYMMDDHHmmss}.jpg (original).
     * When more than 8 pairs exist, the oldest pair is deleted.
     */
    private void saveToHistory(String filteredPath, String originalPath, String filter, String source) {
        try {
            // Ensure DCIM/MobiMorphoun directory exists
            File histDir = new File(HISTORY_DIR);
            histDir.mkdirs();

            // Generate timestamp for filenames
            java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("yyyyMMddHHmmss", java.util.Locale.US);
            String timestamp = sdf.format(new java.util.Date());

            // Copy images with timestamp names
            String picDest = HISTORY_DIR + "/pic" + timestamp + ".jpg";
            String rawDest = HISTORY_DIR + "/raw" + timestamp + ".jpg";
            copyFile(filteredPath, picDest);
            copyFile(originalPath, rawDest);

            Log.i(TAG, "History saved to: " + picDest + " and " + rawDest);

            // Enforce max 8 pairs — delete oldest if we have more
            enforceMaxHistory(histDir);

            // Build history JSON from directory contents (sorted newest first)
            String history = buildHistoryJson(histDir, filter, source);

            // Write history JSON
            File histFile = new File(getFilesDir(), "wallpaper_history.json");
            FileOutputStream fos = new FileOutputStream(histFile);
            fos.write(history.getBytes());
            fos.close();

            Log.i(TAG, "History JSON updated: " + histFile.getAbsolutePath());

        } catch (Exception e) {
            Log.e(TAG, "Save history failed", e);
        }
    }

    /**
     * Enforce max 8 pic/raw pairs in the history directory.
     * Deletes the oldest pairs when count exceeds MAX_HISTORY.
     */
    private void enforceMaxHistory(File histDir) {
        // Get all pic files sorted by name (which sorts by timestamp)
        File[] picFiles = histDir.listFiles((d, name) -> name.startsWith("pic") && name.endsWith(".jpg"));
        if (picFiles == null || picFiles.length <= MAX_HISTORY) return;

        // Sort ascending (oldest first)
        java.util.Arrays.sort(picFiles, (a, b) -> a.getName().compareTo(b.getName()));

        // Delete oldest pairs until we have MAX_HISTORY
        int toDelete = picFiles.length - MAX_HISTORY;
        for (int i = 0; i < toDelete; i++) {
            String picName = picFiles[i].getName();
            // Extract timestamp portion: pic{timestamp}.jpg -> raw{timestamp}.jpg
            String ts = picName.substring(3, picName.length() - 4); // remove "pic" and ".jpg"
            File rawFile = new File(histDir, "raw" + ts + ".jpg");

            Log.i(TAG, "Deleting oldest history: " + picName);
            picFiles[i].delete();
            if (rawFile.exists()) rawFile.delete();
        }
    }

    /**
     * Build history JSON from files in the DCIM/MobiMorphoun directory.
     * Scans for pic*.jpg files, pairs them with raw*.jpg, sorted newest first.
     */
    private String buildHistoryJson(File histDir, String latestFilter, String latestSource) {
        File[] picFiles = histDir.listFiles((d, name) -> name.startsWith("pic") && name.endsWith(".jpg"));
        if (picFiles == null || picFiles.length == 0) return "[]";

        // Sort descending (newest first)
        java.util.Arrays.sort(picFiles, (a, b) -> b.getName().compareTo(a.getName()));

        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < picFiles.length && i < MAX_HISTORY; i++) {
            String picName = picFiles[i].getName();
            String ts = picName.substring(3, picName.length() - 4);
            String rawPath = HISTORY_DIR + "/raw" + ts + ".jpg";
            String picPath = picFiles[i].getAbsolutePath();

            // For the newest entry use the provided filter/source, others get generic labels
            String f = (i == 0) ? latestFilter : "Unknown";
            String s = (i == 0) ? latestSource : "Unknown";

            // Try to read filter/source from existing JSON for older entries
            // For simplicity, we'll store filter in the JSON and read it back
            if (i > 0) {
                // Read from existing history JSON if available
                File existingHist = new File(getFilesDir(), "wallpaper_history.json");
                if (existingHist.exists()) {
                    try {
                        FileInputStream fis = new FileInputStream(existingHist);
                        byte[] data = new byte[(int) existingHist.length()];
                        fis.read(data);
                        fis.close();
                        String existingJson = new String(data);
                        // Find entry with matching saveName
                        if (existingJson.contains(picPath)) {
                            // Extract filter and source for this entry
                            int entryIdx = existingJson.indexOf(picPath);
                            int braceStart = existingJson.lastIndexOf('{', entryIdx);
                            int braceEnd = existingJson.indexOf('}', entryIdx);
                            if (braceStart >= 0 && braceEnd > braceStart) {
                                String entryStr = existingJson.substring(braceStart, braceEnd + 1);
                                String ef = extractJsonValue(entryStr, "filter");
                                String es = extractJsonValue(entryStr, "source");
                                if (!ef.isEmpty()) f = ef;
                                if (!es.isEmpty()) s = es;
                            }
                        }
                    } catch (Exception ignored) {}
                }
            }

            if (i > 0) sb.append(",");
            sb.append("{\"saveName\":\"").append(picPath).append("\"");
            sb.append(",\"originalLocalUri\":\"").append(rawPath).append("\"");
            sb.append(",\"filter\":\"").append(f).append("\"");
            sb.append(",\"source\":\"").append(s).append("\"");
            sb.append(",\"timestamp\":").append(ts).append("}");
        }
        sb.append("]");
        return sb.toString();
    }

    /**
     * Extract a value from a simple flat JSON object string.
     */
    private String extractJsonValue(String json, String key) {
        String searchKey = "\"" + key + "\":";
        int idx = json.indexOf(searchKey);
        if (idx < 0) return "";
        int valStart = idx + searchKey.length();
        while (valStart < json.length() && json.charAt(valStart) == ' ') valStart++;
        if (valStart >= json.length()) return "";

        if (json.charAt(valStart) == '"') {
            int valEnd = json.indexOf('"', valStart + 1);
            if (valEnd < 0) return "";
            return json.substring(valStart + 1, valEnd);
        } else {
            int valEnd = valStart;
            while (valEnd < json.length() && json.charAt(valEnd) != ',' && json.charAt(valEnd) != '}') {
                valEnd++;
            }
            return json.substring(valStart, valEnd).trim();
        }
    }

    /**
     * Fetch image from a randomly chosen enabled source.
     * Reads enabled sources from SharedPreferences (synced from JS config).
     * Shuffles enabled sources and tries each. If the first pick fails,
     * alerts the user via notification but tries remaining enabled sources.
     * NEVER uses a source that isn't enabled.
     * Returns [filePath, sourceName] or null if ALL enabled sources fail.
     */
    /**
     * Fallback quote pool used only when the JS side has not yet synced the
     * user's enabled quote libraries into SharedPreferences.
     */
    private static final String[] FALLBACK_QUOTES = {
        "The happiness of your life depends upon the quality of your thoughts.|Marcus Aurelius",
        "We suffer more often in imagination than in reality.|Seneca",
        "You have power over your mind, not outside events.|Marcus Aurelius",
        "First say to yourself what you would be; and then do what you have to do.|Epictetus",
        "Very little is needed to make a happy life; it is all within yourself.|Marcus Aurelius"
    };

    /**
     * Pick a quote ("statement|author") honoring the user's enabled quote
     * libraries synced from JS via the "enabledQuotes" pref (newline-separated
     * "statement|author" entries). Falls back to a small built-in set when
     * nothing has been synced yet.
     */
    private String pickQuote() {
        SharedPreferences prefs = getSharedPreferences("mobimorphoun_prefs", MODE_PRIVATE);
        String blob = prefs.getString("enabledQuotes", "");

        java.util.List<String> pool = new java.util.ArrayList<>();
        if (blob != null && !blob.trim().isEmpty()) {
            for (String line : blob.split("\n")) {
                String trimmed = line.trim();
                if (!trimmed.isEmpty()) pool.add(trimmed);
            }
        }
        if (pool.isEmpty()) {
            return FALLBACK_QUOTES[(int) (Math.random() * FALLBACK_QUOTES.length)];
        }
        return pool.get((int) (Math.random() * pool.size()));
    }

    /**
     * Pick a filter honoring the user's enabled-filter toggles synced from JS.
     * Reads the comma-separated "enabledFilters" pref (e.g. "Original,BlurSoft,Cyberpunk").
     * Mirrors the JS getEnabledFilters(): "Original" is weighted 3x, and if nothing
     * is configured we fall back to "Original" so a wallpaper still changes.
     */
    private String pickEnabledFilter() {
        SharedPreferences prefs = getSharedPreferences("mobimorphoun_prefs", MODE_PRIVATE);
        String enabledFiltersStr = prefs.getString("enabledFilters", "");
        Log.i(TAG, "enabledFilters from prefs: '" + enabledFiltersStr + "'");

        java.util.List<String> pool = new java.util.ArrayList<>();
        boolean hasOriginal = false;
        for (String f : enabledFiltersStr.split(",")) {
            String trimmed = f.trim();
            if (trimmed.isEmpty()) continue;
            pool.add(trimmed);
            if (trimmed.equalsIgnoreCase("Original")) {
                hasOriginal = true;
            }
        }

        if (pool.isEmpty()) {
            // Nothing enabled (or not yet synced) — leave the image untouched.
            return "Original";
        }

        // Weight "Original" more heavily (3x total) like the JS getEnabledFilters does.
        if (hasOriginal) {
            pool.add("Original");
            pool.add("Original");
        }

        return pool.get((int) (Math.random() * pool.size()));
    }

    private String[] fetchImageFromSource(String outputDir) {
        SharedPreferences prefs = getSharedPreferences("mobimorphoun_prefs", MODE_PRIVATE);
        String enabledSourcesStr = prefs.getString("enabledImageSources", "");

        Log.i(TAG, "enabledImageSources from prefs: '" + enabledSourcesStr + "'");

        // Parse enabled sources (comma-separated, e.g. "Bing,PicSum,NASA")
        if (enabledSourcesStr.isEmpty()) {
            Log.w(TAG, "No image sources configured in SharedPreferences");
            updateNotification("No image sources enabled");
            return null;
        }

        String[] enabled = enabledSourcesStr.split(",");

        // Filter out empty strings and build shuffled list
        java.util.List<String> sourceList = new java.util.ArrayList<>();
        for (String s : enabled) {
            String trimmed = s.trim();
            if (!trimmed.isEmpty()) sourceList.add(trimmed);
        }

        if (sourceList.isEmpty()) {
            updateNotification("No image sources enabled");
            return null;
        }

        // Shuffle so we pick randomly
        java.util.Collections.shuffle(sourceList);
        Log.i(TAG, "Trying sources in order: " + sourceList.toString());

        // Try each enabled source in shuffled order
        for (int i = 0; i < sourceList.size(); i++) {
            String source = sourceList.get(i);
            String path = null;
            try {
                switch (source) {
                    case "Bing":
                        path = fetchBingImage(outputDir);
                        break;
                    case "NASA":
                        path = fetchNASAImage(outputDir);
                        break;
                    case "PicSum":
                        path = fetchPicSumImage(outputDir);
                        break;
                    case "Pexels":
                        path = fetchPexelsImage(outputDir);
                        break;
                    case "CameraRoll":
                    case "Favorites":
                        // Local sources — use the local fallback logic directly
                        path = fetchLocalSource(outputDir, source);
                        break;
                    default:
                        Log.w(TAG, "Unknown source: " + source);
                        continue;
                }
            } catch (Exception e) {
                Log.w(TAG, "Source " + source + " failed: " + e.getMessage());
            }

            if (path != null) {
                Log.i(TAG, "Fetched from source: " + source);
                return new String[]{path, source};
            }

            // This source failed — alert user but keep trying others
            Log.w(TAG, source + " is down, trying next enabled source...");
            updateNotification(source + " failed — trying another source");
        }

        // ALL enabled sources failed
        updateNotification("All enabled sources failed — check connections");
        return null;
    }

    /**
     * Fetch a random image from a local source (CameraRoll or Favorites).
     */
    private String fetchLocalSource(String outputDir, String source) {
        java.util.List<File> candidates = new java.util.ArrayList<>();

        if ("CameraRoll".equals(source)) {
            // Look in common camera directories
            String[] cameraDirs = {
                android.os.Environment.getExternalStorageDirectory().getAbsolutePath() + "/DCIM/Camera",
                android.os.Environment.getExternalStorageDirectory().getAbsolutePath() + "/DCIM",
                android.os.Environment.getExternalStorageDirectory().getAbsolutePath() + "/Pictures",
            };
            for (String dir : cameraDirs) {
                File d = new File(dir);
                if (d.exists()) {
                    File[] photos = d.listFiles((parent, name) -> {
                        String lower = name.toLowerCase();
                        return (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png"))
                                && !name.startsWith("pic") && !name.startsWith("raw"); // skip our history files
                    });
                    if (photos != null) {
                        for (File f : photos) candidates.add(f);
                    }
                }
            }
        } else if ("Favorites".equals(source)) {
            // Favorites stored in DCIM/MobiMorphoun/Favorites
            File favDir = new File(HISTORY_DIR, "Favorites");
            if (favDir.exists()) {
                File[] favs = favDir.listFiles((d, name) -> {
                    String lower = name.toLowerCase();
                    return lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png");
                });
                if (favs != null) {
                    for (File f : favs) candidates.add(f);
                }
            }
        }

        if (candidates.isEmpty()) {
            Log.w(TAG, source + ": no images found");
            return null;
        }

        // Pick a random one
        File picked = candidates.get((int)(Math.random() * candidates.size()));
        String destPath = outputDir + "/local_" + System.currentTimeMillis() + ".jpg";
        copyFile(picked.getAbsolutePath(), destPath);

        if (new File(destPath).exists()) {
            Log.i(TAG, source + ": picked " + picked.getName());
            return destPath;
        }
        return null;
    }

    /**
     * Local fallback: pick a random image from history (DCIM/MobiMorphoun raw files)
     * or the device camera roll (DCIM/Camera).
     * Used when no network or all online sources fail.
     */
    private String[] fetchLocalFallback(String outputDir) {
        java.util.List<File> candidates = new java.util.ArrayList<>();

        // 1. History raw images in DCIM/MobiMorphoun
        File histDir = new File(HISTORY_DIR);
        if (histDir.exists()) {
            File[] rawFiles = histDir.listFiles((d, name) -> name.startsWith("raw") && name.endsWith(".jpg"));
            if (rawFiles != null) {
                for (File f : rawFiles) candidates.add(f);
            }
        }

        // 2. Camera roll (DCIM/Camera)
        File cameraDir = new File(android.os.Environment.getExternalStorageDirectory(), "DCIM/Camera");
        if (cameraDir.exists()) {
            File[] photos = cameraDir.listFiles((d, name) ->
                    name.toLowerCase().endsWith(".jpg") || name.toLowerCase().endsWith(".jpeg") || name.toLowerCase().endsWith(".png"));
            if (photos != null) {
                for (File f : photos) candidates.add(f);
            }
        }

        if (candidates.isEmpty()) {
            Log.w(TAG, "No local fallback images available");
            return null;
        }

        // Pick a random local image
        File picked = candidates.get((int)(Math.random() * candidates.size()));
        String sourceName = picked.getAbsolutePath().contains("MobiMorphoun") ? "History" : "CameraRoll";

        // Copy to working dir so the filter pipeline can work on it
        String destPath = outputDir + "/local_" + System.currentTimeMillis() + ".jpg";
        copyFile(picked.getAbsolutePath(), destPath);

        if (new File(destPath).exists()) {
            Log.i(TAG, "Local fallback: " + sourceName + " — " + picked.getName());
            return new String[]{destPath, sourceName};
        }
        return null;
    }

    /**
     * Fetch Bing Photo of the Day (random from last 8 days).
     */
    private String fetchBingImage(String outputDir) {
        try {
            String apiUrl = "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=en-US";
            HttpURLConnection conn = (HttpURLConnection) new URL(apiUrl).openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.connect();

            if (conn.getResponseCode() != 200) {
                conn.disconnect();
                return null;
            }

            // Read JSON response
            InputStream in = conn.getInputStream();
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int len;
            while ((len = in.read(buf)) != -1) baos.write(buf, 0, len);
            in.close();
            conn.disconnect();
            String json = baos.toString("UTF-8");

            // Parse image URLs from JSON (simple extraction)
            java.util.List<String> urls = new java.util.ArrayList<>();
            int searchFrom = 0;
            while (true) {
                int idx = json.indexOf("\"url\":\"", searchFrom);
                if (idx < 0) break;
                int start = idx + 7;
                int end = json.indexOf("\"", start);
                if (end < 0) break;
                String imageUrl = "https://www.bing.com" + json.substring(start, end);
                urls.add(imageUrl);
                searchFrom = end + 1;
            }

            if (urls.isEmpty()) {
                Log.w(TAG, "Bing: no images found in response");
                return null;
            }

            // Pick a random image
            String imageUrl = urls.get((int)(Math.random() * urls.size()));
            Log.i(TAG, "Bing image URL: " + imageUrl);

            return downloadToFile(imageUrl, outputDir, "bing_" + System.currentTimeMillis() + ".jpg");
        } catch (Exception e) {
            Log.e(TAG, "Bing fetch failed", e);
            return null;
        }
    }

    /**
     * Fetch NASA Astronomy Picture of the Day (random date).
     */
    private String fetchNASAImage(String outputDir) {
        try {
            // Random date between 1995-06-16 and today
            long start = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US)
                    .parse("1995-06-16").getTime();
            long end = System.currentTimeMillis();
            long randomTime = start + (long)(Math.random() * (end - start));
            String dateStr = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US)
                    .format(new java.util.Date(randomTime));

            String apiUrl = "https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&date=" + dateStr;
            HttpURLConnection conn = (HttpURLConnection) new URL(apiUrl).openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.connect();

            if (conn.getResponseCode() != 200) {
                conn.disconnect();
                return null;
            }

            InputStream in = conn.getInputStream();
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int len;
            while ((len = in.read(buf)) != -1) baos.write(buf, 0, len);
            in.close();
            conn.disconnect();
            String json = baos.toString("UTF-8");

            // Check media_type is "image"
            if (!json.contains("\"media_type\":\"image\"")) {
                Log.w(TAG, "NASA: not an image for date " + dateStr);
                return null;
            }

            // Extract hdurl or url
            String imageUrl = extractSimpleJsonString(json, "hdurl");
            if (imageUrl == null || imageUrl.isEmpty()) {
                imageUrl = extractSimpleJsonString(json, "url");
            }
            if (imageUrl == null || imageUrl.isEmpty()) return null;

            Log.i(TAG, "NASA image URL: " + imageUrl);
            return downloadToFile(imageUrl, outputDir, "nasa_" + System.currentTimeMillis() + ".jpg");
        } catch (Exception e) {
            Log.e(TAG, "NASA fetch failed", e);
            return null;
        }
    }

    /**
     * Fetch random image from PicSum.
     */
    private String fetchPicSumImage(String outputDir) {
        try {
            String url = "https://picsum.photos/1080/1920?random=" + System.currentTimeMillis();
            return downloadToFile(url, outputDir, "picsum_" + System.currentTimeMillis() + ".jpg");
        } catch (Exception e) {
            Log.e(TAG, "PicSum fetch failed", e);
            return null;
        }
    }

    /**
     * Fetch random image from Pexels using their API.
     * Reads the API key from SharedPreferences (synced from JS config).
     */
    private String fetchPexelsImage(String outputDir) {
        try {
            SharedPreferences prefs = getSharedPreferences("mobimorphoun_prefs", MODE_PRIVATE);
            String apiKey = prefs.getString("apiKey_pexels", "");

            if (apiKey.isEmpty()) {
                Log.w(TAG, "Pexels: no API key configured");
                updateNotification("Pexels needs an API key — add it in Settings");
                return null;
            }

            int page = 1 + (int)(Math.random() * 50);
            String apiUrl = "https://api.pexels.com/v1/curated?per_page=30&page=" + page;

            HttpURLConnection conn = (HttpURLConnection) new URL(apiUrl).openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.setRequestProperty("Authorization", apiKey);
            conn.setRequestProperty("User-Agent", "MobiMorphoun/1.0");
            conn.connect();

            int responseCode = conn.getResponseCode();
            if (responseCode != 200) {
                conn.disconnect();
                Log.w(TAG, "Pexels API returned: " + responseCode);
                if (responseCode == 401 || responseCode == 403) {
                    updateNotification("Pexels API key invalid — check Settings");
                }
                return null;
            }

            // Read response
            InputStream in = conn.getInputStream();
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int len;
            while ((len = in.read(buf)) != -1) baos.write(buf, 0, len);
            in.close();
            conn.disconnect();
            String json = baos.toString("UTF-8");

            // Extract "portrait" URLs (phone-sized) from the photos array
            java.util.List<String> imageUrls = new java.util.ArrayList<>();
            String searchToken = "\"portrait\":\"";
            int searchFrom = 0;
            while (true) {
                int idx = json.indexOf(searchToken, searchFrom);
                if (idx < 0) break;
                int start = idx + searchToken.length();
                int end = json.indexOf("\"", start);
                if (end < 0) break;
                String url = json.substring(start, end).replace("\\/", "/");
                if (!url.isEmpty()) {
                    imageUrls.add(url);
                }
                searchFrom = end + 1;
            }

            if (imageUrls.isEmpty()) {
                Log.w(TAG, "Pexels: no images found in response");
                return null;
            }

            // Pick a random one
            String imageUrl = imageUrls.get((int)(Math.random() * imageUrls.size()));
            Log.i(TAG, "Pexels picked: " + imageUrl.substring(0, Math.min(80, imageUrl.length())) + "...");

            return downloadToFile(imageUrl, outputDir, "pexels_" + System.currentTimeMillis() + ".jpg");
        } catch (Exception e) {
            Log.e(TAG, "Pexels fetch failed", e);
            return null;
        }
    }

    /**
     * Download a URL to a file in outputDir.
     */
    private String downloadToFile(String url, String outputDir, String filename) {
        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.connect();

            if (conn.getResponseCode() != 200) {
                conn.disconnect();
                return null;
            }

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
            Log.e(TAG, "Download failed: " + url, e);
            return null;
        }
    }

    /**
     * Simple JSON string value extractor (no full parser needed).
     */
    private String extractSimpleJsonString(String json, String key) {
        String search = "\"" + key + "\":\"";
        int idx = json.indexOf(search);
        if (idx < 0) return null;
        int start = idx + search.length();
        int end = json.indexOf("\"", start);
        if (end < 0) return null;
        return json.substring(start, end);
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
