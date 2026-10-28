// Exercise real Win32 controls and the production skin; no files are installed.
#include "skin.cpp"
#include <cstdio>
#include <cstdlib>

namespace {
void Check(bool condition, const char* message) {
  if (!condition) {
    std::fprintf(stderr, "FAIL: %s\n", message);
    std::exit(1);
  }
}

void CheckOwnerDraw(HWND button) {
  Check((GetWindowLongPtr(button, GWL_STYLE) & BS_TYPEMASK) == BS_OWNERDRAW,
        "navigation reset a skinned push button to the Windows style");
}

bool messageBoxChecked{};
void CALLBACK CheckMessageBox(HWND, UINT, UINT_PTR timer, DWORD) {
  const auto window = GetLastActivePopup(installerWindow);
  if (window == installerWindow) return;
  KillTimer(nullptr, timer);
  Check(GetProp(window, messageBoxProperty) != nullptr, "native error dialog was not skinned");
  const auto state = reinterpret_cast<MessageBoxState*>(GetProp(window, messageBoxProperty));
  Check(IsWindow(state->primary) && GetParent(state->primary) == window,
        "error dialog primary button is missing");
  for (int id = IDOK; id <= IDCONTINUE; ++id)
    if (const auto button = GetDlgItem(window, id)) CheckOwnerDraw(button);
  Check(reinterpret_cast<HBRUSH>(SendMessage(window, WM_CTLCOLORDLG, 0, 0)) == dialogBackground,
        "error dialog did not use the installer background");
  messageBoxChecked = true;
  EndDialog(window, IDOK);
}

DWORD WINAPI CheckWorkerDialog(void*) {
  WatchDialogs(nullptr, 0, nullptr, nullptr, nullptr);
  Check(messageBoxHook != nullptr, "installation worker has no error-dialog hook");
  const auto timer = SetTimer(nullptr, 0, 80, CheckMessageBox);
  Check(timer != 0, "could not schedule the worker-dialog check");
  MessageBox(installerWindow, L"Worker error dialog regression check", L"Screen Launcher", MB_RETRYCANCEL);
  UnhookWindowsHookEx(messageBoxHook);
  messageBoxHook = nullptr;
  return 0;
}
}

