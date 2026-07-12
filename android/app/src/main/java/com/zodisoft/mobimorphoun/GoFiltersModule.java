package com.zodisoft.mobimorphoun;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

import gofilters.Gofilters;

/**
 * React Native bridge to the Go filters library.
 * Calls compiled Go code for pixel-perfect filter processing.
 */
public class GoFiltersModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;

    GoFiltersModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }

    @Override
    public String getName() {
        return "GoFilters";
    }

    /**
     * Apply a filter to an image file.
     */
    @ReactMethod
    public void applyFilter(
        String inputPath,
        String outputDir,
        String filterName,
        double intensity,
        int screenWidth,
        int screenHeight,
        Promise promise
    ) {
        try {
            String result = Gofilters.applyFilter(
                inputPath, outputDir, filterName,
                intensity, (long) screenWidth, (long) screenHeight
            );
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("GO_FILTER_ERROR", e.getMessage(), e);
        }
    }

    /**
     * Render a quote onto an image file.
     */
    @ReactMethod
    public void renderQuote(
        String inputPath,
        String outputDir,
        String fontPath,
        String statement,
        String author,
        String boxLocation,
        double fontSize,
        double maxFontSize,
        String textColorHex,
        String bgColorHex,
        int bgOpacity,
        int maxChars,
        Promise promise
    ) {
        try {
            String result = Gofilters.renderQuote(
                inputPath, outputDir, fontPath,
                statement, author, boxLocation,
                fontSize, maxFontSize,
                textColorHex, bgColorHex,
                (long) bgOpacity, (long) maxChars
            );
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("GO_QUOTE_ERROR", e.getMessage(), e);
        }
    }
}
