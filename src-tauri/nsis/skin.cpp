// ScreenLauncher NSIS skin. Drawing only: native controls keep their keyboard,
// accessibility and checked-state behavior. No installer decisions live here.
#define UNICODE
#define _UNICODE
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <commctrl.h>
#include <uxtheme.h>
#include <objidl.h>
#include <propidl.h>
#include <gdiplus.h>
#include <dwmapi.h>
#include <algorithm>
#include <cwchar>

namespace {
constexpr COLORREF bg = RGB(248, 247, 242);
constexpr COLORREF ink = RGB(36, 35, 31);
constexpr COLORREF muted = RGB(112, 109, 101);
constexpr COLORREF accent = RGB(194, 65, 12);
constexpr COLORREF border = RGB(220, 216, 205);
constexpr UINT_PTR skinId = 0x5343524E;
constexpr UINT_PTR progressId = 0x53435052;
constexpr wchar_t hoverProperty[] = L"ScreenLauncher.Hover";
constexpr wchar_t editProperty[] = L"ScreenLauncher.Input";
constexpr wchar_t chromeProperty[] = L"ScreenLauncher.Chrome";
constexpr wchar_t messageBoxProperty[] = L"ScreenLauncher.MessageBox";
constexpr int minimizeId = 0x5C01;
constexpr int closeId = 0x5C02;
constexpr int headerLineId = 0x5C03;
constexpr int footerLineId = 0x5C04;
constexpr UINT_PTR chromeTimerId = 0x53434348;
constexpr UINT failureMessage = WM_APP + 0x534;
ULONG_PTR graphicsToken{};
HWND installerWindow{};
thread_local HHOOK messageBoxHook{};
HBRUSH dialogBackground{};
struct Stack { Stack* next; wchar_t text[1]; };
struct ProgressState { HWND label; };
struct MessageBoxState {
  HWND primary;
  HWND close;
};
struct ChromeState {
  bool failed{};
  HWND brand{};
  HWND version{};
  HWND minimize{};
  HWND close{};
  HWND headerLine{};
  HWND footerLine{};
  HFONT brandFont{};
  HFONT smallFont{};
  HBRUSH background{};
};

struct FontInk {
  int lineHeight;
  int ascent;
  int top;
  int height;
};

FontInk MeasureFontInk(HDC dc) {
  TEXTMETRIC metrics{};
  GetTextMetrics(dc, &metrics);
  MAT2 identity{};
  identity.eM11.value = 1;
  identity.eM22.value = 1;
  GLYPHMETRICS glyph{};
  const auto measured = GetGlyphOutline(dc, L'H', GGO_METRICS, &glyph, 0, nullptr, &identity);
  if (measured == GDI_ERROR || !glyph.gmBlackBoxY)
    return {metrics.tmHeight, metrics.tmAscent, 0, metrics.tmHeight};
  return {metrics.tmHeight, metrics.tmAscent, metrics.tmAscent - glyph.gmptGlyphOrigin.y,
          static_cast<int>(glyph.gmBlackBoxY)};
}

int Scale(HWND window, int value) {
  return MulDiv(value, static_cast<int>(GetDpiForWindow(window)), 96);
}

void Round(HDC dc, RECT rect, COLORREF fill, COLORREF outline, int radius, int stroke) {
  auto brush = CreateSolidBrush(fill);
  auto pen = CreatePen(PS_SOLID, stroke, outline);
  auto oldBrush = SelectObject(dc, brush);
  auto oldPen = SelectObject(dc, pen);
  const int inset = stroke / 2;
  RoundRect(dc, rect.left + inset, rect.top + inset, rect.right - inset, rect.bottom - inset, radius, radius);
  SelectObject(dc, oldPen);
  SelectObject(dc, oldBrush);
  DeleteObject(pen);
  DeleteObject(brush);
}

void Text(HWND window, HDC dc, RECT rect, COLORREF color, UINT flags) {
  wchar_t caption[1024]{};
  GetWindowText(window, caption, static_cast<int>(std::size(caption)));
  auto old = SelectObject(dc, reinterpret_cast<HFONT>(SendMessage(window, WM_GETFONT, 0, 0)));
  SetBkMode(dc, TRANSPARENT);
  SetTextColor(dc, color);
  if (flags & DT_VCENTER) {
    const auto font = MeasureFontInk(dc);
    // Align the visible letter shapes, rather than the font's invisible
    // ascender/descender padding. Icons and text share this same centre line.
    rect.top += (rect.bottom - rect.top - font.height) / 2 - font.top;
    flags = (flags & ~DT_VCENTER) | DT_TOP;
  }
  DrawText(dc, caption, -1, &rect, flags);
  if (old) SelectObject(dc, old);
}

void DrawPushButton(const DRAWITEMSTRUCT& item) {
  const auto window = item.hwndItem;
  const auto parent = GetParent(window);
  const auto messageBox = reinterpret_cast<MessageBoxState*>(GetProp(parent, messageBoxProperty));
  const auto chrome = reinterpret_cast<ChromeState*>(GetProp(parent, chromeProperty));
  const bool primary = messageBox ? window == messageBox->primary
                                 : GetDlgCtrlID(window) == (chrome && chrome->failed ? IDCANCEL : IDOK) &&
                                   parent == GetAncestor(window, GA_ROOT);
  const bool disabled = (item.itemState & ODS_DISABLED) != 0;
  const bool pressed = (item.itemState & ODS_SELECTED) != 0;
  const bool hovered = GetProp(window, hoverProperty) != nullptr;
  if (GetDlgCtrlID(window) == minimizeId || GetDlgCtrlID(window) == closeId) {
    const bool close = GetDlgCtrlID(window) == closeId;
    const auto fill = hovered && !disabled ? close ? RGB(181, 54, 36) : RGB(232, 229, 219) : bg;
    const auto brush = CreateSolidBrush(fill);
    FillRect(item.hDC, &item.rcItem, brush);
    DeleteObject(brush);
    {
      Gdiplus::Graphics graphics(item.hDC);
      graphics.SetSmoothingMode(Gdiplus::SmoothingModeAntiAlias);
      Gdiplus::Pen pen(Gdiplus::Color(255,
          GetRValue(disabled ? border : hovered && close ? RGB(255, 255, 255) : ink),
          GetGValue(disabled ? border : hovered && close ? RGB(255, 255, 255) : ink),
          GetBValue(disabled ? border : hovered && close ? RGB(255, 255, 255) : ink)),
          static_cast<float>(Scale(window, 96)) / 96.0f * 1.4f);
      pen.SetStartCap(Gdiplus::LineCapRound);
      pen.SetEndCap(Gdiplus::LineCapRound);
      const float cx = static_cast<float>(item.rcItem.left + item.rcItem.right) / 2;
      const float cy = static_cast<float>(item.rcItem.top + item.rcItem.bottom) / 2;
      const float half = static_cast<float>(Scale(window, 5));
      if (close) {
        graphics.DrawLine(&pen, cx - half, cy - half, cx + half, cy + half);
        graphics.DrawLine(&pen, cx + half, cy - half, cx - half, cy + half);
      } else graphics.DrawLine(&pen, cx - half, cy, cx + half, cy);
    }
    if (item.itemState & ODS_FOCUS) {
      RECT focus = item.rcItem;
      InflateRect(&focus, -Scale(window, 5), -Scale(window, 5));
      DrawFocusRect(item.hDC, &focus);
    }
    return;
  }
  COLORREF fill = primary ? accent : bg;
  if (disabled) fill = primary ? RGB(210, 187, 172) : bg;
  else if (pressed) fill = primary ? RGB(153, 50, 9) : RGB(232, 229, 219);
  else if (hovered) fill = primary ? RGB(171, 54, 9) : RGB(239, 236, 227);
  auto background = CreateSolidBrush(bg);
  FillRect(item.hDC, &item.rcItem, background);
  DeleteObject(background);
  RECT rect = item.rcItem;
  Round(item.hDC, rect, fill, primary ? fill : border, Scale(window, 10), std::max(1, Scale(window, 1)));
  Text(window, item.hDC, rect, disabled ? muted : primary ? RGB(255, 255, 255) : ink,
       DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_HIDEPREFIX);
  if ((item.itemState & ODS_FOCUS) && !(item.itemState & ODS_NOFOCUSRECT)) {
    InflateRect(&rect, -Scale(window, 4), -Scale(window, 4));
    SetTextColor(item.hDC, primary ? RGB(255, 255, 255) : ink);
    DrawFocusRect(item.hDC, &rect);
  }
}

Gdiplus::Color Color(COLORREF color) {
  return Gdiplus::Color(255, GetRValue(color), GetGValue(color), GetBValue(color));
}

// The checkbox follows ElementCheckbox.css: a 16px square, one-pixel border,
// 10px label gap and a two-pixel check. Buffering keeps native repaint messages
// from flashing the stock glyph through the custom one.
void DrawToggle(HWND window, HDC target, bool radio) {
  RECT rect{};
  GetClientRect(window, &rect);
  auto dc = CreateCompatibleDC(target);
  auto bitmap = CreateCompatibleBitmap(target, std::max(1L, rect.right), std::max(1L, rect.bottom));
  auto oldBitmap = SelectObject(dc, bitmap);
  auto background = CreateSolidBrush(bg);
  FillRect(dc, &rect, background);
  DeleteObject(background);
  const bool checked = SendMessage(window, BM_GETCHECK, 0, 0) == BST_CHECKED;
  const bool disabled = !IsWindowEnabled(window);
  const bool hovered = GetProp(window, hoverProperty) != nullptr;
  const auto color = disabled ? border : checked || hovered ? accent : RGB(180, 175, 164);
  const float unit = static_cast<float>(Scale(window, 96)) / 96.0f;
  const float size = 16.0f * unit;
  const float left = 0;
  const float top = (static_cast<float>(rect.bottom) - size) / 2.0f;
  if (!radio) {
    // Keep axis-aligned CSS-style edges on whole pixels. Only the diagonal
    // check and circular radio need antialiasing; a blurred square looks broken.
    RECT square{0, (rect.bottom - Scale(window, 16)) / 2,
                Scale(window, 16), (rect.bottom - Scale(window, 16)) / 2 + Scale(window, 16)};
    const auto fill = CreateSolidBrush(checked ? color : RGB(255, 255, 255));
    const auto line = CreateSolidBrush(color);
    FillRect(dc, &square, fill);
    const int stroke = std::max(1, Scale(window, 1));
    RECT edge{square.left, square.top, square.right, square.top + stroke};
    FillRect(dc, &edge, line);
    edge = {square.left, square.bottom - stroke, square.right, square.bottom};
    FillRect(dc, &edge, line);
    edge = {square.left, square.top, square.left + stroke, square.bottom};
    FillRect(dc, &edge, line);
    edge = {square.right - stroke, square.top, square.right, square.bottom};
    FillRect(dc, &edge, line);
    DeleteObject(line);
    DeleteObject(fill);
  }
  {
    Gdiplus::Graphics graphics(dc);
    graphics.SetSmoothingMode(Gdiplus::SmoothingModeAntiAlias);
    graphics.SetPixelOffsetMode(Gdiplus::PixelOffsetModeHalf);
    Gdiplus::SolidBrush fill(Color(checked && !radio ? color : RGB(255, 255, 255)));
    Gdiplus::Pen outline(Color(color), unit);
    const Gdiplus::RectF box(left + unit / 2, top + unit / 2, size - unit, size - unit);
    if (radio) {
      graphics.FillEllipse(&fill, box);
      graphics.DrawEllipse(&outline, box);
      if (checked) {
        Gdiplus::SolidBrush dot(Color(color));
        graphics.FillEllipse(&dot, left + 5 * unit, top + 5 * unit, 6 * unit, 6 * unit);
      }
    } else {
      if (checked) {
        Gdiplus::Pen check(Color(RGB(255, 255, 255)), 2 * unit);
        check.SetStartCap(Gdiplus::LineCapRound);
        check.SetEndCap(Gdiplus::LineCapRound);
        check.SetLineJoin(Gdiplus::LineJoinRound);
        const Gdiplus::PointF points[] = {
          {left + 4 * unit, top + 8 * unit},
          {left + 7 * unit, top + 11 * unit},
          {left + 12 * unit, top + 5 * unit},
        };
        graphics.DrawLines(&check, points, 3);
      }
    }
    if (GetFocus() == window && !(SendMessage(window, WM_QUERYUISTATE, 0, 0) & UISF_HIDEFOCUS)) {
      Gdiplus::Pen focus(Color(ink), unit);
      const Gdiplus::RectF ring(left + 2 * unit, top + 2 * unit, size - 4 * unit, size - 4 * unit);
      if (radio) graphics.DrawEllipse(&focus, ring);
      else graphics.DrawRectangle(&focus, ring);
    }
  }
  RECT text = rect;
  text.left = Scale(window, 26);
  Text(window, dc, text, disabled ? muted : ink, DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_HIDEPREFIX);
  BitBlt(target, 0, 0, rect.right, rect.bottom, dc, 0, 0, SRCCOPY);
  SelectObject(dc, oldBitmap);
  DeleteObject(bitmap);
  DeleteDC(dc);
}

LRESULT CALLBACK ToggleProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam,
                            UINT_PTR id, DWORD_PTR radio) {
  if (message == WM_PAINT) {
    PAINTSTRUCT paint{};
    const auto dc = BeginPaint(window, &paint);
    DrawToggle(window, dc, radio != 0);
    EndPaint(window, &paint);
    return 0;
  }
  if (message == WM_PRINTCLIENT) { DrawToggle(window, reinterpret_cast<HDC>(wParam), radio != 0); return 0; }
  if (message == WM_ERASEBKGND) return 1;
  const auto result = DefSubclassProc(window, message, wParam, lParam);
  if (message == BM_SETCHECK || message == WM_ENABLE || message == WM_SETFOCUS ||
      message == WM_KILLFOCUS || message == WM_UPDATEUISTATE || message == WM_LBUTTONUP ||
      message == WM_KEYUP) InvalidateRect(window, nullptr, FALSE);
  if (message == WM_NCDESTROY) RemoveWindowSubclass(window, ToggleProc, id);
  return result;
}

