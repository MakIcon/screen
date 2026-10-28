; Real NSIS pages with a small, locally built drawing plugin.
; The native installation section and its progress bar remain authoritative.
!include nsDialogs.nsh
!include WinMessages.nsh
!addplugindir "${SCREEN_NSIS_DIR}\..\target\nsis-skin"

!define SCREEN_BG F8F7F2
!define SCREEN_INK 24231F
!define SCREEN_MUTED 706D65
!define SCREEN_ACCENT C2410C
!define MUI_BGCOLOR "${SCREEN_BG}"
!define MUI_TEXTCOLOR "${SCREEN_INK}"
!define MUI_INSTFILESPAGE_PROGRESSBAR smooth
!define MUI_CUSTOMFUNCTION_GUIINIT ScreenGUIInit
!define MUI_CUSTOMFUNCTION_UNGUIINIT un.ScreenGUIInit

Var ScreenDpi
Var ScreenDialog
Var ScreenControl
Var ScreenBodyFont
Var ScreenTitleFont
Var ScreenBrandFont
Var ScreenSmallFont
Var ScreenPercentFont
Var ScreenFooter
Var ScreenPath
Var ScreenDesktop
Var ScreenDesktopChoice
Var ScreenRun
Var ScreenProgress
Var ScreenProgressTitle
Var ScreenPercent
Var ScreenX
Var ScreenY
Var ScreenW
Var ScreenH

; Coordinates are logical pixels at 96 DPI; use the window's actual DPI.
!macro ScreenMove HANDLE X Y W H
  IntOp $ScreenX ${X} * $ScreenDpi
  IntOp $ScreenX $ScreenX / 96
  IntOp $ScreenY ${Y} * $ScreenDpi
  IntOp $ScreenY $ScreenY / 96
  IntOp $ScreenW ${W} * $ScreenDpi
  IntOp $ScreenW $ScreenW / 96
  IntOp $ScreenH ${H} * $ScreenDpi
  IntOp $ScreenH $ScreenH / 96
  System::Call 'user32::MoveWindow(p ${HANDLE}, i $ScreenX, i $ScreenY, i $ScreenW, i $ScreenH, i 1)'
!macroend

!macro ScreenNativeLabel X Y W H TEXT FONT COLOR
  System::Call 'user32::CreateWindowEx(i 0, w "STATIC", w "${TEXT}", i 0x50000000, i 0, i 0, i 1, i 1, p $ScreenDialog, p 0, p 0, p 0) p .s'
  Pop $ScreenControl
  !insertmacro ScreenMove $ScreenControl ${X} ${Y} ${W} ${H}
  SendMessage $ScreenControl ${WM_SETFONT} ${FONT} 1
  SetCtlColors $ScreenControl "${COLOR}" "${SCREEN_BG}"
!macroend

!macro ScreenLabel X Y W H TEXT FONT COLOR
  ${NSD_CreateLabel} 0 0 1 1 "${TEXT}"
  Pop $ScreenControl
  !insertmacro ScreenMove $ScreenControl ${X} ${Y} ${W} ${H}
  SendMessage $ScreenControl ${WM_SETFONT} ${FONT} 1
  SetCtlColors $ScreenControl "${COLOR}" "${SCREEN_BG}"
!macroend

