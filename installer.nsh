!macro customInstall
  DetailPrint "Configuring Orthocare ERP Desktop & Start Menu Icons..."

  # Install app.ico directly into $INSTDIR
  File "/oname=$INSTDIR\app.ico" "${BUILD_RESOURCES_DIR}\icon.ico"

  # Clean old shortcut if path differed
  ${if} $oldDesktopLink != $newDesktopLink
  ${andIf} ${FileExists} "$oldDesktopLink"
    Delete "$oldDesktopLink"
  ${endIf}

  # Always recreate / overwrite desktop shortcut pointing explicitly to app.ico
  CreateShortCut "$newDesktopLink" "$appExe" "" "$INSTDIR\app.ico" 0 "" "" "Orthocare ERP"
  ClearErrors
  WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"

  # Always update start menu shortcut pointing explicitly to app.ico
  ${if} ${FileExists} "$newStartMenuLink"
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$INSTDIR\app.ico" 0 "" "" "Orthocare ERP"
    ClearErrors
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  ${endIf}

  # Flush and refresh shell icons across Windows Explorer
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  Delete "$INSTDIR\app.ico"
!macroend