// Match the launcher's text fields without replacing the editable native client:
// a flat one-pixel border, 12px horizontal padding and vertically centred text.
// Selection, IME, caret, shortcuts and accessibility stay with the EDIT control.
void PaintInputFrame(HWND window) {
  const auto dc = GetWindowDC(window);
  RECT bounds{}, client{};
  GetWindowRect(window, &bounds);
  GetClientRect(window, &client);
  POINT origin{0, 0};
  ClientToScreen(window, &origin);
  ExcludeClipRect(dc, origin.x - bounds.left, origin.y - bounds.top,
                 origin.x - bounds.left + client.right, origin.y - bounds.top + client.bottom);
  RECT frame{0, 0, bounds.right - bounds.left, bounds.bottom - bounds.top};
  auto brush = CreateSolidBrush(RGB(255, 255, 255));
  FillRect(dc, &frame, brush);
  DeleteObject(brush);
  const bool focused = GetFocus() == window;
  const int stroke = std::max(1, Scale(window, 1));
  const auto outline = CreatePen(PS_SOLID, stroke, focused ? ink : border);
  const auto previousPen = SelectObject(dc, outline);
  const auto previousBrush = SelectObject(dc, GetStockObject(NULL_BRUSH));
  const int inset = stroke / 2;
  Rectangle(dc, inset, inset, frame.right - inset, frame.bottom - inset);
  SelectObject(dc, previousBrush);
  SelectObject(dc, previousPen);
  DeleteObject(outline);
  ReleaseDC(window, dc);
}

