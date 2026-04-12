import { InlineDropdown } from "../components/inputs/InlineDropdown";
import { HoverRevealValue } from "../components/display/HoverRevealValue";
import type { DropdownKey } from "../types";

interface OverviewPanelProps {
  resolve: (template: string) => string;
  nickname: string;
  setNickname: (v: string) => void;
  accountType: string;
  setAccountType: (v: string) => void;
  openDropdown: DropdownKey;
  setOpenDropdown: (key: DropdownKey) => void;
}

export function OverviewPanel({
  resolve,
  nickname,
  setNickname,
  accountType,
  setAccountType,
  openDropdown,
  setOpenDropdown,
}: OverviewPanelProps) {
  return (
    <div className="image-mockup launcher-mockup">
      <div className="lines-pattern" />
      <div className="mockup-overlay">
        <div className="mockup-block">
          <span className="mockup-label">ACTIVE BUILD</span>
          <strong>{resolve("%build_name%")}</strong>
        </div>

        <div className="mockup-block">
          <span className="mockup-label">TOTAL TIME IN GAME</span>
          <strong>{resolve("%total_playtime%")}</strong>
        </div>

        <div className="mockup-split-row">
          <div className="mockup-block">
            <span className="mockup-label">NICKNAME</span>

            <HoverRevealValue value={nickname}>
              <input
                className="mockup-input mockup-input-uppercase"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                spellCheck={false}
              />
            </HoverRevealValue>
          </div>

          <div className="mockup-block mockup-account-dropdown">
            <InlineDropdown
              label="ACCOUNT"
              value={accountType}
              options={["OFFLINE", "MICROSOFT"]}
              isOpen={openDropdown === "account"}
              onToggle={() =>
                setOpenDropdown(openDropdown === "account" ? null : "account")
              }
              onSelect={(value) => {
                setAccountType(value);
                setOpenDropdown(null);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
