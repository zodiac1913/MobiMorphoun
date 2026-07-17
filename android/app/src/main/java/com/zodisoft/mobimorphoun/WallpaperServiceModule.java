package com.zodisoft.mobimorphoun;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

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
    public void startService(int intervalMinutes, Promise promise) {
        try {
            // Save interval to shared prefs so service can read it on restart
            SharedPreferences prefs = reactContext.getSharedPreferences("mobimorphoun_prefs", 0);
            prefs.edit().putInt("changeMinutes", intervalMinutes).apply();

            Intent intent = new Intent(reactContext, WallpaperService.class);
            intent.putExtra("intervalMinutes", intervalMinutes);

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
     * Check if the service is currently running.
     */
    @ReactMethod
    public void isRunning(Promise promise) {
        // Simple check via shared prefs flag
        SharedPreferences prefs = reactContext.getSharedPreferences("mobimorphoun_prefs", 0);
        boolean running = prefs.getBoolean("serviceRunning", false);
        promise.resolve(running);
    }
}
