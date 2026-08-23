package com.zodisoft.mobimorphoun;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

/**
 * React Native bridge to start/stop the native wallpaper foreground service.
 */
public class WallpaperServiceModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;

    WallpaperServiceModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }

    @Override
    public String getName() {
        return "WallpaperServiceManager";
    }

    /**
     * Start the wallpaper change service with the given interval.
     */
    @ReactMethod
    public void startService(int intervalMinutes, int quoteIntervalMinutes, Promise promise) {
        try {
            SharedPreferences prefs = reactContext.getSharedPreferences("mobimorphoun_prefs", 0);
            prefs.edit()
                .putInt("changeMinutes", intervalMinutes)
                .putInt("quoteChangeMinutes", quoteIntervalMinutes)
                .apply();

            Intent intent = new Intent(reactContext, WallpaperService.class);
            intent.putExtra("intervalMinutes", intervalMinutes);
            intent.putExtra("quoteIntervalMinutes", quoteIntervalMinutes);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent);
            } else {
                reactContext.startService(intent);
            }

            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("SERVICE_ERROR", e.getMessage(), e);
        }
    }

    /**
     * Trigger an immediate wallpaper change (for "Next" button).
     */
    @ReactMethod
    public void changeNow(Promise promise) {
        try {
            Intent intent = new Intent(reactContext, WallpaperService.class);
            intent.setAction(WallpaperService.ACTION_CHANGE_NOW);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent);
            } else {
                reactContext.startService(intent);
            }

            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("SERVICE_ERROR", e.getMessage(), e);
        }
    }

    /**
     * Stop the wallpaper change service.
     */
    @ReactMethod
    public void stopService(Promise promise) {
        try {
            Intent intent = new Intent(reactContext, WallpaperService.class);
            reactContext.stopService(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("SERVICE_ERROR", e.getMessage(), e);
        }
    }

    /**
     * Read the wallpaper history JSON file.
     */
    @ReactMethod
    public void getHistory(Promise promise) {
        try {
            java.io.File histFile = new java.io.File(reactContext.getFilesDir(), "wallpaper_history.json");
            Log.i("MobiWallpaper", "getHistory: file exists=" + histFile.exists() + " path=" + histFile.getAbsolutePath());
            if (!histFile.exists()) {
                promise.resolve("[]");
                return;
            }
            java.io.FileInputStream fis = new java.io.FileInputStream(histFile);
            byte[] data = new byte[(int) histFile.length()];
            fis.read(data);
            fis.close();
            String json = new String(data);
            Log.i("MobiWallpaper", "getHistory: returning " + json.length() + " chars");
            promise.resolve(json);
        } catch (Exception e) {
            Log.e("MobiWallpaper", "getHistory failed", e);
            promise.reject("READ_ERROR", e.getMessage(), e);
        }
    }

    /**
     * Return the absolute path to the history directory where rendered/original images are stored.
     */
    @ReactMethod
    public void getHistoryDir(Promise promise) {
        try {
            String historyDir = android.os.Environment.getExternalStorageDirectory().getAbsolutePath() + "/DCIM/MobiMorphoun";
            java.io.File dir = new java.io.File(historyDir);
            if (!dir.exists()) {
                dir.mkdirs();
            }
            promise.resolve(historyDir);
        } catch (Exception e) {
            promise.reject("DIR_ERROR", e.getMessage(), e);
        }
    }
}
