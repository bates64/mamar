## 0.8.1

- Reduced CPU use when connected to an emulator

## 0.8.0

- Some instruments are named, press the _Set Instrument..._ button in the voice editor to view
- The lower nibble of voice banks is now called 'staccato' (higher values have a shorter release time) and appears in the voice editor
- MIDI pitch shift events are now translated to PM64 ones. The tuning will probably be off

## 0.7.0

- Voice (instrument) editing. Click a track and press 'Edit voice'.
- Much improved hot-reload server. It now tells you if an emulator is connected and lets you reconnect after a disconnection.
    - No changes to the Project64 script.
- Segments are now called "Variations".
- Subsegments are now called "Sections", and only those with tracks are shown in the UI.
- Tracks, variations, and sections are now given names when importing from a MIDI or named by file offset when viewing a BGM.
- Some track flags have been given names.

## 0.6.0

- Added solo (S) and mute (M) toggles to tracks.
    - Muted tracks have their note velocities set to zero.
    - If any tracks are solo'd, only those that are solo'd will play.
    - Solo/mute state becomes permanent when you save the file; muting a track, saving the file, then reloading it will cause all the notes in that track to become irrecovably silent.
- Added a track flag editor window. Click the track name in the list to view.
- Various grapical improvements.

## 0.5.1

## 0.5.0

- Added ability to view segment, subsegment, and track flags. You can also swap tracks between 'Voice' and 'Drum' mode.
- Added _Reload File_ action (for @eldexterr)
- Fixed _Save_ action

## 0.4.1

## 0.4.0

- UI rewrite

## 0.3.0

- MIDI files can now be opened and played
- Added _Save As..._ button
- Switched to Inter Medium font for better legibility (was Inter Regular)

## 0.2.0

- Entirely new app architecture
- You can mute/unmute instruments
- Dropped support for web version

## 0.1.0

Proof-of-concept release