!macro ScreenSharedChrome PREFIX ACTION
Function ${PREFIX}ScreenGUIInit
  SetAutoClose true
  System::Call 'user32::GetDpiForWindow(p $HWNDPARENT) i .s'
  Pop $ScreenDpi
  ${IfThen} $ScreenDpi = 0 ${|} StrCpy $ScreenDpi 96 ${|}
  CreateFont $ScreenBodyFont "Segoe UI" 10
  CreateFont $ScreenSmallFont "Segoe UI" 9
  CreateFont $ScreenTitleFont "Segoe UI" 28 600
  CreateFont $ScreenBrandFont "Segoe UI" 14 600
  CreateFont $ScreenPercentFont "Segoe UI" 42 400

  SetCtlColors $HWNDPARENT "${SCREEN_INK}" "${SCREEN_BG}"
  ; One shared frame for installation and removal, including accessible caption
  ; buttons, a draggable header, and a common baseline for brand/version text.
  ScreenSkin::Decorate /NOUNLOAD "${ACTION}" "${VERSION}" "$ScreenBrandFont" "$ScreenSmallFont"
  System::Call 'user32::CreateWindowEx(i 0, w "STATIC", w "", i 0x50000000, i 0, i 0, i 1, i 1, p $HWNDPARENT, p 0, p 0, p 0) p .s'
  Pop $ScreenFooter
  !insertmacro ScreenMove $ScreenFooter 32 468 280 36
  SendMessage $ScreenFooter ${WM_SETFONT} $ScreenSmallFont 1
  SetCtlColors $ScreenFooter "${SCREEN_MUTED}" "${SCREEN_BG}"
  ScreenSkin::CenterLabel /NOUNLOAD "$ScreenFooter"
  Call ${PREFIX}ScreenChrome
  ScreenSkin::Apply /NOUNLOAD
FunctionEnd

Function ${PREFIX}ScreenChrome
  System::Call 'user32::GetDpiForWindow(p $HWNDPARENT) i .s'
  Pop $ScreenDpi
  ; Hide the stock MUI header, branding strip and separators on every page.
  GetDlgItem $ScreenControl $HWNDPARENT 1034
  ShowWindow $ScreenControl 0
  GetDlgItem $ScreenControl $HWNDPARENT 1037
  ShowWindow $ScreenControl 0
  GetDlgItem $ScreenControl $HWNDPARENT 1038
  ShowWindow $ScreenControl 0
  GetDlgItem $ScreenControl $HWNDPARENT 1039
  ShowWindow $ScreenControl 0
  GetDlgItem $ScreenControl $HWNDPARENT 1028
  ShowWindow $ScreenControl 0
  GetDlgItem $ScreenControl $HWNDPARENT 1256
  ShowWindow $ScreenControl 0
  GetDlgItem $ScreenControl $HWNDPARENT 1035
  ShowWindow $ScreenControl 0
  GetDlgItem $ScreenControl $HWNDPARENT 1045
  ShowWindow $ScreenControl 0
  GetDlgItem $ScreenControl $HWNDPARENT 1036
  ShowWindow $ScreenControl 0
  GetDlgItem $ScreenControl $HWNDPARENT 3
  !insertmacro ScreenMove $ScreenControl 350 468 92 36
  SendMessage $ScreenControl ${WM_SETFONT} $ScreenBodyFont 1
  SendMessage $ScreenControl ${WM_SETTEXT} 0 "STR:Назад"
  GetDlgItem $ScreenControl $HWNDPARENT 2
  !insertmacro ScreenMove $ScreenControl 450 468 100 36
  SendMessage $ScreenControl ${WM_SETFONT} $ScreenBodyFont 1
  SendMessage $ScreenControl ${WM_SETTEXT} 0 "STR:Отмена"
  GetDlgItem $ScreenControl $HWNDPARENT 1
  !insertmacro ScreenMove $ScreenControl 558 468 130 36
  SendMessage $ScreenControl ${WM_SETFONT} $ScreenBodyFont 1
FunctionEnd
!macroend
!insertmacro ScreenSharedChrome "" "УСТАНОВКА"
!insertmacro ScreenSharedChrome "un." "УДАЛЕНИЕ"

Function ScreenCreatePage
  Call SkipIfPassive
  nsDialogs::Create 1018
  Pop $ScreenDialog
  ${If} $ScreenDialog == error
    Abort
  ${EndIf}
  Call ScreenChrome
  !insertmacro ScreenMove $ScreenDialog 32 112 656 322
  SetCtlColors $ScreenDialog "${SCREEN_INK}" "${SCREEN_BG}"
FunctionEnd

