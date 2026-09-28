import { useRef, useState, type ChangeEvent } from "react";
import { customFontStack } from "./profile";
import type { AppearanceCustomFont } from "./types";

const MAX_FONT_BYTES = 4_500_000;

const FONT_FORMATS = {
  woff2: { mime: "font/woff2", format: "woff2" },
  woff: { mime: "font/woff", format: "woff" },
  ttf: { mime: "font/ttf", format: "truetype" },
  otf: { mime: "font/otf", format: "opentype" },
} as const;

type CustomFontManagerProps = {
  fonts: AppearanceCustomFont[];
  onAdd: (font: AppearanceCustomFont) => void;
  onRemove: (font: AppearanceCustomFont) => void;
};

function fontId() {
  const random = Math.random().toString(36).slice(2, 8);
  return `font-${Date.now().toString(36)}-${random}`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("NO DATA"));
    reader.onerror = () => reject(reader.error ?? new Error("READ FAILED"));
    reader.readAsDataURL(file);
  });
}

export function CustomFontManager({ fonts, onAdd, onRemove }: CustomFontManagerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");

  const importFont = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (fonts.length >= 8) {
      setStatus("REMOVE A FONT FIRST · 8 FONT LIMIT");
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase() as keyof typeof FONT_FORMATS;
    const metadata = FONT_FORMATS[extension];
    if (!metadata) {
      setStatus("USE WOFF2, WOFF, TTF OR OTF");
      return;
    }
    if (file.size > MAX_FONT_BYTES) {
      setStatus("FONT IS TOO LARGE · 4.5 MB MAX");
      return;
    }
    try {
      const source = await readFileAsDataUrl(file);
      const base64 = source.slice(source.indexOf(",") + 1);
      const id = fontId();
      const name =
        file.name
          .replace(/\.[^.]+$/, "")
          .trim()
          .slice(0, 80) || "CUSTOM FONT";
      onAdd({
        id,
        name,
        family: `AppearanceCustom-${id.slice(5)}`,
        dataUrl: `data:${metadata.mime};base64,${base64}`,
        format: metadata.format,
      });
      setStatus(`${name.toUpperCase()} READY`);
    } catch {
      setStatus("COULD NOT READ THIS FONT");
    }
  };

  return (
    <div className="studio-font-upload">
      <input
        ref={inputRef}
        type="file"
        accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
        onChange={(event) => void importFont(event)}
      />
      <button
        type="button"
        className="studio-font-upload__button"
        onClick={() => inputRef.current?.click()}
      >
        <span>＋</span>
        <strong>UPLOAD FONT</strong>
        <small>WOFF2 · WOFF · TTF · OTF · MAX 4.5 MB</small>
      </button>
      {status && (
        <p role="status" aria-live="polite">
          {status}
        </p>
      )}
      {fonts.length > 0 && (
        <div className="studio-custom-font-list">
          {fonts.map((font) => (
            <div key={font.id}>
              <span style={{ fontFamily: customFontStack(font) }}>{font.name}</span>
              <button
                type="button"
                onClick={() => onRemove(font)}
                aria-label={`Remove ${font.name}`}
              >
                REMOVE
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
