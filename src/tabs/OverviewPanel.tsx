import { useState } from "react";
import { InlineDropdown } from "../components/inputs/InlineDropdown";
import { HoverRevealValue } from "../components/display/HoverRevealValue";
import type { DropdownKey, MicrosoftAccount } from "../types";
import { createPlaceholderAppearanceAttributes } from "../utils/placeholders";
import { useTranslation } from "../i18n/locale";

interface OverviewPanelProps {
  resolve: (template: string) => string;
  nickname: string;
  setNickname: (v: string) => void;
  onNicknameEdit?: (value: string) => void;
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
  onNicknameEdit,
  accountType,
  setAccountType,
  openDropdown,
  setOpenDropdown,
  msAccounts,
  activeMsAccountId,
  onOpenMsModal,
}: OverviewPanelProps) {
  const tr = useTranslation();
  const activeMs = msAccounts.find((a) => a.id === activeMsAccountId) ?? null;
  const [editingNickname, setEditingNickname] = useState(false);

  return (
    <div className="image-mockup launcher-mockup" data-guide-target="overview-profile">
      <div className="lines-pattern" />
      <div className="mockup-overlay">
        <div className="mockup-block">
          <span className="mockup-label">{tr("overview.activeBuild")}</span>
          <strong {...createPlaceholderAppearanceAttributes("%build_name%", resolve)}>
            {resolve("%build_name%")}
          </strong>
        </div>

        <div className="mockup-block">
          <span className="mockup-label">{tr("overview.totalTimeInGame")}</span>
          <strong {...createPlaceholderAppearanceAttributes("%total_playtime%", resolve)}>
            {resolve("%total_playtime%")}
          </strong>
        </div>

        <div className="mockup-split-row">
          {/* Nickname (only visible for offline) */}
          {accountType === "OFFLINE" && (
            <div className="mockup-block" data-guide-target="nickname">
              <span className="mockup-label">{tr("overview.nickname")}</span>
              <HoverRevealValue value={nickname}>
                {editingNickname ? (
                  <input
                    className="mockup-input"
                    value={nickname}
                    onChange={(e) => {
                      const value = e.target.value;
                      setNickname(value);
                      onNicknameEdit?.(value);
                    }}
                    onBlur={() => setEditingNickname(false)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === "Escape") {
                        event.currentTarget.blur();
                      }
                    }}
                    spellCheck={false}
                    autoFocus
                  />
                ) : (
                  <button
                    className="mockup-input mockup-nickname-value"
                    type="button"
                    onClick={() => setEditingNickname(true)}
                  >
                    <span
                      data-guide-value
                      {...createPlaceholderAppearanceAttributes("%player_name%", resolve)}
                    >
                      {resolve("%player_name%")}
                    </span>
                  </button>
                )}
              </HoverRevealValue>
            </div>
          )}

          {/* Microsoft account display */}
          {accountType === "MICROSOFT" && (
            <div className="mockup-block mockup-ms-account">
              <span className="mockup-label">{tr("overview.loggedIn")}</span>
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
                  <span className="mockup-ms-none">{tr("overview.noAccountClickTo")}</span>
                </button>
              )}
            </div>
          )}

          <div className="mockup-block mockup-account-dropdown" data-guide-target="account-type">
            <InlineDropdown
              label={tr("overview.account")}
              value={accountType}
              options={["OFFLINE", "MICROSOFT"]}
              isOpen={openDropdown === "account"}
              onToggle={() => setOpenDropdown(openDropdown === "account" ? null : "account")}
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
