import "./NumberStepperArrows.css";
import { useTranslation } from "../../i18n/locale";

type NumberStepperArrowsProps = {
  onIncrement: () => void;
  onDecrement: () => void;
  disabled?: boolean;
  incrementDisabled?: boolean;
  decrementDisabled?: boolean;
};

export function NumberStepperArrows({
  onIncrement,
  onDecrement,
  disabled = false,
  incrementDisabled = false,
  decrementDisabled = false,
}: NumberStepperArrowsProps) {
  const tr = useTranslation();
  return (
    <div className="nsa-root" aria-hidden={disabled ? "true" : undefined}>
      <button
        className="nsa-btn nsa-btn--up"
        type="button"
        tabIndex={-1}
        disabled={disabled || incrementDisabled}
        onClick={onIncrement}
        aria-label={tr("numberStepperArrows.increaseValue")}
      >
        <span className="nsa-triangle nsa-triangle--up" />
      </button>
      <button
        className="nsa-btn nsa-btn--down"
        type="button"
        tabIndex={-1}
        disabled={disabled || decrementDisabled}
        onClick={onDecrement}
        aria-label={tr("numberStepperArrows.decreaseValue")}
      >
        <span className="nsa-triangle nsa-triangle--down" />
      </button>
    </div>
  );
}