LRESULT CALLBACK InputProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam,
                           UINT_PTR id, DWORD_PTR) {
  if (message == WM_NCCALCSIZE) {
    auto& rect = wParam ? reinterpret_cast<NCCALCSIZE_PARAMS*>(lParam)->rgrc[0]
                       : *reinterpret_cast<RECT*>(lParam);
    const auto dc = GetDC(window);
    const auto previous = SelectObject(dc, reinterpret_cast<HFONT>(SendMessage(window, WM_GETFONT, 0, 0)));
    const auto font = MeasureFontInk(dc);
    if (previous) SelectObject(dc, previous);
    ReleaseDC(window, dc);
    const int vertical = std::max(1, (static_cast<int>(rect.bottom - rect.top) - font.height) / 2 - font.top);
    const int horizontal = Scale(window, 12);
    rect.left += horizontal;
    rect.right = std::max(rect.left + 1, rect.right - horizontal);
    rect.top += vertical;
    rect.bottom = rect.top + font.lineHeight;
    return 0;
  }
  if (message == WM_NCPAINT) { PaintInputFrame(window); return 0; }
  const auto result = DefSubclassProc(window, message, wParam, lParam);
  if (message == WM_SETFOCUS || message == WM_KILLFOCUS || message == WM_ENABLE)
    RedrawWindow(window, nullptr, nullptr, RDW_FRAME | RDW_INVALIDATE | RDW_UPDATENOW);
  if (message == WM_NCDESTROY) {
    RemoveProp(window, editProperty);
    RemoveWindowSubclass(window, InputProc, id);
  }
  return result;
}

LRESULT CALLBACK HoverProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam,
                           UINT_PTR id, DWORD_PTR) {
  if (message == WM_MOUSEMOVE && !GetProp(window, hoverProperty)) {
    SetProp(window, hoverProperty, reinterpret_cast<HANDLE>(1));
    TRACKMOUSEEVENT track{sizeof(track), TME_LEAVE, window, 0};
    TrackMouseEvent(&track);
    InvalidateRect(window, nullptr, FALSE);
  } else if (message == WM_MOUSELEAVE) {
    RemoveProp(window, hoverProperty);
    InvalidateRect(window, nullptr, FALSE);
  } else if (message == WM_NCDESTROY) {
    RemoveProp(window, hoverProperty);
    RemoveWindowSubclass(window, HoverProc, id);
  }
  return DefSubclassProc(window, message, wParam, lParam);
}

