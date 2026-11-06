; Pliage — custom NSIS uninstaller behavior.
; Asks the user during uninstall what to do with %APPDATA%\Pliage — saved
; preferences, the library-folder pointer, cached soundfonts, and the copied
; Demo/ files. Not just yes/no: a user who never configured a library folder
; has their edited MIDI files saved inside this same %APPDATA%\Pliage tree
; (see electron/main.ts's getPliageOutputDir/ensureDemoFolder — no library
; folder means the fallback Demo/ lives here, and edits get written to
; Demo/Pliage/ beside it), so a blanket delete would destroy real user work,
; not just disposable app state.
;
; ── The uninstaller's data choice: its own page, shown after the welcome page
; and BEFORE anything is removed, so "Keep everything" can still stop the
; uninstall. Four named choices, each saying exactly what it does underneath
; — a MessageBox can only offer Yes/No/Cancel, which people misread. The
; button below reads Uninstall, or Close for "Keep everything". The cleanup
; section further down acts on $pliageChoice once the app files are gone:
;   1  Delete everything
;   2  Keep my edited files (moved to the Desktop), delete the rest
;   3  Remove Pliage, keep my data   ← preselected: nothing is lost
;   4  Keep everything — the uninstall stops here, nothing touched
; A silent or auto-update uninstall shows no pages: $pliageChoice stays empty,
; which the section treats as 3 (and it skips those runs earlier anyway).
;
; electron-builder includes this file BEFORE installer.nsi pulls in MUI2 and
; LogicLib, so the page's functions live inside customUnWelcomePage, which
; it inserts later, among the uninstaller's pages (uninstaller pass only —
; the build treats warnings as errors, and the installer pass would warn
; about un.* functions it never uses).

!ifdef BUILD_UNINSTALLER
  ; installer.nsi adds a "Choose Components" page to the uninstaller whenever
  ; customUnInstallSection exists; our sections are hidden, so all it ever
  ; shows is a greyed-out "Uninstall" tick. Skipped: this file comes before
  ; installer.nsi, so the define applies to that page, the first one inserted.
  !define MUI_PAGE_CUSTOMFUNCTION_PRE un.pliageSkipPage
  Function un.pliageSkipPage
    Abort
  FunctionEnd
!endif

; one choice: its name by a radio button, what it does underneath in dark
; grey (black and grey like the rest of the uninstaller; Windows' command-link
; buttons draw their text in a fixed blue). Defined out here: a macro can't be
; defined inside another one.
!macro pliageChoiceRow N TOP NTOP TITLE NOTE
  ${NSD_CreateRadioButton} 0 ${TOP}u 100% 12u "${TITLE}"
  Pop $pliageRadio${N}
  SendMessage $pliageRadio${N} ${WM_SETFONT} $pliageTitleFont 1
  ${NSD_OnClick} $pliageRadio${N} un.pliageChoiceClick
  ${NSD_CreateLabel} 13u ${NTOP}u -13u 22u "${NOTE}"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $pliageNoteFont 1
  SetCtlColors $0 0x5F5F5F transparent
!macroend

