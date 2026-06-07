# Feature TODOs

The following is a list of potential features and enhancements for YTools:

## Data & Extraction Enhancements
- [x] **Date Extraction**: Extract and include the publish date (or "time since published") for each video.
- [x] **View Count Extraction**: Extract and include the view count for each video.
- [x] **Thumbnail URLs**: Capture the high-resolution thumbnail URLs for the videos in the export.
- [x] **Playlist Support**: Extend the scanner to work on YouTube Playlist pages in addition to channel pages.
- [x] **Shorts vs. Regular Videos Column**: Differentiate and tag whether an extracted item is a Short or a standard video.

## Export Options
- [x] **CSV Export**: Add a "Save CSV" option for spreadsheet users.
- [x] **Markdown Export**: Add an option to export the list as a markdown file (with clickable links).
- [x] **Custom Text Templates**: Let users define the format of the text copied to the clipboard (e.g., `[{title}]({url})`).

## UI & User Experience
- [ ] **Filter and Search**: Allow users to filter the scanned list by keywords in the title or by video duration (e.g., only videos > 10 mins).
- [ ] **Sorting Options**: Allow the user to sort the extracted list by duration, view count, or publish date before exporting.
- [ ] **Progress Indicators**: Show an estimated total video count (if available on the page) and a progress bar during scanning.
- [ ] **Persistent State (Pause/Resume)**: Implement pause and resume functionality that persists even if the browser is restarted, using Chrome Storage.
- [x] **Dark/Light Mode Toggle**: Add a toggle in settings to switch between high-contrast dark and light mode themes.

## Future Tabs & Tools
- [ ] **Thumbnail Extractor Tab**: Add a dedicated tab that extracts the thumbnail of the active video watch page.
  - Detects if the user is on a `/watch?v=...` page.
  - Lists and displays previews of all available thumbnail resolutions (e.g., Max Resolution, High, Medium, Default) in descending order of quality (highest first).
  - Offers direct download buttons/clicks for each resolution.
- [ ] **Channel Analytics Tab**: A dashboard tab showing stats on the extracted lists, including view count frequency histograms, upload timeline charts, and duration distributions.
- [ ] **Subtitles & Transcript Fetcher Tab**: Retrieve auto-generated or uploaded subtitles/captions of the active video in TXT or SRT formats directly from the popup.
- [ ] **Bulk Title Optimizer Tab**: Suggest SEO optimization improvements for the extracted list using pre-defined patterns or AI title refactoring.
