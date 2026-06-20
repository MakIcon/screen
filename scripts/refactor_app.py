"""
Replaces the render functions in App.tsx with tab component calls.
Run from repo root: python scripts/refactor_app.py
"""

NEW_RENDER = r"""
  const renderMainContent = () => {
    switch (activeTab) {
      case "overview":
        return (
          <OverviewTab
            selectedInstance={selectedInstance}
            isRunning={isRunning}
            resolve={resolve}
            handleKillGame={handleKillGame}
            handleLaunchSelected={handleLaunchSelected}
            working={working}
            setTabAnimated={setTabAnimated}
          />
        );
      case "instances":
        return (
          <InstancesTab
            instances={instances}
            selectedInstance={selectedInstance}
            selectedInstanceId={selectedInstanceId}
            setSelectedInstanceId={setSelectedInstanceId}
            instanceCardRefs={instanceCardRefs}
            createCardMeasureRef={createCardMeasureRef}
            createMode={createMode}
            setCreateMode={setCreateMode}
            createBuildName={createBuildName}
            setCreateBuildName={setCreateBuildName}
            createVersion={createVersion}
            setCreateVersion={setCreateVersion}
            createLoader={createLoader}
            setCreateLoader={setCreateLoader}
            loaderVersions={loaderVersions}
            loaderVersionsLoading={loaderVersionsLoading}
            createLoaderVersion={createLoaderVersion}
            setCreateLoaderVersion={setCreateLoaderVersion}
            createError={createError}
            setCreateError={setCreateError}
            createRamGb={createRamGb}
            setCreateRamGb={setCreateRamGb}
            createRamEditorOpen={createRamEditorOpen}
            setCreateRamEditorOpen={setCreateRamEditorOpen}
            instanceRamDraft={instanceRamDraft}
            setInstanceRamDraft={setInstanceRamDraft}
            instanceRamEditorOpen={instanceRamEditorOpen}
            setInstanceRamEditorOpen={setInstanceRamEditorOpen}
            commitSelectedInstanceRam={commitSelectedInstanceRam}
            systemRamGb={systemRamGb}
            launcherSettings={launcherSettings}
            minecraftVersions={minecraftVersions}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            working={working}
            busyMessage={busyMessage}
            actionError={actionError}
            installProgress={installProgress}
            advancedSettingsEnabled={advancedSettingsEnabled}
            getBuildCardAppearance={getBuildCardAppearance}
            buildCardSettingsOpen={buildCardSettingsOpen}
            buildSettingsTargetId={buildSettingsTargetId}
            buildCardSettingsDraft={buildCardSettingsDraft}
            buildCardPreviewSize={buildCardPreviewSize}
            buildCardPreviewTarget={buildCardPreviewTarget}
            createPreviewName={createPreviewName}
            createPreviewVersion={createPreviewVersion}
            createPreviewLoader={createPreviewLoader}
            createPreviewRam={createPreviewRam}
            createMeasureAppearance={createMeasureAppearance}
            resolveBuildCardContentTags={resolveBuildCardContentTags}
            resolveForTarget={resolveForTarget}
            isRunning={isRunning}
            handleCreateBuild={handleCreateBuild}
            handleInstallSelected={handleInstallSelected}
            handleLaunchSelected={handleLaunchSelected}
            handleKillGame={handleKillGame}
            handleDeleteInstance={handleDeleteInstance}
            handleOpenFolder={handleOpenFolder}
            setStatsInstanceId={setStatsInstanceId}
            openBuildCardSettings={openBuildCardSettings}
          />
        );
      case "mods":
        return (
          <ModsTab
            modSearch={modSearch}
            setModSearch={setModSearch}
            modrinthItems={modrinthItems}
            modrinthTotalHits={modrinthTotalHits}
            modrinthLoading={modrinthLoading}
            modrinthLoadingMore={modrinthLoadingMore}
            modrinthError={modrinthError}
            modrinthInstallBusyId={modrinthInstallBusyId}
            installedMods={installedMods}
            installedModsLoading={installedModsLoading}
            moddedInstances={moddedInstances}
            selectedModTarget={selectedModTarget}
            selectedInstanceId={selectedInstanceId}
            setSelectedInstanceId={setSelectedInstanceId}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            resolveForTarget={resolveForTarget}
            handleLoadMoreMods={handleLoadMoreMods}
            handleInstallMod={handleInstallMod}
            handleUninstallMod={handleUninstallMod}
          />
        );
      case "resourcepacks":
        return (
          <ResourcePacksTab
            packSearch={packSearch}
            setPackSearch={setPackSearch}
            packItems={packItems}
            packTotalHits={packTotalHits}
            packLoading={packLoading}
            packLoadingMore={packLoadingMore}
            packError={packError}
            packInstallBusyId={packInstallBusyId}
            installedPacks={installedPacks}
            installedPacksLoading={installedPacksLoading}
            instances={instances}
            selectedInstance={selectedInstance}
            setSelectedInstanceId={setSelectedInstanceId}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            resolveForTarget={resolveForTarget}
            handleLoadMorePacks={handleLoadMorePacks}
            handleInstallPack={handleInstallPack}
            handleUninstallPack={handleUninstallPack}
          />
        );
      case "shaders":
        return (
          <ShadersTab
            shaderSearch={shaderSearch}
            setShaderSearch={setShaderSearch}
            shaderItems={shaderItems}
            shaderTotalHits={shaderTotalHits}
            shaderLoading={shaderLoading}
            shaderLoadingMore={shaderLoadingMore}
            shaderError={shaderError}
            shaderInstallBusyId={shaderInstallBusyId}
            installedShaders={installedShaders}
            installedShadersLoading={installedShadersLoading}
            instances={instances}
            selectedShaderTarget={selectedShaderTarget}
            setSelectedInstanceId={setSelectedInstanceId}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            resolveForTarget={resolveForTarget}
            handleLoadMoreShaders={handleLoadMoreShaders}
            handleInstallShader={handleInstallShader}
            handleUninstallShader={handleUninstallShader}
          />
        );
      case "settings":
        return (
          <SettingsTab
            systemRamGb={systemRamGb}
            settingsRamDraft={settingsRamDraft}
            setSettingsRamDraft={setSettingsRamDraft}
            saveSettingsRam={saveSettingsRam}
            wheelTabSwitching={wheelTabSwitching}
            setWheelTabSwitching={setWheelTabSwitching}
            showSnapshots={showSnapshots}
            setShowSnapshots={setShowSnapshots}
            showPreReleases={showPreReleases}
            setShowPreReleases={setShowPreReleases}
            advancedSettingsEnabled={advancedSettingsEnabled}
            onToggleAdvanced={() => {
              setAdvancedSettingsEnabled((prev) => {
                const next = !prev;
                window.localStorage.setItem("screenlauncher-advanced-settings-enabled", String(next));
                return next;
              });
            }}
            resolve={resolve}
            manifestLoading={manifestLoading}
            manifest={manifest}
          />
        );
      default:
        return null;
    }
  };

  const mainUI = (
    <div className="ui-container" onWheel={onWheelTabs}>
      <div className="paper-texture" />

      <header
        className="gallery-header"
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).tagName !== "BUTTON") {
            void win.startDragging();
          }
        }}
      >
        <div className="nav-brand">ARCHIVE // MINECRAFT LAUNCHER</div>
        <div className="nav-controls">
          <button onClick={() => void win.minimize()} type="button">MINIMIZE</button>
          <button onClick={() => void handleMaximize()} type="button">EXPAND</button>
          <button onClick={() => void handleClose()} className="close-btn" type="button">CLOSE</button>
        </div>
      </header>

      <main className="gallery-content">
        <aside className="sidebar">
          <div className="index-number">{TAB_INDEX[activeTab]}</div>

          <nav className="side-nav">
            {TAB_ORDER.map((tab) => (
              <button
                key={tab}
                className={activeTab === tab ? "active" : ""}
                onClick={() => setTabAnimated(tab)}
                type="button"
              >
                {TAB_TITLE[tab]}
              </button>
            ))}
          </nav>
        </aside>

        <section
          className={`main-stage ${activeTab === "overview" ? "with-right-panel" : "no-right-panel"}`}
        >
          <div className={`content-wrap launcher-wrap ${tabAnimating ? "tab-animated" : ""}`}>
            {renderMainContent()}
          </div>

          {activeTab === "overview" && selectedInstance && (
            <OverviewPanel
              resolve={resolve}
              nickname={nickname}
              setNickname={setNickname}
              accountType={accountType}
              setAccountType={setAccountType}
              openDropdown={openDropdown}
              setOpenDropdown={setOpenDropdown}
            />
          )}
        </section>
      </main>

      <footer className="gallery-footer">
        <div className="footer-left">CORE: RUST_NATIVE / OFFLINE_VANILLA</div>
        <div className="footer-right">CREATE / INSTALL / PLAY ↓</div>
      </footer>
    </div>
  );

  return (
    <div className={`gallery-root ${phase} ${isClosing ? "tearing" : ""}`}>
      {!isClosing ? (
        mainUI
      ) : (
        <>
          <div
            className="tear-half left-half"
            style={{ clipPath: `polygon(0% 0%, ${tearPath}, 0% 100%)` }}
          >
            <div className="fixed-content">{mainUI}</div>
          </div>
          <div
            className="tear-half right-half"
            style={{ clipPath: `polygon(100% 0%, ${tearPath}, 100% 100%)` }}
          >
            <div className="fixed-content">{mainUI}</div>
          </div>
        </>
      )}

      {buildCardSettingsOpen && (
        <BuildCardSettingsPopup
          isCreateMode={!buildSettingsTargetId}
          buildName={buildSettingsTargetInstance?.name || createPreviewName}
          buildVersion={buildSettingsTargetInstance?.version || createPreviewVersion}
          buildLoader={buildSettingsTargetInstance?.loader || createPreviewLoader}
          buildRamGb={buildSettingsTargetInstance?.ram || createPreviewRam}
          lastPlayedLabel={
            buildSettingsTargetInstance
              ? formatLastPlayed(buildSettingsTargetInstance.lastPlayed ?? "0")
              : "Never played"
          }
          badgePreviewText={buildCardPreviewBadgeText}
          resolvePreviewText={(template) =>
            resolveForTarget(template, buildCardPreviewTarget, { buildState: "RUNNING" })
          }
          previewCardSize={buildCardPreviewSize}
          draft={buildCardSettingsDraft}
          onDraftChange={setBuildCardSettingsDraft}
          onUploadImage={handleBuildCardImagePicked}
          onResetAll={clearBuildCardSettings}
          onClose={closeBuildCardSettings}
          onSave={saveBuildCardSettings}
        />
      )}

      {statsInstanceId && (() => {
        const si = instances.find((i) => i.id === statsInstanceId);
        return si ? (
          <BuildStatsModal instance={si} onClose={() => setStatsInstanceId(null)} />
        ) : null;
      })()}

      {confirmPendingId && (
        <div className="confirm-overlay" onClick={() => { setConfirmPendingId(null); setConfirmPendingName(""); }}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <span className="confirm-label">DELETE BUILD</span>
            <p className="confirm-title">{confirmPendingName}</p>
            <p className="confirm-body">
              Все файлы сборки будут удалены с диска безвозвратно.
            </p>
            <div className="confirm-actions">
              <button
                className="primary-action kill-action confirm-btn-delete"
                type="button"
                onClick={handleDeleteConfirmed}
              >
                DELETE
              </button>
              <button
                className="ghost-action"
                type="button"
                onClick={() => { setConfirmPendingId(null); setConfirmPendingName(""); }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
"""

path = "d:/JBProjects/RUST/screen/src/App.tsx"

with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Find renderOverview start (0-indexed)
start_idx = None
for i, line in enumerate(lines):
    if "  const renderOverview = () => {" in line:
        start_idx = i
        break

if start_idx is None:
    raise RuntimeError("renderOverview not found!")

print(f"Cutting from line {start_idx + 1} onwards ({len(lines) - start_idx} lines removed)")

keep = lines[:start_idx]
with open(path, "w", encoding="utf-8") as f:
    f.writelines(keep)
    f.write(NEW_RENDER)

with open(path, "r", encoding="utf-8") as f:
    new_lines = f.readlines()

print(f"New line count: {len(new_lines)}")
print("Done!")
