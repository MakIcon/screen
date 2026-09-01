import type { ChangeEventHandler, Ref } from "react";

interface CatalogSearchFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
}

export function CatalogSearchField({
  label,
  placeholder,
  value,
  onChange,
  inputRef,
  className = "",
}: CatalogSearchFieldProps) {
  return (
    <label className={`field compact-field search-field${className ? ` ${className}` : ""}`}>
      <span>{label}</span>
      <input
        ref={inputRef}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        spellCheck={false}
      />
    </label>
  );
}
