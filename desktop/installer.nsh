!macro customInstall
  CreateShortCut "$SMPROGRAMS\Glyphfield Windows - Wiederherstellen.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--restore"
!macroend
!macro customUnInstall
  Delete "$SMPROGRAMS\Glyphfield Windows - Wiederherstellen.lnk"
!macroend