LRESULT CALLBACK PushButtonProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam,
                                UINT_PTR id, DWORD_PTR) {
  const auto chrome = reinterpret_cast<ChromeState*>(GetProp(GetParent(window), chromeProperty));
  const auto controlId = GetDlgCtrlID(window);
  if (chrome) {
    if (message == WM_SETTEXT) {
      if (controlId == 3) lParam = reinterpret_cast<LPARAM>(L"Назад");
      if (chrome->failed && controlId == IDCANCEL) lParam = reinterpret_cast<LPARAM>(L"Закрыть");
    }
  }
  // Dialog navigation changes the default button with BM_SETSTYLE. Letting that
  // replace BS_OWNERDRAW makes Back/Next fall back to the stock Windows button.
  if (message == BM_SETSTYLE) wParam = (wParam & ~BS_TYPEMASK) | BS_OWNERDRAW;
  if (message == WM_STYLECHANGING && wParam == static_cast<WPARAM>(GWL_STYLE)) {
    const auto style = reinterpret_cast<STYLESTRUCT*>(lParam);
    style->styleNew = (style->styleNew & ~BS_TYPEMASK) | BS_OWNERDRAW;
  }
  const auto result = DefSubclassProc(window, message, wParam, lParam);
  if (message == BM_SETSTYLE || message == BM_SETSTATE || message == WM_ENABLE ||
      message == WM_SETFOCUS || message == WM_KILLFOCUS || message == WM_UPDATEUISTATE ||
      message == WM_SETTEXT || message == WM_THEMECHANGED)
    InvalidateRect(window, nullptr, FALSE);
  if (message == WM_NCDESTROY) RemoveWindowSubclass(window, PushButtonProc, id);
  return result;
}

bool CanClose(HWND window) {
  const auto cancel = GetDlgItem(window, IDCANCEL);
  const auto next = GetDlgItem(window, IDOK);
  return IsWindowEnabled(cancel) || (!IsWindowVisible(cancel) && IsWindowEnabled(next));
}

void LayoutChrome(HWND window, ChromeState& chrome) {
  const auto dc = GetDC(window);
  auto previous = SelectObject(dc, chrome.brandFont);
  const auto brand = MeasureFontInk(dc);
  SelectObject(dc, chrome.smallFont);
  const auto smallMetrics = MeasureFontInk(dc);
  SelectObject(dc, previous);
  ReleaseDC(window, dc);
  const int baseline = Scale(window, 52);
  SetWindowPos(chrome.brand, nullptr, Scale(window, 32), baseline - brand.ascent,
               Scale(window, 320), brand.lineHeight, SWP_NOZORDER | SWP_NOACTIVATE);
  SetWindowPos(chrome.version, nullptr, Scale(window, 390), baseline - smallMetrics.ascent,
               Scale(window, 204), smallMetrics.lineHeight, SWP_NOZORDER | SWP_NOACTIVATE);
  SetWindowPos(chrome.minimize, nullptr, Scale(window, 608), Scale(window, 28),
               Scale(window, 36), Scale(window, 36), SWP_NOZORDER | SWP_NOACTIVATE);
  SetWindowPos(chrome.close, nullptr, Scale(window, 652), Scale(window, 28),
               Scale(window, 36), Scale(window, 36), SWP_NOZORDER | SWP_NOACTIVATE);
  SetWindowPos(chrome.headerLine, nullptr, Scale(window, 32), Scale(window, 88),
               Scale(window, 656), std::max(1, Scale(window, 1)), SWP_NOZORDER | SWP_NOACTIVATE);
  SetWindowPos(chrome.footerLine, nullptr, Scale(window, 32), Scale(window, 448),
               Scale(window, 656), std::max(1, Scale(window, 1)), SWP_NOZORDER | SWP_NOACTIVATE);
}

void PaintChromeLines(HWND window) {
  const auto dc = GetDC(window);
  const auto line = CreatePen(PS_SOLID, 1, border);
  const auto previous = SelectObject(dc, line);
  MoveToEx(dc, Scale(window, 32), Scale(window, 88), nullptr);
  LineTo(dc, Scale(window, 688), Scale(window, 88));
  MoveToEx(dc, Scale(window, 32), Scale(window, 448), nullptr);
  LineTo(dc, Scale(window, 688), Scale(window, 448));
  SelectObject(dc, previous);
  DeleteObject(line);
  ReleaseDC(window, dc);
}

