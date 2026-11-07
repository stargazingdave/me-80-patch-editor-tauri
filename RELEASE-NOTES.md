# ME-80 Patch Editor 0.2.1 beta

- Excludes the developer discovery executable from normal builds and the installer. Developer commands now require the explicit discovery-cli Cargo feature.
- Removes the accidentally bundled discovery executable from an existing 0.2.0 installation during upgrade. Close that tool before upgrading if it is running.
- Audits the generated NSIS file list, architecture and version before allowing publication.
- Retains the verified Direct/Catch system setting, passive MIDI listening and read-only probing features in the editor.

0.2.0 was withdrawn because its installer unintentionally included the developer CLI. Its earlier release notes incorrectly said that CLI was excluded.

Windows 11 x64, official BOSS ME-80 driver, and WebView2 required. This installer is unsigned. Physical pedal verification remains separate from automated tests. Back up your patches before testing.
