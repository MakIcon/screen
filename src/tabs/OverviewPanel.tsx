import { InlineDropdown } from "../components/inputs/InlineDropdown";
import { HoverRevealValue } from "../components/display/HoverRevealValue";
import type { DropdownKey, MicrosoftAccount } from "../types";
import { createPlaceholderAppearanceAttributes } from "../utils/placeholders";

interface OverviewPanelProps {
  resolve: (template: string) => string;
  nickname: string;
  setNickname: (v: string) => void;
  accountType: string;
  setAccountType: (v: string) => void;
  openDropdown: DropdownKey;
  setOpenDropdown: (key: DropdownKey) => void;
  msAccounts: MicrosoftAccount[];
  activeMsAccountId: string | null;
  onOpenMsModal: () => void;
}

export function OverviewPanel({
  resolve,
  nickname,
  setNickname,
  accountType,
  setAccountType,
  openDropdown,
  setOpenDropdown,
  msAccounts,
  activeMsAccountId,
  onOpenMsModal,
}: OverviewPanelProps) {
  const activeMs = msAccounts.find((a) => a.id === activeMsAccountId) ?? null;

  return (
    <div className="image-mockup launcher-mockup">
      <div className="lines-pattern" />
      <div className="mockup-overlay">
        <div className="mockup-block">
          <span className="mockup-label">ACTIVE BUILD</span>
          <strong {...createPlaceholderAppearanceAttributes("%build_name%", resolve)}>
            {resolve("%build_name%")}
          </strong>
        </div>

        <div className="mockup-block">
          <span className="mockup-label">TOTAL TIME IN GAME</span>
          <strong {...createPlaceholderAppearanceAttributes("%total_playtime%", resolve)}>
            {resolve("%total_playtime%")}
          </strong>
        </div>

        <div className="mockup-split-row">
          {/* Nickname (only visible for offline) */}
          {accountType === "OFFLINE" && (
            <div className="mockup-block">
              <span className="mockup-label">NICKNAME</span>
              <HoverRevealValue value={nickname}>
                <input
                  className="mockup-input"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  spellCheck={false}
                />
              </HoverRevealValue>
            </div>
          )}

          {/* Microsoft account display */}
          {accountType === "MICROSOFT" && (
            <div className="mockup-block mockup-ms-account">
              <span className="mockup-label">LOGGED IN</span>
              {activeMs ? (
                <HoverRevealValue value={activeMs.username}>
                  <button className="mockup-ms-row" onClick={onOpenMsModal}>
                    <div className="mockup-ms-avatar">
                      <img
                        src={`https://mc-heads.net/avatar/${activeMs.uuid}/24`}
                        alt={activeMs.username}
                        width={24}
                        height={24}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                    <strong
                      className="mockup-ms-name"
                      {...createPlaceholderAppearanceAttributes("%player_name%", resolve)}
                    >
                      {activeMs.username}
                    </strong>
                  </button>
                </HoverRevealValue>
              ) : (
                <button className="mockup-ms-row mockup-ms-row--empty" onClick={onOpenMsModal}>
                  <span className="mockup-ms-none">No account — click to add</span>
                </button>
              )}
            </div>
          )}

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
                if (value === "MICROSOFT") onOpenMsModal();
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