LRESULT CALLBACK CenterLabelProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam,
                                 UINT_PTR id, DWORD_PTR) {
  if (message == WM_PAINT || message == WM_PRINTCLIENT) {
    PAINTSTRUCT paint{};
    const auto dc = message == WM_PAINT ? BeginPaint(window, &paint) : reinterpret_cast<HDC>(wParam);
    RECT bounds{};
    GetClientRect(window, &bounds);
    const auto brush = CreateSolidBrush(bg);
    FillRect(dc, &bounds, brush);
    DeleteObject(brush);
    Text(window, dc, bounds, muted, DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
    if (message == WM_PAINT) EndPaint(window, &paint);
    return 0;
  }
  if (message == WM_ERASEBKGND) return 1;
  if (message == WM_NCDESTROY) RemoveWindowSubclass(window, CenterLabelProc, id);
  return DefSubclassProc(window, message, wParam, lParam);
}

void LayoutFailure(HWND window) {
  ShowWindow(GetDlgItem(window, 3), SW_HIDE);
  ShowWindow(GetDlgItem(window, IDOK), SW_HIDE);
  const auto close = GetDlgItem(window, IDCANCEL);
  SetWindowText(close, L"Закрыть");
  SetWindowPos(close, nullptr, Scale(window, 558), Scale(window, 468), Scale(window, 130),
               Scale(window, 36), SWP_NOZORDER | SWP_NOACTIVATE);
}

LRESULT CALLBACK DialogProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam,
                            UINT_PTR id, DWORD_PTR) {
  const auto messageBox = reinterpret_cast<MessageBoxState*>(GetProp(window, messageBoxProperty));
  if (messageBox) {
    if (message == WM_NCCALCSIZE) return 0;
    if (message == WM_NCHITTEST) {
      POINT point{static_cast<short>(LOWORD(lParam)), static_cast<short>(HIWORD(lParam))};
      ScreenToClient(window, &point);
      if (point.y >= 0 && point.y < Scale(window, 56) && point.x < Scale(window, 448)) return HTCAPTION;
      return HTCLIENT;
    }
    if (message == WM_NCLBUTTONDBLCLK) return 0;
    if (message == WM_COMMAND && LOWORD(wParam) == closeId && HIWORD(wParam) == BN_CLICKED) {
      PostMessage(window, WM_CLOSE, 0, 0);
      return 0;
    }
    if (message == WM_ERASEBKGND || message == WM_PAINT) {
      PAINTSTRUCT paint{};
      const auto dc = message == WM_PAINT ? BeginPaint(window, &paint) : reinterpret_cast<HDC>(wParam);
      RECT bounds{};
      GetClientRect(window, &bounds);
      FillRect(dc, &bounds, dialogBackground);
      const auto line = CreatePen(PS_SOLID, std::max(1, Scale(window, 1)), border);
      const auto previous = SelectObject(dc, line);
      for (const auto y : {Scale(window, 56), static_cast<int>(bounds.bottom) - Scale(window, 68)}) {
        MoveToEx(dc, Scale(window, 24), y, nullptr);
        LineTo(dc, bounds.right - Scale(window, 24), y);
      }
      SelectObject(dc, previous);
      DeleteObject(line);
      if (message == WM_PAINT) EndPaint(window, &paint);
      return 1;
    }
    if (message == WM_CTLCOLORDLG || message == WM_CTLCOLORSTATIC) {
      const auto dc = reinterpret_cast<HDC>(wParam);
      SetBkColor(dc, bg);
      SetTextColor(dc, ink);
      return reinterpret_cast<LRESULT>(dialogBackground);
    }
    if (message == WM_NCDESTROY) {
      RemoveProp(window, messageBoxProperty);
      delete messageBox;
    }
  }
  const auto chrome = reinterpret_cast<ChromeState*>(GetProp(window, chromeProperty));
  if (chrome) {
    if (message == failureMessage && chrome->failed) { LayoutFailure(window); return 0; }
    if (message == WM_NCCALCSIZE) return 0;
    if (message == WM_GETMINMAXINFO) {
      const auto limits = reinterpret_cast<MINMAXINFO*>(lParam);
      limits->ptMinTrackSize = {Scale(window, 720), Scale(window, 528)};
      limits->ptMaxTrackSize = limits->ptMinTrackSize;
      return 0;
    }
    if (message == WM_NCHITTEST) {
      POINT point{static_cast<short>(LOWORD(lParam)), static_cast<short>(HIWORD(lParam))};
      ScreenToClient(window, &point);
      if (point.y >= 0 && point.y < Scale(window, 88)) {
        RECT button{};
        POINT screen = point;
        ClientToScreen(window, &screen);
        GetWindowRect(chrome->close, &button);
        if (PtInRect(&button, screen)) return HTCLIENT;
        GetWindowRect(chrome->minimize, &button);
        if (PtInRect(&button, screen)) return HTCLIENT;
        return HTCAPTION;
      }
      return HTCLIENT;
    }
    if (message == WM_NCLBUTTONDBLCLK) return 0;
    if (message == WM_CLOSE) {
      if (!CanClose(window)) return 0;
      const auto cancel = GetDlgItem(window, IDCANCEL);
      const auto next = GetDlgItem(window, IDOK);
      // NSIS may keep WM_CLOSE disabled after its instfiles page. Finish through
      // the real Next/Done callback so cleanup and the user's launch choice run.
      if (!IsWindowVisible(cancel) && IsWindowEnabled(next)) {
        PostMessage(window, WM_COMMAND, MAKEWPARAM(IDOK, BN_CLICKED), reinterpret_cast<LPARAM>(next));
        return 0;
      }
    }
    if (message == WM_COMMAND && HIWORD(wParam) == BN_CLICKED) {
      if (LOWORD(wParam) == minimizeId) { ShowWindow(window, SW_MINIMIZE); return 0; }
      if (LOWORD(wParam) == closeId) {
        if (CanClose(window)) PostMessage(window, WM_CLOSE, 0, 0);
        return 0;
      }
    }
    if (message == WM_SYSCOMMAND) {
      const auto command = wParam & 0xFFF0;
      if (command == SC_MAXIMIZE || command == SC_SIZE || (command == SC_CLOSE && !CanClose(window))) return 0;
      if (command == SC_CLOSE) { PostMessage(window, WM_CLOSE, 0, 0); return 0; }
    }
    if (message == WM_CTLCOLORSTATIC &&
        (reinterpret_cast<HWND>(lParam) == chrome->brand || reinterpret_cast<HWND>(lParam) == chrome->version)) {
      const auto dc = reinterpret_cast<HDC>(wParam);
      SetBkColor(dc, bg);
      SetTextColor(dc, reinterpret_cast<HWND>(lParam) == chrome->brand ? ink : muted);
      return reinterpret_cast<LRESULT>(chrome->background);
    }
    if (message == WM_TIMER && wParam == chromeTimerId) {
      const bool enabled = CanClose(window);
      if (static_cast<bool>(IsWindowEnabled(chrome->close)) != enabled) EnableWindow(chrome->close, enabled);
      return 0;
    }
    if (message == WM_PAINT) {
      const auto result = DefSubclassProc(window, message, wParam, lParam);
      PaintChromeLines(window);
      return result;
    }
    if (message == WM_DPICHANGED) {
      const auto result = DefSubclassProc(window, message, wParam, lParam);
      LayoutChrome(window, *chrome);
      return result;
    }
    if (message == WM_NCDESTROY) {
      if (window == installerWindow) {
        UnhookWindowsHookEx(messageBoxHook);
        messageBoxHook = nullptr;
        installerWindow = nullptr;
      }
      KillTimer(window, chromeTimerId);
      RemoveProp(window, chromeProperty);
      DeleteObject(chrome->background);
      delete chrome;
    }
  }
  if (message == WM_DRAWITEM && lParam) {
    const auto& item = *reinterpret_cast<DRAWITEMSTRUCT*>(lParam);
    if (item.CtlType == ODT_BUTTON) { DrawPushButton(item); return TRUE; }
    if (item.CtlType == ODT_STATIC && (item.CtlID == headerLineId || item.CtlID == footerLineId)) {
      const auto brush = CreateSolidBrush(border);
      FillRect(item.hDC, &item.rcItem, brush);
      DeleteObject(brush);
      return TRUE;
    }
  }
  if (message == WM_NCDESTROY) RemoveWindowSubclass(window, DialogProc, id);
  return DefSubclassProc(window, message, wParam, lParam);
}