Function ScreenWelcome
  Call ScreenCreatePage
  !insertmacro ScreenLabel 0 0 650 110 "Всё начинается$\r$\nс одного запуска." $ScreenTitleFont "${SCREEN_INK}"
  !insertmacro ScreenLabel 0 134 580 56 "Установим ScreenLauncher — и можно играть.$\r$\nВыберите папку, а остальное мы подготовим." $ScreenBodyFont "${SCREEN_MUTED}"
  !insertmacro ScreenLabel 0 252 650 48 "Одна установка. Дальше — тихие обновления." $ScreenBodyFont "${SCREEN_MUTED}"
  SendMessage $ScreenFooter ${WM_SETTEXT} 0 "STR:01 / 03     Начало"
  GetDlgItem $ScreenControl $HWNDPARENT 1
  SendMessage $ScreenControl ${WM_SETTEXT} 0 "STR:Продолжить"
  ScreenSkin::Apply /NOUNLOAD
  nsDialogs::Show
FunctionEnd

Function ScreenReinstallLayout
  Call ScreenChrome
  !insertmacro ScreenMove $R4 32 112 656 322
  SetCtlColors $R4 "${SCREEN_INK}" "${SCREEN_BG}"
  !insertmacro ScreenMove $R1 0 84 650 76
  SendMessage $R1 ${WM_SETFONT} $ScreenBodyFont 1
  SetCtlColors $R1 "${SCREEN_MUTED}" "${SCREEN_BG}"
  !insertmacro ScreenMove $R2 0 190 650 34
  SendMessage $R2 ${WM_SETFONT} $ScreenBodyFont 1
  SetCtlColors $R2 "${SCREEN_INK}" "${SCREEN_BG}"
  !insertmacro ScreenMove $R3 0 238 650 34
  SendMessage $R3 ${WM_SETFONT} $ScreenBodyFont 1
  SetCtlColors $R3 "${SCREEN_INK}" "${SCREEN_BG}"
  !insertmacro ScreenLabel 0 0 650 60 "Уже знакомы." $ScreenTitleFont "${SCREEN_INK}"
  SendMessage $ScreenFooter ${WM_SETTEXT} 0 "STR:01 / 03     Повторная установка"
  GetDlgItem $ScreenControl $HWNDPARENT 1
  SendMessage $ScreenControl ${WM_SETTEXT} 0 "STR:Продолжить"
  ScreenSkin::Apply /NOUNLOAD
FunctionEnd

Function ScreenOptions
  Call ScreenCreatePage
  !insertmacro ScreenLabel 0 0 650 60 "Устроим всё по-вашему." $ScreenTitleFont "${SCREEN_INK}"
  !insertmacro ScreenLabel 0 74 650 30 "Папка для лаунчера. Папку игры можно выбрать после запуска." $ScreenBodyFont "${SCREEN_MUTED}"
  !insertmacro ScreenLabel 0 124 600 26 "ПАПКА УСТАНОВКИ" $ScreenSmallFont "${SCREEN_MUTED}"
  ${NSD_CreateText} 0 0 1 1 "$INSTDIR"
  Pop $ScreenPath
  !insertmacro ScreenMove $ScreenPath 0 152 536 42
  SendMessage $ScreenPath ${WM_SETFONT} $ScreenBodyFont 1
  SetCtlColors $ScreenPath "${SCREEN_INK}" "FFFFFF"
  ${NSD_CreateBrowseButton} 0 0 1 1 "Изменить…"
  Pop $ScreenControl
  !insertmacro ScreenMove $ScreenControl 548 152 108 42
  SendMessage $ScreenControl ${WM_SETFONT} $ScreenBodyFont 1
  ${NSD_OnClick} $ScreenControl ScreenBrowse
  ${NSD_CreateCheckbox} 0 0 1 1 "Создать ярлык на рабочем столе"
  Pop $ScreenDesktop
  !insertmacro ScreenMove $ScreenDesktop 0 215 650 30
  SendMessage $ScreenDesktop ${WM_SETFONT} $ScreenBodyFont 1
  SetCtlColors $ScreenDesktop "${SCREEN_INK}" "${SCREEN_BG}"
  ${NSD_SetState} $ScreenDesktop $ScreenDesktopChoice
  !insertmacro ScreenLabel 0 276 650 32 "Установка только для вашей учётной записи Windows." $ScreenSmallFont "${SCREEN_MUTED}"
  SendMessage $ScreenFooter ${WM_SETTEXT} 0 "STR:02 / 03     Параметры"
  GetDlgItem $ScreenControl $HWNDPARENT 1
  SendMessage $ScreenControl ${WM_SETTEXT} 0 "STR:Установить"
  ScreenSkin::Apply /NOUNLOAD
  nsDialogs::Show
