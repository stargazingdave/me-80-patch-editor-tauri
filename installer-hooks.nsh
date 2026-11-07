; Remove only the development tool unintentionally included in 0.2.0.
!macro NSIS_HOOK_PREINSTALL
  IfFileExists "$INSTDIR\me80-discovery.exe" 0 me80_discovery_cleanup_done
  ClearErrors
  Delete "$INSTDIR\me80-discovery.exe"
  IfErrors 0 me80_discovery_cleanup_done
  MessageBox MB_OK|MB_ICONEXCLAMATION "Close the ME-80 discovery tool and retry installing the editor." /SD IDOK
  Abort "The previous ME-80 discovery tool could not be removed."
  me80_discovery_cleanup_done:
!macroend