BOOL CALLBACK SkinChild(HWND window, LPARAM) {
  wchar_t className[64]{};
  GetClassName(window, className, static_cast<int>(std::size(className)));
  if (wcscmp(className, L"#32770") == 0) {
    SetWindowSubclass(window, DialogProc, skinId, 0);
  } else if (wcscmp(className, L"Button") == 0) {
    const auto style = GetWindowLongPtr(window, GWL_STYLE);
    const auto type = style & BS_TYPEMASK;
    if (type == BS_AUTOCHECKBOX || type == BS_CHECKBOX || type == BS_RADIOBUTTON || type == BS_AUTORADIOBUTTON) {
      SetWindowTheme(window, L"", L"");
      SetWindowSubclass(window, ToggleProc, skinId, type == BS_RADIOBUTTON || type == BS_AUTORADIOBUTTON);
      SetWindowSubclass(window, HoverProc, skinId, 0);
    } else if (type == BS_PUSHBUTTON || type == BS_DEFPUSHBUTTON || type == BS_OWNERDRAW) {
      SetWindowSubclass(window, PushButtonProc, skinId, 0);
      SetWindowLongPtr(window, GWL_STYLE, (style & ~BS_TYPEMASK) | BS_OWNERDRAW);
      SetWindowTheme(window, L"", L"");
      SetWindowSubclass(window, HoverProc, skinId, 0);
    }
    InvalidateRect(window, nullptr, TRUE);
  } else if (wcscmp(className, L"Edit") == 0 && !GetProp(window, editProperty)) {
    SetProp(window, editProperty, reinterpret_cast<HANDLE>(1));
    SetWindowTheme(window, L"", L"");
    SetWindowLongPtr(window, GWL_STYLE, GetWindowLongPtr(window, GWL_STYLE) & ~WS_BORDER);
    SetWindowLongPtr(window, GWL_EXSTYLE, GetWindowLongPtr(window, GWL_EXSTYLE) & ~WS_EX_CLIENTEDGE);
    SetWindowSubclass(window, InputProc, skinId, 0);
    SetWindowPos(window, nullptr, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
    RedrawWindow(window, nullptr, nullptr, RDW_FRAME | RDW_INVALIDATE);
  }
  return TRUE;
}

void SkinMessageBox(HWND window) {
  if (GetProp(window, messageBoxProperty)) return;
  HWND buttons[11]{};
  int buttonCount{};
  for (int id = IDOK; id <= IDCONTINUE; ++id) {
    const auto button = GetDlgItem(window, id);
    if (button && (GetWindowLongPtr(button, GWL_STYLE) & WS_VISIBLE)) buttons[buttonCount++] = button;
  }
  const auto text = GetDlgItem(window, 0xFFFF);
  if (!text || buttonCount == 0) return;
  const auto font = reinterpret_cast<HFONT>(SendMessage(GetDlgItem(installerWindow, IDOK), WM_GETFONT, 0, 0));
  const auto primaryId = LOWORD(SendMessage(window, DM_GETDEFID, 0, 0));
  const auto primary = GetDlgItem(window, primaryId);
  auto state = new MessageBoxState{primary ? primary : buttons[0], nullptr};
  SetProp(window, messageBoxProperty, state);
  SetWindowSubclass(window, DialogProc, skinId, 0);

  RECT original{};
  GetClientRect(window, &original);
  const int width = std::max(Scale(window, 512), static_cast<int>(original.right));
  wchar_t caption[8192]{};
  GetWindowText(text, caption, static_cast<int>(std::size(caption)));
  const auto icon = GetDlgItem(window, 20);
  const int textLeft = Scale(window, icon ? 72 : 24);
  RECT measured{0, 0, width - textLeft - Scale(window, 24), 0};
  const auto dc = GetDC(window);
  const auto previous = SelectObject(dc, font);
  DrawText(dc, caption, -1, &measured, DT_CALCRECT | DT_WORDBREAK | DT_NOPREFIX);
  if (previous) SelectObject(dc, previous);
  ReleaseDC(window, dc);
  const int textHeight = std::max(Scale(window, 48), static_cast<int>(measured.bottom));
  const int height = Scale(window, 76 + 24 + 68) + textHeight;
  const auto style = GetWindowLongPtr(window, GWL_STYLE);
  SetWindowLongPtr(window, GWL_STYLE, (style & ~WS_CAPTION) | WS_THICKFRAME);
  SetWindowLongPtr(window, GWL_EXSTYLE, GetWindowLongPtr(window, GWL_EXSTYLE) & ~WS_EX_DLGMODALFRAME);
  const MARGINS margins{1, 1, 1, 1};
  DwmExtendFrameIntoClientArea(window, &margins);
  const DWORD corners = 2;
  DwmSetWindowAttribute(window, 33, &corners, sizeof(corners));
  DwmSetWindowAttribute(window, 34, &border, sizeof(border));
  RECT owner{};
  GetWindowRect(installerWindow, &owner);
  SetWindowPos(window, nullptr, owner.left + (owner.right - owner.left - width) / 2,
               owner.top + (owner.bottom - owner.top - height) / 2, width, height,
               SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
  SetWindowPos(text, nullptr, textLeft, Scale(window, 76), measured.right, textHeight,
               SWP_NOZORDER | SWP_NOACTIVATE);
  SendMessage(text, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);
  if (icon) SetWindowPos(icon, nullptr, Scale(window, 24), Scale(window, 76), Scale(window, 32),
                         Scale(window, 32), SWP_NOZORDER | SWP_NOACTIVATE);
  const auto brand = CreateWindowEx(0, L"STATIC", L"screen / launcher", WS_CHILD | WS_VISIBLE | SS_NOPREFIX,
                                    Scale(window, 24), Scale(window, 18), width - Scale(window, 96),
                                    Scale(window, 28), window, nullptr, nullptr, nullptr);
  SendMessage(brand, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);
  state->close = CreateWindowEx(0, L"BUTTON", L"Закрыть", WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_OWNERDRAW,
                                width - Scale(window, 60), Scale(window, 10), Scale(window, 36),
                                Scale(window, 36), window, reinterpret_cast<HMENU>(closeId), nullptr, nullptr);
  const auto closeState = GetMenuState(GetSystemMenu(window, FALSE), SC_CLOSE, MF_BYCOMMAND);
  EnableWindow(state->close, (closeState & (MF_GRAYED | MF_DISABLED)) == 0);
  for (int index = 0; index < buttonCount; ++index) {
    SetWindowPos(buttons[index], nullptr, width - Scale(window, 24 + (buttonCount - index) * 108 - 8),
                 height - Scale(window, 52), Scale(window, 100), Scale(window, 36),
                 SWP_NOZORDER | SWP_NOACTIVATE);
    SendMessage(buttons[index], WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);
  }
  EnumChildWindows(window, SkinChild, 0);
  RedrawWindow(window, nullptr, nullptr, RDW_INVALIDATE | RDW_ERASE | RDW_ALLCHILDREN);
}

LRESULT CALLBACK MessageBoxHook(int code, WPARAM wParam, LPARAM lParam) {
  if (code == HCBT_ACTIVATE) {
    const auto window = reinterpret_cast<HWND>(wParam);
    wchar_t className[64]{};
    GetClassName(window, className, static_cast<int>(std::size(className)));
    // Only message boxes owned by this installer. Leave the Windows folder
    // picker and other applications' dialogs to their own UI.
    if (window != installerWindow && GetAncestor(window, GA_ROOTOWNER) == installerWindow &&
        wcscmp(className, L"#32770") == 0 && GetDlgItem(window, 0xFFFF)) {
      bool messageBox = true;
      for (auto child = GetWindow(window, GW_CHILD); child; child = GetWindow(child, GW_HWNDNEXT)) {
        GetClassName(child, className, static_cast<int>(std::size(className)));
        if (wcscmp(className, L"Static") != 0 && wcscmp(className, L"Button") != 0) {
          messageBox = false;
          break;
        }
      }
      if (messageBox) SkinMessageBox(window);
    }
  }
  return CallNextHookEx(messageBoxHook, code, wParam, lParam);
}

void StopProgressTracking(HWND window) {
  DWORD_PTR data{};
  if (!GetWindowSubclass(window, DialogProc, progressId, &data)) return;
  KillTimer(window, progressId);
  RemoveWindowSubclass(window, DialogProc, progressId);
  delete reinterpret_cast<ProgressState*>(data);
}

void CALLBACK ProgressTimer(HWND window, UINT, UINT_PTR, DWORD) {
  DWORD_PTR data{};
  if (!GetWindowSubclass(window, DialogProc, progressId, &data)) return;
  const auto state = reinterpret_cast<ProgressState*>(data);
  const auto maximum = SendMessage(window, PBM_GETRANGE, FALSE, 0);
  const auto position = SendMessage(window, PBM_GETPOS, 0, 0);
  if (maximum <= 0 || !IsWindow(state->label)) return;
  const auto percent = std::clamp(static_cast<int>(position * 100 / maximum), 0, 100);
  wchar_t text[8]{};
  swprintf_s(text, L"%d%%", percent);
  wchar_t previous[8]{};
  GetWindowText(state->label, previous, static_cast<int>(std::size(previous)));
  if (wcscmp(text, previous) != 0) SetWindowText(state->label, text);
}

LRESULT CALLBACK ProgressProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam,
                              UINT_PTR id, DWORD_PTR) {
  if (message == WM_NCDESTROY) {
    StopProgressTracking(window);
    RemoveWindowSubclass(window, ProgressProc, id);
  }
  return DefSubclassProc(window, message, wParam, lParam);
}

HWND PopHandle(Stack** stack) {
  if (!stack || !*stack) return nullptr;
  const auto top = *stack;
  const auto handle = reinterpret_cast<HWND>(static_cast<UINT_PTR>(_wcstoui64(top->text, nullptr, 0)));
  *stack = top->next;
  GlobalFree(top);
  return handle;
}

void PopText(Stack** stack, wchar_t* output, size_t size) {
  if (!stack || !*stack) { output[0] = 0; return; }
  const auto top = *stack;
  wcsncpy_s(output, size, top->text, _TRUNCATE);
  *stack = top->next;
  GlobalFree(top);
}
}

