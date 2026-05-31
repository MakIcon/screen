import "./NumberStepperArrows.css";

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
  return (
    <div className="nsa-root" aria-hidden={disabled ? "true" : undefined}>
      <button
        className="nsa-btn nsa-btn--up"
        type="button"
        tabIndex={-1}
        disabled={disabled || incrementDisabled}
        onClick={onIncrement}
        aria-label="Increase value"
      >
        <span className="nsa-triangle nsa-triangle--up" />
      </button>
      <button
        className="nsa-btn nsa-btn--down"
        type="button"
        tabIndex={-1}
        disabled={disabled || decrementDisabled}
        onClick={onDecrement}
        aria-label="Decrease value"
      >
        <span className="nsa-triangle nsa-triangle--down" />
      </button>
    </div>
  );
}
