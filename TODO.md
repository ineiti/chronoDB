# TODO

## Functionality

### Obsidian

- Work on Obsidian integration
  - Call fileupdate when saving
  - Show errors in file
  - Hide `>@` as a character
    - When hitting `Enter` over it, show some additional information about it
  - Make nice display with lines
  - Auto-save?
  - Auto-complete?

### Backend

- Add `>+` for a new parent
- Check that everything also works with texts and other blobs
- Make work `LinkBi`

## Cleanup

### Backend
- replace `ChronoBlob`'s `TimeLink` and `TimeData` with a getter
  - add a `DBStorage` array to `ChronoBlob`
  - each getter has an optional value `time`
    - by default the getters return the latest state
    - if `time` is set, only the `DBStorage` up to `time` are taken into account
  - check if it's better to have a `View extends ChronoDB` which can have a given time
- ChronoBlob.filter - might be better to have a filter like `Checkbox.checked` and then test
  if it's the right blob-type, before calling the filter.
  It could also allow for `*.date` to call generic filters.
- Use a nosql database instead of a textfile

### Obsidian
- Only work in subdirectory configured by plug-in