// NSIS is a 32-bit process even for x64 application bundles. /NOUNLOAD keeps
// this module resident while its window subclasses and native timer are alive.
extern "C" __declspec(dllexport) void __cdecl Apply(HWND parent, int, wchar_t*, Stack**, void*) {
  if (!graphicsToken) {
    Gdiplus::GdiplusStartupInput startup;
    // /NOUNLOAD keeps the process-lifetime graphics context alive with the skin.
    Gdiplus::GdiplusStartup(&graphicsToken, &startup, nullptr);
    dialogBackground = CreateSolidBrush(bg);
  }
  SetWindowSubclass(parent, DialogProc, skinId, 0);
  EnumChildWindows(parent, SkinChild, 0);
}

extern "C" __declspec(dllexport) void __cdecl TrackProgress(HWND, int, wchar_t*, Stack** stack, void*) {
  auto progress = PopHandle(stack);
  auto label = PopHandle(stack);
  if (!IsWindow(progress) || !IsWindow(label)) return;
  StopProgressTracking(progress);
  auto state = new ProgressState{label};
  SetWindowSubclass(progress, DialogProc, progressId, reinterpret_cast<DWORD_PTR>(state));
  SetWindowSubclass(progress, ProgressProc, skinId, reinterpret_cast<DWORD_PTR>(state));
  SetTimer(progress, progressId, 80, ProgressTimer);
  ProgressTimer(progress, 0, progressId, 0);
}

