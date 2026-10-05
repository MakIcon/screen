import type { Ref } from "react";
import windowsArrowCursorUrl from "../../assets/cursors/windows-arrow.svg";

export function GuidePointer({ pointerRef }: { pointerRef: Ref<HTMLSpanElement> }) {
  return (
    <span ref={pointerRef} className="launcher-guide-pointer" aria-hidden="true">
      <img src={windowsArrowCursorUrl} alt="" />
    </span>
  );
}