FunctionEnd

Function ScreenBrowse
  Pop $ScreenControl
  ${NSD_GetText} $ScreenPath $0
  nsDialogs::SelectFolderDialog "Куда установить ScreenLauncher?" "$0"
  Pop $0
  ${If} $0 != error
    ${NSD_SetText} $ScreenPath "$0"
  ${EndIf}
FunctionEnd

Function ScreenOptionsLeave
  ${NSD_GetText} $ScreenPath $0
  ${GetRoot} "$0" $1
  ${If} $0 == ""
  ${OrIf} $1 == ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "Укажите полный путь к папке установки."
    Abort
  ${EndIf}
  GetFullPathName $2 "$0"
  ${If} $2 == "$1\"
  ${OrIf} $2 == "$1"
    MessageBox MB_OK|MB_ICONEXCLAMATION "Выберите отдельную папку для ScreenLauncher, а не корень диска."
    Abort
  ${EndIf}
  System::Call 'kernel32::GetFileAttributes(w r2) i .r3'
  ${If} $3 != -1
    IntOp $3 $3 & 0x10
    ${If} $3 == 0
      MessageBox MB_OK|MB_ICONEXCLAMATION "По этому пути уже находится файл. Выберите папку."
      Abort
    ${EndIf}
  ${EndIf}
  StrCpy $INSTDIR $2
  ${NSD_GetState} $ScreenDesktop $ScreenDesktopChoice
FunctionEnd

!macro ScreenSharedProgress PREFIX TITLE FOOTER
Function ${PREFIX}ScreenInstallShow
  Call ${PREFIX}ScreenChrome
  FindWindow $ScreenDialog "#32770" "" $HWNDPARENT
  !insertmacro ScreenMove $ScreenDialog 32 112 656 322
  SetCtlColors $ScreenDialog "${SCREEN_INK}" "${SCREEN_BG}"
  GetDlgItem $ScreenControl $ScreenDialog 1006
  !insertmacro ScreenMove $ScreenControl 0 130 650 26
  SendMessage $ScreenControl ${WM_SETFONT} $ScreenSmallFont 1
  SetCtlColors $ScreenControl "${SCREEN_MUTED}" "${SCREEN_BG}"
  GetDlgItem $ScreenProgress $ScreenDialog 1004
  !insertmacro ScreenMove $ScreenProgress 0 184 656 5
  System::Call 'uxtheme::SetWindowTheme(p $ScreenProgress, w "", w "")'
  SendMessage $ScreenProgress 0x409 0 0x0C41C2
  SendMessage $ScreenProgress 0x2001 0 0xDDE5E8
  GetDlgItem $ScreenControl $ScreenDialog 1027
  !insertmacro ScreenMove $ScreenControl 0 214 150 30
  SendMessage $ScreenControl ${WM_SETFONT} $ScreenSmallFont 1
  SendMessage $ScreenControl ${WM_SETTEXT} 0 "STR:Подробности"
  GetDlgItem $ScreenControl $ScreenDialog 1016
  !insertmacro ScreenMove $ScreenControl 0 214 656 100
  System::Call 'uxtheme::SetWindowTheme(p $ScreenControl, w "", w "")'
  SendMessage $ScreenControl 0x1001 0 0xF2F7F8 ; LVM_SETBKCOLOR
  SendMessage $ScreenControl 0x1024 0 0x1F2324 ; LVM_SETTEXTCOLOR
  SendMessage $ScreenControl 0x1026 0 0xF2F7F8 ; LVM_SETTEXTBKCOLOR

  !insertmacro ScreenNativeLabel 0 0 490 104 "${TITLE}" $ScreenTitleFont "${SCREEN_INK}"
  StrCpy $ScreenProgressTitle $ScreenControl
  !insertmacro ScreenNativeLabel 500 36 156 80 "0%" $ScreenPercentFont "${SCREEN_INK}"
  StrCpy $ScreenPercent $ScreenControl
  SendMessage $ScreenFooter ${WM_SETTEXT} 0 "STR:${FOOTER}"
  ScreenSkin::TrackProgress /NOUNLOAD "$ScreenProgress" "$ScreenPercent"
  ScreenSkin::Apply /NOUNLOAD