!macro customUnWelcomePage
  ; no Back on the welcome page: the only page "before" it is the skipped
  ; Components page, so Back would just close the uninstaller
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.pliageWelcomeShow
  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.pliageChoicePage un.pliageChoiceLeave

  Function un.pliageWelcomeShow
    GetDlgItem $0 $HWNDPARENT 3
    ShowWindow $0 ${SW_HIDE}
  FunctionEnd

  !include nsDialogs.nsh

  Var pliageChoice
  Var pliageTitleFont
  Var pliageNoteFont
  Var pliageRadio1
  Var pliageRadio2
  Var pliageRadio3
  Var pliageRadio4

  Function un.pliageChoicePage
    ${If} $pliageChoice == ""
      StrCpy $pliageChoice 3
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "What should happen to your Pliage data?" "Your library folder and the files in it are never touched."
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    CreateFont $pliageTitleFont "Segoe UI Semibold" 10 600
    CreateFont $pliageNoteFont "Segoe UI" 9 400
    !insertmacro pliageChoiceRow 1 0 13 "Delete everything" "Deletes all Pliage data, including preferences, library folder link, downloaded soundfonts, demo files and edited MIDI files not stored in a library folder."
    !insertmacro pliageChoiceRow 2 37 50 "Keep my edited files" "Moves edited MIDI files to the Desktop, then deletes all other Pliage data."
    !insertmacro pliageChoiceRow 3 65 78 "Remove Pliage, keep my data" "Removes the app but leaves your preferences, library folder link, soundfonts, demo and edited files in place, ready for a reinstall."
    !insertmacro pliageChoiceRow 4 102 115 "Keep everything" "Cancels the uninstall and leaves all files untouched."
    ${Select} $pliageChoice
      ${Case} 1
        ${NSD_Check} $pliageRadio1
      ${Case} 2
        ${NSD_Check} $pliageRadio2
      ${Case} 4
        ${NSD_Check} $pliageRadio4
      ${CaseElse}
        ${NSD_Check} $pliageRadio3
    ${EndSelect}
    Call un.pliageChoiceButton
    nsDialogs::Show
  FunctionEnd

  Function un.pliageChoiceClick
    Pop $0
    ${If} $0 == $pliageRadio1
      StrCpy $pliageChoice 1
    ${ElseIf} $0 == $pliageRadio2
      StrCpy $pliageChoice 2
    ${ElseIf} $0 == $pliageRadio4
      StrCpy $pliageChoice 4
    ${Else}
      StrCpy $pliageChoice 3
    ${EndIf}
    Call un.pliageChoiceButton
  FunctionEnd

  ; the button says what will happen: Uninstall, or Close for "Keep everything"
  Function un.pliageChoiceButton
    GetDlgItem $0 $HWNDPARENT 1
    ${If} $pliageChoice == 4
      SendMessage $0 ${WM_SETTEXT} 0 "STR:$(^CloseBtn)"
    ${Else}
      SendMessage $0 ${WM_SETTEXT} 0 "STR:$(^UninstallBtn)"
    ${EndIf}
  FunctionEnd

  Function un.pliageChoiceLeave
    ${If} $pliageChoice == 4
      Quit
    ${EndIf}
  FunctionEnd
!macroend

