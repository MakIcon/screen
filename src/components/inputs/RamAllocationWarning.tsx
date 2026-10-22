import { useTranslation } from "../../i18n/locale";
import { exceedsUsableRam, formatSystemRamGb, getRamWarningLevel } from "../../utils/ram";
import { RamWarningSigns } from "./RamWarningSigns";

type Props = {
  ramGb: number;
  usableRamGb: number | null;
  variant?: "text" | "signs";
  maxRamGb?: number;
};

export function RamAllocationWarning({
  ramGb,
  usableRamGb,
  maxRamGb = ramGb,
  variant = "text",
}: Props) {
  const tr = useTranslation();
  if (usableRamGb === null || !exceedsUsableRam(ramGb, usableRamGb)) return null;
  const message = tr("ram.exceedsUsableMemory", { usable: formatSystemRamGb(usableRamGb) });
  if (variant === "signs") {
    return (
      <RamWarningSigns
        message={message}
        level={getRamWarningLevel(ramGb, usableRamGb, maxRamGb)}
        ramGb={ramGb}
      />
    );
  }
  return (
    <p className="ram-allocation-warning" role="status">
      {message}
    </p>
  );
}
