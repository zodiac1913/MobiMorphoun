# MobiMorphoun

Mobile wallpaper changer for Android & iOS — the mobile companion to [Metamorphoun](https://github.com/your-repo/Metamorphoun).

## Features

All the features from the desktop version, adapted for mobile:

### Wallpaper Management
- **Auto-change on timer** — configurable interval (default 30 min)
- **Change on startup** — fresh wallpaper each time you open the app
- **Multiple image sources** — Bing Photo of the Day, NASA APOD, PicSum, Unsplash, Local Favorites
- **Wallpaper target** — Home screen, Lock screen, or Both (Android)
- **Picture history** — last 5 wallpapers with recall

### Image Filters
- Original (no filter, weighted more heavily)
- Blur (soft & hard)
- Pixelate
- Monochrome (grayscale)
- Cartoon (posterize approximation)
- Wavy/Dali (distortion)
- Vortex, Mosaic, Jigsaw, Graffiti, Oilify (available via Skia integration)

### Quote Overlay
- Quotes rendered on wallpapers
- Multiple quote libraries (bundled + user-uploadable JSON)
- Configurable position, colors, opacity, font size
- Random or fixed appearance
- Separate quote timer (change quote without changing wallpaper)
- Save favorite quotes

### Favorites
- Save wallpapers (with or without quotes)
- Save quotes independently
- Use favorites folder as an image source

## Tech Stack

- **React Native** with **Expo** (SDK 52)
- **Expo Router** for navigation
- **TypeScript** for type safety
- **expo-background-fetch** + **expo-task-manager** for scheduled wallpaper changes
- **expo-image-manipulator** for image filters
- **expo-file-system** for local storage
- **AsyncStorage** for config persistence
- **react-native-manage-wallpaper** for Android wallpaper setting

## Getting Started

```bash
# Install dependencies
npm install

# Start development
npx expo start

# Run on Android
npx expo run:android

# Run on iOS
npx expo run:ios
```

## Platform Notes

### Android
- Full wallpaper setting support (home, lock, or both)
- Background task runs reliably with proper battery optimization exclusion
- Requires `SET_WALLPAPER` permission (auto-granted)

### iOS
- iOS doesn't allow programmatic wallpaper setting
- App saves generated wallpapers to Photos library
- User sets wallpaper manually from Photos app
- Background fetch has iOS-imposed minimum interval (~15 min)

## Architecture

```
MobiMorphoun/
├── app/              # Expo Router screens
│   ├── _layout.tsx   # Root layout (init + nav)
│   └── (tabs)/       # Tab navigation
│       ├── index.tsx     # Main wallpaper screen
│       ├── quotes.tsx    # Quote management
│       ├── history.tsx   # Wallpaper history
│       └── settings.tsx  # Full settings
├── src/
│   ├── services/     # Business logic
│   │   ├── configService.ts       # Config load/save/migrate
│   │   ├── imageSourceService.ts  # Image fetching (Bing, NASA, etc.)
│   │   ├── filterService.ts       # Image filter pipeline
│   │   ├── quoteService.ts        # Quote management & overlay
│   │   ├── wallpaperService.ts    # Main orchestrator
│   │   ├── schedulerService.ts    # Background task scheduling
│   │   └── logService.ts          # Structured logging
│   └── types/
│       └── config.ts  # TypeScript types (mirrors Go structs)
├── assets/           # Icons, splash screen
├── app.json          # Expo config
└── package.json
```

## Config

Configuration is stored in AsyncStorage and mirrors the desktop JSON format.
See `src/types/config.ts` for the full schema.