; The section name below MUST keep the "un." prefix ("-un.Pliage Data
; Cleanup"), even though it's hidden from the Components page by the
; leading "-". NSIS decides install-vs-uninstall purely by that "un."
; prefix on the section's name — independent of the BUILD_UNINSTALLER
; define electron-builder uses to pick which pass compiles this file.
; Without it, the section silently gets compiled into the *installer*
; side instead and never ships in uninstall.exe at all (verified directly
; with makensis: dropping "un." moves the section out of the "Uninstall:"
; count in the compiler's own summary, with no error or warning) — this is
; exactly how a previous build lost this feature without any visible sign.
;
; ${APP_FILENAME} is electron-builder's own build-time constant derived
; from productName ("Pliage") — same folder electron-builder's built-in
; deleteAppDataOnUninstall option would target, just asked interactively
; here instead of being an all-or-nothing build-time flag.
; The leading "-" makes this a hidden section that always runs
; automatically, with no Components-page checkbox to fail to select it from.
!macro customUnInstallSection
  Section "-un.Pliage Data Cleanup"
    ; ── Auto-update path: electron-updater runs uninstall.exe with --updated
    ; (and silently). An update must NEVER prompt or delete user data — the
    ; library-folder link and edited files have to survive it. Same intent as
    ; electron-builder's own `${ifNot} ${isUpdated}` guard; checked here via
    ; the raw flag (${GetParameters}/${GetOptions} are already used a few
    ; lines up in uninstaller.nsh, so they're guaranteed available). A plain
    ; `/S` uninstall is treated the same — keep everything. ────────────────
    ClearErrors
    ${GetParameters} $R0
    ${GetOptions} $R0 "--updated" $R1
    ${IfNot} ${Errors}
      Goto pliage_end
    ${EndIf}
    IfSilent pliage_end

    ; ── Electron user data is ALWAYS per-user: %APPDATA%\Pliage, i.e.
    ; C:\Users\<name>\AppData\Roaming\Pliage (electron/main.ts's app.setName).
    ; Pliage installs per-user (nsis.perMachine:false), so this uninstaller
    ; runs unelevated as the right user and $APPDATA is already correct — the
    ; explicit `current` here is belt-and-braces (it also keeps this working
    ; if perMachine is ever turned back on, where the elevated context would
    ; otherwise default to "all" → $APPDATA = C:\ProgramData → RMDir misses
    ; the real folder, which is the bug this whole block once had). ────────
    SetShellVarContext current
    StrCpy $R2 "$APPDATA\${APP_FILENAME}"

    ; What the choice page asked for (see un.pliageChoicePage above); 4 never gets
    ; here (it quits on that page), and 3 or none keeps everything
    ${If} $pliageChoice == 1
      Goto pliage_delete_all
    ${ElseIf} $pliageChoice != 2
      Goto pliage_restore_context
    ${EndIf}

    ; Keep my edited files — the fallback Demo/ (no library folder configured)
    ; is the only place inside %APPDATA%\Pliage user edits can exist — current demo
    ; content is flat (public/demo has no subfolders), so Demo\Pliage is the
    ; single fixed depth to check; revisit if demo content ever grows
    ; subfolders (copyDemoFilesRecursive already preserves those).
    ; Demo\Orfeo is the same folder from before the rename, copied in on first start.
    IfFileExists "$R2\Demo\Orfeo\*.*" 0 +3
      CreateDirectory "$DESKTOP\Pliage Edited Files"
      CopyFiles /SILENT "$R2\Demo\Orfeo\*.*" "$DESKTOP\Pliage Edited Files"
    IfFileExists "$R2\Demo\Pliage\*.*" 0 pliage_delete_all
      CreateDirectory "$DESKTOP\Pliage Edited Files"
      CopyFiles /SILENT "$R2\Demo\Pliage\*.*" "$DESKTOP\Pliage Edited Files"

    pliage_delete_all:
    ; Loose prefs/log files first and by name — even if a locked cache
    ; subdirectory (Local Storage LOCK, GPUCache) makes the recursive RMDir
    ; below skip files and leave the folder behind, the library link is
    ; still gone and the next launch is a clean first run.
    Delete "$R2\pliage-prefs.json"
    Delete "$R2\pliage-file-log.json"
    RMDir /r "$R2"

    ; Never a silent failure again — if the prefs file is somehow still
    ; there, say so, with the exact path, so it can be removed by hand.
    IfFileExists "$R2\pliage-prefs.json" 0 pliage_restore_context
      MessageBox MB_OK|MB_ICONEXCLAMATION "Pliage could not delete its settings file:$\r$\n$R2\pliage-prefs.json$\r$\n$\r$\nSomething still has it locked (antivirus, or a background process). Delete that folder by hand and Pliage will start fresh next time."

    pliage_restore_context:
    ${If} $installMode == "all"
      SetShellVarContext all
    ${EndIf}

    pliage_end:
  SectionEnd

  ; ── Verify $INSTDIR actually got removed — electron-builder's own uninstall
  ; section already kills every Pliage.exe process by image name (main window,
  ; GPU/renderer/utility helpers — see app-builder-lib's _CHECK_APP_RUNNING)
  ; before running RMDir /r $INSTDIR, but that RMDir has no error checking of
  ; its own: if anything still had a file open at that exact instant — a
  ; helper process whose handle hadn't released yet, a real-time antivirus
  ; scan touching the folder — NSIS silently skips the locked file(s) and
  ; reports uninstall success anyway, leaving a non-empty $INSTDIR behind
  ; with zero indication of why. This runs after that section (it's declared
  ; later in the same compiled script — see the "un." section-ordering note
  ; above), retries a couple of times (a just-released process handle is the
  ; single most common transient cause), then tells the user exactly what's
  ; left instead of staying silent about it. ─────────────────────────────────
  Section "-un.Pliage Verify Install Dir Removed"
    IfFileExists "$INSTDIR\*.*" 0 pliage_instdir_gone
      Sleep 500
      RMDir /r "$INSTDIR"
    IfFileExists "$INSTDIR\*.*" 0 pliage_instdir_gone
      Sleep 1000
      RMDir /r "$INSTDIR"
    IfFileExists "$INSTDIR\*.*" 0 pliage_instdir_gone
      MessageBox MB_OK|MB_ICONEXCLAMATION "Some files in:$\r$\n$INSTDIR$\r$\n$\r$\ncould not be removed — likely still in use by another process (or an antivirus scan). You can safely delete this folder manually once nothing has it open."
    pliage_instdir_gone:
  SectionEnd
!macroend