int main() {
  INITCOMMONCONTROLSEX controls{sizeof(controls), ICC_PROGRESS_CLASS};
  InitCommonControlsEx(&controls);
  const auto root = CreateWindowEx(0, L"#32770", L"Installer skin regression check", WS_POPUP,
                                    0, 0, 720, 528, nullptr, nullptr, nullptr, nullptr);
  Check(root != nullptr, "could not create the test dialog");
  const auto back = CreateWindowEx(0, L"BUTTON", L"Back", WS_CHILD | BS_PUSHBUTTON,
                                   0, 0, 92, 36, root, reinterpret_cast<HMENU>(3), nullptr, nullptr);
  const auto next = CreateWindowEx(0, L"BUTTON", L"Next", WS_CHILD | BS_DEFPUSHBUTTON,
                                   0, 0, 130, 36, root, reinterpret_cast<HMENU>(IDOK), nullptr, nullptr);
  const auto cancel = CreateWindowEx(0, L"BUTTON", L"Cancel", WS_CHILD | BS_PUSHBUTTON,
                                     0, 0, 100, 36, root, reinterpret_cast<HMENU>(IDCANCEL), nullptr, nullptr);
  const auto toggle = CreateWindowEx(0, L"BUTTON", L"Shortcut", WS_CHILD | BS_AUTOCHECKBOX,
                                     0, 0, 200, 30, root, nullptr, nullptr, nullptr);
  Apply(root, 0, nullptr, nullptr, nullptr);

  for (int iteration = 0; iteration < 20; ++iteration) {
    for (const auto button : {back, next}) {
      SendMessage(button, BM_SETSTYLE, BS_DEFPUSHBUTTON, TRUE);
      CheckOwnerDraw(button);
      SendMessage(button, BM_SETSTYLE, BS_PUSHBUTTON, TRUE);
      CheckOwnerDraw(button);
      SendMessage(root, DM_SETDEFID, GetDlgCtrlID(button), 0);
      CheckOwnerDraw(button);
      Check(LOWORD(SendMessage(root, DM_GETDEFID, 0, 0)) == GetDlgCtrlID(button),
            "skinning broke the dialog's default-button navigation");
      SetWindowLongPtr(button, GWL_STYLE,
                       (GetWindowLongPtr(button, GWL_STYLE) & ~BS_TYPEMASK) | BS_DEFPUSHBUTTON);
      CheckOwnerDraw(button);
      EnableWindow(button, FALSE);
      EnableWindow(button, TRUE);
      CheckOwnerDraw(button);
    }
  }
  Check((GetWindowLongPtr(toggle, GWL_STYLE) & BS_TYPEMASK) == BS_AUTOCHECKBOX,
        "checkbox lost its native interaction style");
  SendMessage(toggle, BM_SETCHECK, BST_CHECKED, 0);
  Check(SendMessage(toggle, BM_GETCHECK, 0, 0) == BST_CHECKED, "checkbox state no longer works");

  const auto progress = CreateWindowEx(0, PROGRESS_CLASS, L"", WS_CHILD,
                                       0, 0, 100, 5, root, nullptr, nullptr, nullptr);
  const auto label = CreateWindowEx(0, L"STATIC", L"0%", WS_CHILD,
                                    0, 0, 100, 30, root, nullptr, nullptr, nullptr);
  const auto tracking = new ProgressState{label};
  SetWindowSubclass(progress, DialogProc, progressId, reinterpret_cast<DWORD_PTR>(tracking));
  SetTimer(progress, progressId, 80, ProgressTimer);
  StopProgressTracking(progress);
  StopProgressTracking(progress);
  SetWindowText(label, L"!");
  ProgressTimer(progress, 0, progressId, 0);
  wchar_t caption[8]{};
  GetWindowText(label, caption, static_cast<int>(std::size(caption)));
  Check(wcscmp(caption, L"!") == 0, "progress timer overwrote the failed-install state");

  installerWindow = root;
  messageBoxHook = SetWindowsHookEx(WH_CBT, MessageBoxHook, nullptr, GetCurrentThreadId());
  Check(messageBoxHook != nullptr, "could not watch installer error dialogs");
  for (const auto type : {MB_OK, MB_OKCANCEL, MB_RETRYCANCEL, MB_ABORTRETRYIGNORE}) {
    messageBoxChecked = false;
    const auto timer = SetTimer(nullptr, 0, 80, CheckMessageBox);
    Check(timer != 0, "could not schedule the message-box check");
    MessageBox(root, L"Installer error dialog regression check", L"Screen Launcher", type);
    Check(messageBoxChecked, "message-box check did not run");
  }
  messageBoxChecked = false;
  const auto worker = CreateThread(nullptr, 0, CheckWorkerDialog, nullptr, 0, nullptr);
  Check(worker != nullptr, "could not create an installation worker");
  while (MsgWaitForMultipleObjects(1, &worker, FALSE, 5000, QS_ALLINPUT) == WAIT_OBJECT_0 + 1) {
    MSG message{};
    while (PeekMessage(&message, nullptr, 0, 0, PM_REMOVE)) DispatchMessage(&message);
  }
  Check(WaitForSingleObject(worker, 0) == WAIT_OBJECT_0, "worker-dialog check timed out");
  CloseHandle(worker);
  Check(messageBoxChecked, "worker dialog was not checked");

  // The NSIS engine updates buttons after the instfiles leave callback.
  auto chrome = new ChromeState;
  chrome->background = CreateSolidBrush(bg);
  SetProp(root, chromeProperty, chrome);
  Failed(root, 0, nullptr, nullptr, nullptr);
  for (const auto button : {back, next}) ShowWindow(button, SW_SHOW);
  SetWindowText(cancel, L"Cancel");
  MSG message{};
  while (PeekMessage(&message, root, 0, 0, PM_REMOVE)) DispatchMessage(&message);
  for (const auto button : {back, next}) {
    Check((GetWindowLongPtr(button, GWL_STYLE) & WS_VISIBLE) == 0,
          "native completion restored navigation on the failed-install page");
  }
  GetWindowText(cancel, caption, static_cast<int>(std::size(caption)));
  Check(wcscmp(caption, L"Закрыть") == 0, "native completion reset the failed-install Close caption");
  CheckOwnerDraw(cancel);
  UnhookWindowsHookEx(messageBoxHook);
  messageBoxHook = nullptr;
  installerWindow = nullptr;
  DestroyWindow(root);
  std::puts("PASS: navigation/default styles, checkbox state, failed progress/actions, native error dialogs");
}
