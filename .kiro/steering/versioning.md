# Versioning Rules

## Version Format
- Version format is `YYYY.MM.DD.x` where x starts at 1 and increments for same-day releases.
- Example: `2026.07.15.1`, `2026.07.15.2`, `2026.07.16.1`
- The date used is TODAY'S date (the day the release APK is built), NOT yesterday's.

## Single Source of Truth
- The version lives in `src/version.ts` as `APP_VERSION`.
- This is the ONLY place the version string is defined.
- It is displayed in the Wallpaper pane header (top right).

## Release Process (MANDATORY steps in order)
1. Update `src/version.ts` with today's date and correct increment.
2. Build the Go .aar if Go code changed.
3. Build the release APK.
4. Copy APK to Desktop with name `MobiMorphoun-{VERSION}.apk`.
5. `git add -A && git commit` with descriptive message.
6. `git push origin main`
7. `git tag {VERSION} && git push origin {VERSION}`
8. `gh release create {VERSION} ~/Desktop/MobiMorphoun-{VERSION}.apk --title "MobiMorphoun {VERSION}" --notes "..."`

## CRITICAL REMINDERS
- ALWAYS check today's actual date before creating a version tag.
- NEVER reuse a tag that already exists.
- If a tag for today already exists (e.g., 2026.07.15.1), increment the suffix (2026.07.15.2).
- The git tag and the APP_VERSION in code MUST match exactly.