extern "C" __declspec(dllexport) void __cdecl StopProgress(HWND, int, wchar_t*, Stack** stack, void*) {
  const auto progress = PopHandle(stack);
  StopProgressTracking(progress);
  RemoveWindowSubclass(progress, ProgressProc, skinId);
}

extern "C" __declspec(dllexport) void __cdecl Failed(HWND parent, int, wchar_t*, Stack**, void*) {
  const auto chrome = reinterpret_cast<ChromeState*>(GetProp(parent, chromeProperty));
  if (!chrome) return;
  chrome->failed = true;
  LayoutFailure(parent);
  // NSIS finishes changing button visibility after the leave callback returns.
  // Reapply before the next paint, once that native update has completed.
  PostMessage(parent, failureMessage, 0, 0);
}

extern "C" __declspec(dllexport) void __cdecl WatchDialogs(HWND, int, wchar_t*, Stack**, void*) {
  // NSIS also creates errors on its installation worker, so each calling thread
  // needs its own hook. Windows removes a thread's hook when that thread exits.
  if (IsWindow(installerWindow) && !messageBoxHook)
    messageBoxHook = SetWindowsHookEx(WH_CBT, MessageBoxHook, nullptr, GetCurrentThreadId());
}

extern "C" __declspec(dllexport) void __cdecl CenterLabel(HWND, int, wchar_t*, Stack** stack, void*) {
  const auto label = PopHandle(stack);
  if (IsWindow(label)) SetWindowSubclass(label, CenterLabelProc, skinId, 0);
}

extern "C" __declspec(dllexport) void __cdecl Decorate(HWND parent, int, wchar_t*, Stack** stack, void*) {
  wchar_t action[64]{}, version[64]{}, caption[144]{};
  PopText(stack, action, std::size(action));
  PopText(stack, version, std::size(version));
  const auto brandFont = reinterpret_cast<HFONT>(PopHandle(stack));
  const auto smallFont = reinterpret_cast<HFONT>(PopHandle(stack));
  if (GetProp(parent, chromeProperty)) return;
  installerWindow = parent;
  WatchDialogs(parent, 0, nullptr, nullptr, nullptr);
  auto chrome = new ChromeState;
  chrome->brandFont = brandFont;
  chrome->smallFont = smallFont;
  chrome->background = CreateSolidBrush(bg);
  SetProp(parent, chromeProperty, chrome);
  SetWindowSubclass(parent, DialogProc, skinId, 0);
  const auto style = GetWindowLongPtr(parent, GWL_STYLE);
  // Keep system minimise/taskbar/Alt-F4 behavior and DWM's shadow. The client
  // occupies the whole frame and the hit test permits moving, never resizing.
  SetWindowLongPtr(parent, GWL_STYLE, (style & ~WS_CAPTION) | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX);
  SetWindowLongPtr(parent, GWL_EXSTYLE, GetWindowLongPtr(parent, GWL_EXSTYLE) & ~WS_EX_DLGMODALFRAME);
  const MARGINS margins{1, 1, 1, 1};
  DwmExtendFrameIntoClientArea(parent, &margins);
  const DWORD corners = 2;
  DwmSetWindowAttribute(parent, 33, &corners, sizeof(corners));
  DwmSetWindowAttribute(parent, 34, &border, sizeof(border));
  SetWindowPos(parent, nullptr, 0, 0, Scale(parent, 720), Scale(parent, 528),
               SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
  chrome->brand = CreateWindowEx(0, L"STATIC", L"screen / launcher", WS_CHILD | WS_VISIBLE | SS_NOPREFIX,
                                 0, 0, 1, 1, parent, nullptr, nullptr, nullptr);
  swprintf_s(caption, L"%s / %s", action, version);
  chrome->version = CreateWindowEx(0, L"STATIC", caption, WS_CHILD | WS_VISIBLE | SS_RIGHT | SS_NOPREFIX,
                                   0, 0, 1, 1, parent, nullptr, nullptr, nullptr);
  SendMessage(chrome->brand, WM_SETFONT, reinterpret_cast<WPARAM>(brandFont), TRUE);
  SendMessage(chrome->version, WM_SETFONT, reinterpret_cast<WPARAM>(smallFont), TRUE);
  chrome->minimize = CreateWindowEx(0, L"BUTTON", L"Свернуть", WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_OWNERDRAW,
                                    0, 0, 1, 1, parent, reinterpret_cast<HMENU>(minimizeId), nullptr, nullptr);
  chrome->close = CreateWindowEx(0, L"BUTTON", L"Закрыть", WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_OWNERDRAW,
                                 0, 0, 1, 1, parent, reinterpret_cast<HMENU>(closeId), nullptr, nullptr);
  chrome->headerLine = CreateWindowEx(0, L"STATIC", L"", WS_CHILD | WS_VISIBLE | SS_OWNERDRAW,
                                      0, 0, 1, 1, parent, reinterpret_cast<HMENU>(headerLineId), nullptr, nullptr);
  chrome->footerLine = CreateWindowEx(0, L"STATIC", L"", WS_CHILD | WS_VISIBLE | SS_OWNERDRAW,
                                      0, 0, 1, 1, parent, reinterpret_cast<HMENU>(footerLineId), nullptr, nullptr);
  SetWindowSubclass(chrome->minimize, HoverProc, skinId, 0);
  SetWindowSubclass(chrome->close, HoverProc, skinId, 0);
  SetWindowSubclass(chrome->minimize, PushButtonProc, skinId, 0);
  SetWindowSubclass(chrome->close, PushButtonProc, skinId, 0);
  LayoutChrome(parent, *chrome);
  SetTimer(parent, chromeTimerId, 100, nullptr);
  RedrawWindow(parent, nullptr, nullptr, RDW_FRAME | RDW_INVALIDATE | RDW_ALLCHILDREN);
}