FunctionEnd
!macroend
!insertmacro ScreenSharedProgress "" "Немного терпения.$\r$\nПочти на месте." "03 / 03     Установка"
!insertmacro ScreenSharedProgress "un." "Немного терпения.$\r$\nУдаляем лаунчер." "Удаление"

!macro ScreenSharedFailure PREFIX TITLE FOOTER
Function ${PREFIX}ScreenInstallLeave
  ; The instfiles leave callback runs as soon as installation finishes/aborts.
  ; .onInstFailed runs only when the user subsequently closes the failed wizard.
  IfAbort 0 done
  Call ${PREFIX}ScreenInstallFailed
  done:
FunctionEnd

Function ${PREFIX}ScreenInstallFailed
  SetAutoClose false
  ScreenSkin::StopProgress /NOUNLOAD "$ScreenProgress"
  SendMessage $ScreenProgressTitle ${WM_SETTEXT} 0 "STR:${TITLE}"
  SendMessage $ScreenPercent ${WM_SETTEXT} 0 "STR:!"
  SendMessage $ScreenFooter ${WM_SETTEXT} 0 "STR:${FOOTER}"
  SetDetailsView show
  GetDlgItem $ScreenControl $ScreenDialog 1027
  ShowWindow $ScreenControl 0
  GetDlgItem $ScreenControl $HWNDPARENT 3
  ShowWindow $ScreenControl 0
  GetDlgItem $ScreenControl $HWNDPARENT 1
  ShowWindow $ScreenControl 0
  GetDlgItem $ScreenControl $HWNDPARENT 2
  EnableWindow $ScreenControl 1
  SendMessage $ScreenControl ${WM_SETTEXT} 0 "STR:Закрыть"
  ScreenSkin::Failed /NOUNLOAD
  ScreenSkin::Apply /NOUNLOAD
FunctionEnd
!macroend
!insertmacro ScreenSharedFailure "" "Установка$\r$\nпрервана." "Не удалось завершить установку"
!insertmacro ScreenSharedFailure "un." "Удаление$\r$\nпрервано." "Не удалось завершить удаление"

Function ScreenFinish
  Call ScreenCreatePage
  !insertmacro ScreenLabel 0 0 650 110 "Всё готово.$\r$\nМожно запускать." $ScreenTitleFont "${SCREEN_INK}"
  !insertmacro ScreenLabel 0 134 650 54 "ScreenLauncher установлен.$\r$\nСледующие обновления загрузятся автоматически." $ScreenBodyFont "${SCREEN_MUTED}"
  ${NSD_CreateCheckbox} 0 0 1 1 "Запустить ScreenLauncher"
  Pop $ScreenRun
  !insertmacro ScreenMove $ScreenRun 0 240 650 30
  SendMessage $ScreenRun ${WM_SETFONT} $ScreenBodyFont 1
  SetCtlColors $ScreenRun "${SCREEN_INK}" "${SCREEN_BG}"
  ${NSD_Check} $ScreenRun
  SendMessage $ScreenFooter ${WM_SETTEXT} 0 "STR:03 / 03     Готово"
  GetDlgItem $ScreenControl $HWNDPARENT 3
  ShowWindow $ScreenControl 0
  GetDlgItem $ScreenControl $HWNDPARENT 2
  ShowWindow $ScreenControl 0
  GetDlgItem $ScreenControl $HWNDPARENT 1
  SendMessage $ScreenControl ${WM_SETTEXT} 0 "STR:Готово"
  ScreenSkin::Apply /NOUNLOAD
  nsDialogs::Show
