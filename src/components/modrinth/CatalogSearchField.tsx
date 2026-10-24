import { TextField } from "../inputs/TextField";
import type { ChangeEventHandler, MouseEventHandler, Ref } from "react";

interface CatalogSearchFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  onClick?: MouseEventHandler<HTMLInputElement>;
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
}

export function CatalogSearchField({
  label,
  placeholder,
  value,
  onChange,
  onClick,
  inputRef,
  className = "",
}: CatalogSearchFieldProps) {
  return (
    <label className={`field compact-field search-field${className ? ` ${className}` : ""}`}>
      <span>{label}</span>
      <TextField
        ref={inputRef}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onClick={onClick}
        autoComplete="off"
        spellCheck={false}
      />
    </label>
  );
}