FunctionEnd

Function ScreenFinishLeave
  ${NSD_GetState} $ScreenRun $0
  ${If} $0 == ${BST_CHECKED}
    Call RunMainBinary
  ${EndIf}
FunctionEnd

Function un.ScreenCreatePage
  Call un.SkipIfPassive
  nsDialogs::Create 1018
  Pop $ScreenDialog
  ${If} $ScreenDialog == error
    Abort
  ${EndIf}
  Call un.ScreenChrome
  !insertmacro ScreenMove $ScreenDialog 32 112 656 322
  SetCtlColors $ScreenDialog "${SCREEN_INK}" "${SCREEN_BG}"
FunctionEnd

Function un.ScreenConfirm
  Call un.ScreenCreatePage
  !insertmacro ScreenLabel 0 0 650 110 "Удалить$\r$\nScreenLauncher?" $ScreenTitleFont "${SCREEN_INK}"
  !insertmacro ScreenLabel 0 134 650 54 "Лаунчер будет удалён с этого компьютера.$\r$\nВы сможете установить его снова в любое время." $ScreenBodyFont "${SCREEN_MUTED}"
  !insertmacro ScreenLabel 0 198 650 24 "ПАПКА ЛАУНЧЕРА" $ScreenSmallFont "${SCREEN_MUTED}"
  ${NSD_CreateText} 0 0 1 1 "$INSTDIR"
  Pop $ScreenPath
  !insertmacro ScreenMove $ScreenPath 0 226 656 42
  SendMessage $ScreenPath ${WM_SETFONT} $ScreenBodyFont 1
  SendMessage $ScreenPath ${EM_SETREADONLY} 1 0
  SetCtlColors $ScreenPath "${SCREEN_INK}" "FFFFFF"
  ${NSD_CreateCheckbox} 0 0 1 1 "Также удалить настройки и данные лаунчера"
  Pop $DeleteAppDataCheckbox
  !insertmacro ScreenMove $DeleteAppDataCheckbox 0 282 650 32
  SendMessage $DeleteAppDataCheckbox ${WM_SETFONT} $ScreenBodyFont 1
  SetCtlColors $DeleteAppDataCheckbox "${SCREEN_INK}" "${SCREEN_BG}"
  ${NSD_SetState} $DeleteAppDataCheckbox $DeleteAppDataCheckboxState
  SendMessage $ScreenFooter ${WM_SETTEXT} 0 "STR:Удаление"
  GetDlgItem $ScreenControl $HWNDPARENT 1
  SendMessage $ScreenControl ${WM_SETTEXT} 0 "STR:Удалить"
  ScreenSkin::Apply /NOUNLOAD
  nsDialogs::Show
FunctionEnd

Function un.ScreenConfirmLeave
  ${NSD_GetState} $DeleteAppDataCheckbox $DeleteAppDataCheckboxState
FunctionEnd

Function un.ScreenFinish
  Call un.ScreenCreatePage
  !insertmacro ScreenLabel 0 0 650 110 "До новой$\r$\nвстречи." $ScreenTitleFont "${SCREEN_INK}"
  !insertmacro ScreenLabel 0 134 650 54 "ScreenLauncher удалён с этого компьютера." $ScreenBodyFont "${SCREEN_MUTED}"
  SendMessage $ScreenFooter ${WM_SETTEXT} 0 "STR:Готово"
  GetDlgItem $ScreenControl $HWNDPARENT 3
  ShowWindow $ScreenControl 0
  GetDlgItem $ScreenControl $HWNDPARENT 2
  ShowWindow $ScreenControl 0
  GetDlgItem $ScreenControl $HWNDPARENT 1
  SendMessage $ScreenControl ${WM_SETTEXT} 0 "STR:Готово"
  ScreenSkin::Apply /NOUNLOAD
  nsDialogs::Show
FunctionEnd
