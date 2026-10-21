import { interfaceEn } from "./interface.en";
import { appearanceEn } from "./appearance.en";
import type { RussianMessages } from "./ru";
import type { EnglishPlural } from "./types";

type EnglishMessages = {
  readonly [K in keyof RussianMessages]: RussianMessages[K] extends string ? string : EnglishPlural;
};

/** English interface text. Keys mirror `ru.ts`. */
export const en: EnglishMessages = {
  ...interfaceEn,
  ...appearanceEn,
  "commandPalette.title": "Quick commands",
  "commandPalette.shortcut": "Ctrl+K",
  "commandPalette.context": "Player: {player}. Selected build: {build}.",
  "commandPalette.contextTag": "Player & build",
  "commandPalette.drag": "Drag — release to spring back",
  "commandPalette.contentTarget": "Content target build: {name}",
  "commandPalette.placeholder": "Settings, actions, builds, mods…",
  "commandPalette.results": "Commands, settings and content",
  "commandPalette.search.mods": "Search mods for “{query}”",
  "commandPalette.search.resourcepacks": "Search resource packs for “{query}”",
  "commandPalette.search.shaders": "Search shaders for “{query}”",
  "commandPalette.mods": "Mods",
  "commandPalette.resourcepacks": "Resource packs",
  "commandPalette.shaders": "Shaders",
  "commandPalette.installed": "Installed",
  "commandPalette.actions": "Actions",
  "commandPalette.sections": "Sections",
  "commandPalette.revealSetting": "Go to setting",
  "commandPalette.selectBuild": "Select a build to search",
  "commandPalette.loading": "Searching Modrinth…",
  "commandPalette.catalogError": "Could not load: {kinds}. You can retry the search in the catalog.",
  "commandPalette.stopBuild": "Stop game",
  "commandPalette.installFiles": "Install Minecraft files",
  "commandPalette.deletedBuilds": "Build trash",
  "commandPalette.accounts": "Microsoft accounts",
  "commandPalette.appearanceStudio": "Appearance editor",
  "commandPalette.searchTarget": "Modrinth · {name}",
  "commandPalette.searchNeedsBuild": "Modrinth · select a build with a mod loader to search",
  "commandPalette.openFolder": "Open folder",
  "commandPalette.launchBuild": "Launch build",
  "commandPalette.createBuild": "Create build",
  "commandPalette.empty": "No commands available yet",
  // app
  "app.youHaveTheLatest": "You have the latest version",
  "app.enterABuildName": "Enter a build name",
  "app.chooseAMinecraftVersion": "Choose a Minecraft version",
  "app.chooseALoaderVersion": "Choose a {createLoader} loader version",
  "app.creatingBuild": "Creating build...",
  "app.buildCreated": "Build created",
  "app.buildCreatedCleanName": "Build {cleanName} created",
  "app.createFailed": "Create failed",
  "app.installingMinecraftFiles": "Installing Minecraft files...",
  "app.installFinished": "Install finished",
  "app.filesInstalled": "{name} files installed",
  "app.installComplete": "Install complete",
  "app.installFailed": "Install failed",
  "app.selectAMicrosoftAccount": "Select a Microsoft account before launching",
  "app.launched": "{name} launched",
  "app.minecraftLaunched": "Minecraft launched",
  "app.minecraftIsStillRunning": "Minecraft is still running after the stop request.",
  "app.stillRunning": "Still running",
  "app.stopTheGameBefore": "Stop the game before moving this build to trash.",
  "app.buildIsRunning": "Build is running",
  "app.buildMovedToTrash": "Build {deletedName} moved to trash",
  "app.buildMovedToTrash2": "Build moved to trash",
  "app.buildRestored": "Build {name} restored",
  "app.buildRestored2": "Build restored",
  "app.buildPermanentlyDeleted": "Build permanently deleted",
  "app.buildDeleted": "Build deleted",
  "app.theMascotHidFrom": "The mascot hid {hiddenName} from the list; its files are safe.",
  "app.mascotChaos": "Mascot chaos",
  "app.dropJarZipOn": "Drop .jar/.zip on a build or .mrpack/.slbuild to import",
  "app.nothingToInstall": "Nothing to install",
  "app.chooseABuildFor": "Choose a build for these files first",
  "app.noBuildSelected": "No build selected",
  "app.startTheLauncherGuide": "Start the launcher guide",
  "app.guide": "GUIDE",
  "app.minimize": "MINIMIZE",
  "app.expand": "EXPAND",
  "app.player": "PLAYER",
  "app.launcherSections": "Launcher sections",
  "app.createInstallPlay": "CREATE / INSTALL / PLAY ↓",
  "app.dropToImportBuild": "DROP TO IMPORT BUILD",
  "app.dropIntoBuild": "DROP INTO BUILD {value}",
  "app.chooseABuild": "CHOOSE A BUILD",
  "app.selectABuildFirst": "select a build first",
  "app.neverPlayed": "Never played",
  "app.deleteBuild": "DELETE BUILD",
  "app.theBuildWillBe":
    "The build will be hidden from the list. Its files stay on disk, and you can restore it from the trash.",
  "app.allBuildFilesWill": "All build files will be permanently removed from disk.",
  "app.moveToTrash": "MOVE TO TRASH",

  // blueMap
  "blueMap.worldMap": "WORLD MAP",
  "blueMap.addressOfTheInteractive": "Address of the interactive map",
  "blueMap.mapAddress": "MAP ADDRESS",
  "blueMap.serverAndJava": "SERVER AND JAVA",
  "blueMap.bluemapPathWorkingFolder": "BlueMap path, working folder, and update options",
  "blueMap.bluemapCliFileJar": "BLUEMAP CLI FILE · JAR",
  "blueMap.workingFolder": "WORKING FOLDER",
  "blueMap.folderContainingTheJar": "Folder containing the JAR file",
  "blueMap.backgroundRender": "BACKGROUND RENDER",
  "blueMap.mapUpdate": "MAP UPDATE",
  "blueMap.mapControls": "MAP CONTROLS",
  "blueMap.prepare": "PREPARE",
  "blueMap.working": "Working…",
  "blueMap.start": "START",
  "blueMap.stop": "STOP",
  "blueMap.hideMap": "HIDE MAP",
  "blueMap.showMap": "SHOW MAP",
  "blueMap.inBrowser": "IN BROWSER",
  "blueMap.inWindow": "IN WINDOW",
  "blueMap.state": "STATE",
  "blueMap.world": "WORLD",
  "blueMap.serverLog": "SERVER LOG",
  "blueMap.eventsBluemapMessages": "{value} events · BlueMap messages",

  // bot.combatSettings
  "bot.combatSettings.enablePvp": "ENABLE PVP",
  "bot.combatSettings.tacticsAndSkill": "TACTICS AND SKILL",
  "bot.combatSettings.adaptiveCombat": "ADAPTIVE COMBAT",
  "bot.combatSettings.aggressiveClosingInFinishing":
    "Aggressive closing in, finishing off, and choosing actions by health and situation. Decisions update every game tick.",
  "bot.combatSettings.healingInCombat": "HEALING IN COMBAT",
  "bot.combatSettings.potionsGoldenApplesAnd":
    "Potions, golden apples, and food. Adaptive combat helps retreat to heal; auto-buffs are configured in the “Survival” section.",
  "bot.combatSettings.pearlRetreat": "PEARL RETREAT",
  "bot.combatSettings.createDistanceToHeal":
    "Create distance to heal. Requires pearls to be enabled and respects the reserve, health, and a safe landing.",
  "bot.combatSettings.tactic": "TACTIC",
  "bot.combatSettings.autoPressureAndWeapon": "Auto: pressure and weapon choice",
  "bot.combatSettings.meleeOnly": "Melee only",
  "bot.combatSettings.bowOnly": "Bow only",
  "bot.combatSettings.endCrystals": "End crystals",
  "bot.combatSettings.targetSelection": "TARGET SELECTION",
  "bot.combatSettings.onCommandOnly": "On command only",
  "bot.combatSettings.autoHostileMobs": "Auto: hostile mobs",
  "bot.combatSettings.searchChaseRange": "SEARCH / CHASE RANGE",
  "bot.combatSettings.reactionMs": "REACTION, MS",
  "bot.combatSettings.melee": "MELEE",
  "bot.combatSettings.combatEngine": "COMBAT ENGINE",
  "bot.combatSettings.customPvpTacticsAnd": "Custom PvP — tactics and crits",
  "bot.combatSettings.mineflayerPvpBasicCombat": "Mineflayer PvP — basic combat",
  "bot.combatSettings.weapon": "WEAPON",
  "bot.combatSettings.sword": "Sword",
  "bot.combatSettings.axe": "Axe",
  "bot.combatSettings.maceWindCharge": "Mace + wind charge",
  "bot.combatSettings.meleeSkill": "MELEE SKILL",
  "bot.combatSettings.maxHitsPerSecond": "MAX HITS PER SECOND",
  "bot.combatSettings.hitRangeBlocks": "HIT RANGE, BLOCKS",
  "bot.combatSettings.strafe": "STRAFE",
  "bot.combatSettings.off": "Off",
  "bot.combatSettings.smart": "Smart",
  "bot.combatSettings.circle": "Circle",
  "bot.combatSettings.random": "Random",
  "bot.combatSettings.criticalHits": "CRITICAL HITS",
  "bot.combatSettings.off2": "Off",
  "bot.combatSettings.jump": "Jump",
  "bot.combatSettings.shortJump": "Short jump",
  "bot.combatSettings.sprintReset": "SPRINT RESET",
  "bot.combatSettings.sprintCancel": "Sprint cancel",
  "bot.combatSettings.aLowSkillAdds":
    "A low skill adds missed hits. Attack speed is also limited by weapon cooldown in your Minecraft version. Strafing, crits, sprint reset, and shield breaking work in Custom PvP. Shield breaking uses a jumping axe hit even if general crits are off. If there is no sword, the bot lands axe crits on every fully charged hit.",
  "bot.combatSettings.minecraftJava121":
    "Minecraft Java 1.21+: put a mace and wind charges in the inventory. The bot jumps, throws a charge at its feet, heads to the target, and strikes on the way down after falling more than 1.5 blocks. After a confirmed hit it repeats the combo; Wind Burst lets it continue the chain in the air. If the target raises a shield, Custom PvP uses the axe first when shield breaking is on. Without charges it makes regular mace hits with cooldown. The combo works with both combat engines.",
  "bot.combatSettings.useShield": "USE SHIELD",
  "bot.combatSettings.inTheInventoryOr": "IN THE INVENTORY OR OFF HAND",
  "bot.combatSettings.breakShields": "BREAK SHIELDS",
  "bot.combatSettings.axeAndAJump": "AXE AND A JUMP HIT",
  "bot.combatSettings.maceDefense": "MACE DEFENSE",
  "bot.combatSettings.raiseTheShieldAnd": "RAISE THE SHIELD AND WATCH A FALLING ENEMY",
  "bot.combatSettings.pearlChase": "PEARL CHASE",
  "bot.combatSettings.closeInOnA": "CLOSE IN ON A DISTANT ENEMY AND FOLLOW THEIR TELEPORT",
  "bot.combatSettings.theBotThrowsA":
    "The bot throws a pearl toward a distant enemy at the minimum throw distance, even if the enemy doesn't use pearls. After the enemy teleports, it follows to where they appear and keeps fighting. This switch works independently of movement pearls; safe landing, reserve, health, and the pause between throws are taken into account.",
  "bot.combatSettings.smoothAim": "SMOOTH AIM",
  "bot.combatSettings.turnSpeedTowardThe": "Turn speed toward the target before a hit or shot",
  "bot.combatSettings.aimSpeed": "AIM SPEED",
  "bot.combatSettings.100IsTheNormal":
    "100% is the normal head turn speed. 50% is twice as slow, 200% twice as fast. Applies to the sword and bow when smooth aim is on.",
  "bot.combatSettings.arrowDefense": "ARROW DEFENSE",
  "bot.combatSettings.aimDetection": "AIM DETECTION",
  "bot.combatSettings.earlyDetection": "Early detection",
  "bot.combatSettings.byArrowTrajectory": "By arrow trajectory",
  "bot.combatSettings.checkIntervalMs": "CHECK INTERVAL, MS",
  "bot.combatSettings.detectionRangeBlocks": "DETECTION RANGE, BLOCKS",
  "bot.combatSettings.sensitivityMarginBlocks": "SENSITIVITY MARGIN, BLOCKS",
  "bot.combatSettings.shieldHoldAfterThreat": "SHIELD HOLD AFTER THREAT, MS",
  "bot.combatSettings.onlyWhenTheBow": "ONLY WHEN THE BOW IS DRAWN",
  "bot.combatSettings.dontReactToA": "DON'T REACT TO A BOW JUST HELD IN HAND",
  "bot.combatSettings.earlyModeNoticesThe":
    "Early mode notices the aim direction while the bow is drawn. Trajectory mode checks the flight at different shot strengths. A larger sensitivity margin gives earlier defense. Turns and draw are checked immediately when the server updates the player.",
  "bot.combatSettings.bowShooting": "BOW SHOOTING",
  "bot.combatSettings.trajectoryCalculation": "TRAJECTORY CALCULATION",
  "bot.combatSettings.aimAccuracy": "AIM ACCURACY",
  "bot.combatSettings.bowRangeBlocks": "BOW RANGE, BLOCKS",
  "bot.combatSettings.shotIntervalMs": "SHOT INTERVAL, MS",
  "bot.combatSettings.leadTarget": "LEAD TARGET",
  "bot.combatSettings.accountForTargetMovement": "ACCOUNT FOR TARGET MOVEMENT",
  "bot.combatSettings.bowInOffHand": "BOW IN OFF HAND",
  "bot.combatSettings.inVersionsWithAn": "IN VERSIONS WITH AN OFF HAND",
  "bot.combatSettings.switchToSword": "SWITCH TO SWORD",
  "bot.combatSettings.whenOutOfBow": "WHEN OUT OF BOW OR ARROWS",
  "bot.combatSettings.accuracySetsTheAim":
    "Accuracy sets the aim spread: 100% removes the added spread. Hits depend on the target's movement and the server. Auto-targeting only attacks hostile mobs. A command with a nickname can challenge any player, including the owner.",
  "bot.combatSettings.endCrystals2": "END CRYSTALS",
  "bot.combatSettings.placeCrystals": "PLACE CRYSTALS",
  "bot.combatSettings.onObsidianAndBedrock": "ON OBSIDIAN AND BEDROCK WITHIN REACH",
  "bot.combatSettings.detonateCrystals": "DETONATE CRYSTALS",
  "bot.combatSettings.accountingForDamageAnd": "ACCOUNTING FOR DAMAGE AND CHAIN EXPLOSIONS",
  "bot.combatSettings.buildABase": "BUILD A BASE",
  "bot.combatSettings.placeObsidianFromThe": "PLACE OBSIDIAN FROM THE INVENTORY",
  "bot.combatSettings.coverBlock": "COVER BLOCK",
  "bot.combatSettings.reduceSelfDamageBefore": "REDUCE SELF-DAMAGE BEFORE THE BLAST",
  "bot.combatSettings.fastCrystalAim": "FAST CRYSTAL AIM",
  "bot.combatSettings.turnWithoutWaitingFor": "TURN WITHOUT WAITING FOR THE SMOOTH ANIMATION",
  "bot.combatSettings.targetMovementPrediction": "TARGET MOVEMENT PREDICTION",
  "bot.combatSettings.checkTheCurrentAnd": "CHECK THE CURRENT AND FUTURE POSITION",
  "bot.combatSettings.protectOtherOwners": "PROTECT OTHER OWNERS",
  "bot.combatSettings.dontDetonateNearThem": "DON'T DETONATE NEAR THEM",
  "bot.combatSettings.positionChoice": "POSITION CHOICE",
  "bot.combatSettings.moreDamage": "More damage",
  "bot.combatSettings.closerToTheBot": "Closer to the bot",
  "bot.combatSettings.coverBlockType": "COVER BLOCK TYPE",
  "bot.combatSettings.automatic": "Automatic",
  "bot.combatSettings.obsidian": "Obsidian",
  "bot.combatSettings.planks": "Planks",
  "bot.combatSettings.cobblestone": "Cobblestone",
  "bot.combatSettings.placeRangeBlocks": "PLACE RANGE, BLOCKS",
  "bot.combatSettings.breakRangeBlocks": "BREAK RANGE, BLOCKS",
  "bot.combatSettings.actionIntervalMs": "ACTION INTERVAL, MS",
  "bot.combatSettings.maxCoverBlocks": "MAX COVER BLOCKS",
  "bot.combatSettings.waitForCrystalFrom": "WAIT FOR CRYSTAL FROM SERVER, MS",
  "bot.combatSettings.crystalPlacementAttempts": "CRYSTAL PLACEMENT ATTEMPTS",
  "bot.combatSettings.minTargetDamageHp": "MIN TARGET DAMAGE, HP",
  "bot.combatSettings.maxSelfDamageHp": "MAX SELF DAMAGE, HP",
  "bot.combatSettings.keepHealthHp": "KEEP HEALTH, HP",
  "bot.combatSettings.predictTicksAhead": "PREDICT TICKS AHEAD",
  "bot.combatSettings.needsCrystalsAndFree":
    "Needs crystals and free space above obsidian or bedrock. The bot checks obstacles, occupied positions, and damage before acting, waits for server confirmation, and limits retries. The damage estimate accounts for armor and cover blocks. 2 HP equal one heart.",
  "bot.combatSettings.enderPearl": "ENDER PEARL",
  "bot.combatSettings.pearlForFollow": "PEARL FOR FOLLOW",
  "bot.combatSettings.shortenTheRouteAfter": "SHORTEN THE ROUTE AFTER A PLAYER",
  "bot.combatSettings.pearlForCome": "PEARL FOR COME",
  "bot.combatSettings.shortenTheRouteTo": "SHORTEN THE ROUTE TO A PLAYER",
  "bot.combatSettings.pearlForGoto": "PEARL FOR GOTO",
  "bot.combatSettings.useOnTheWay": "USE ON THE WAY TO COORDINATES",
  "bot.combatSettings.repeatedThrows": "REPEATED THROWS",
  "bot.combatSettings.planTheNextLeg": "PLAN THE NEXT LEG AFTER TELEPORTING",
  "bot.combatSettings.minRouteShorteningBlocks": "MIN ROUTE SHORTENING, BLOCKS",
  "bot.combatSettings.maxThrowRangeBlocks": "MAX THROW RANGE, BLOCKS",
  "bot.combatSettings.pauseBetweenThrowsMs": "PAUSE BETWEEN THROWS, MS",
  "bot.combatSettings.minHealthBeforeThrowing": "MIN HEALTH BEFORE THROWING, HP",
  "bot.combatSettings.pearlsToKeepIn": "PEARLS TO KEEP IN RESERVE",
  "bot.combatSettings.theCalculationAccountsFor":
    "The calculation accounts for the bot's speed and pose, gravity, air and water drag, and collisions. A throw is only allowed onto a loaded solid surface with room for the bot. If there are not enough pearls, health, or safe trajectories, the bot walks. After a throw it waits for the teleport. A pearl usually costs 5 HP. Movement works even with PvP off. Enemy chasing is enabled in the “Melee” section.",
  "bot.combatSettings.stopHint":
    "Instead of player you can specify nearest for the closest hostile mob. Movement commands and {stop} end combat. Settings apply the next time the bot starts.",

  // bot.farmCrop
  "bot.farmCrop.crop": "CROP",

  // bot.farming
  "bot.farming.theBotNeedsA":
    "The bot needs a hoe and seeds. Tilling happens next to water; planting goes into empty beds, and nether wart goes on soul sand. The bot only harvests ripe crops. Plants grow by the usual Minecraft rules; run the task again for the next harvest.",
  "bot.farming.anyCrops": "Any crops",

  // bot.gathering
  "bot.gathering.tillingSoil": "Tilling soil",
  "bot.gathering.plantingSeeds": "Planting seeds",
  "bot.gathering.harvestingCrops": "Harvesting crops",
  "bot.gathering.tendingTheFarm": "Tending the farm",
  "bot.gathering.diggingATunnel": "Digging a tunnel",
  "bot.gathering.logging": "Logging",
  "bot.gathering.clearingAnArea": "Clearing an area",
  "bot.gathering.collectingItems": "Collecting items",
  "bot.gathering.unloadingIntoAChest": "Unloading into a chest",
  "bot.gathering.deliveringToTheOwner": "Delivering to the owner",
  "bot.gathering.iron": "iron",
  "bot.gathering.diamonds": "diamonds",
  "bot.gathering.gold": "gold",
  "bot.gathering.coal": "coal",
  "bot.gathering.copper": "copper",
  "bot.gathering.emeralds": "emeralds",
  "bot.gathering.redstone": "redstone",
  "bot.gathering.lapis": "lapis",
  "bot.gathering.mining": "Mining",
  "bot.gathering.ores": "ores",
  "bot.gathering.blocks": "blocks",
  "bot.gathering.radiusBlocks": { one: "radius {count} block", other: "radius {count} blocks" },
  "bot.gathering.blocksInTheArea": {
    one: "{count} block in the area",
    other: "{count} blocks in the area",
  },
  "bot.gathering.targetBlocks": { one: "target {count} block", other: "target {count} blocks" },
  "bot.gathering.allAvailableBlocks": "all available blocks",
  "bot.gathering.couldNotGetThe":
    "Could not get the selected point. Reconnect the bot and select again.",
  "bot.gathering.cornerSelectedTheCoordinates":
    "Corner {capture} selected. The coordinates were filled into the form.",
  "bot.gathering.miningDefenseAppliedTo": "Mining defense applied to the bot.",
  "bot.gathering.settingsAppliedTheNext":
    "Settings applied. The next passage will use the new size.",
  "bot.gathering.theBotIsBringing": "The bot is bringing the loot to you, then returns to work.",
  "bot.gathering.commandAcceptedTheCurrent": "Command accepted. The current stage is shown below.",
  "bot.gathering.firstCornerXY": "FIRST CORNER · X Y Z",
  "bot.gathering.secondCornerXY": "SECOND CORNER · X Y Z",
  "bot.gathering.pickAPointIn": "Pick a point in-game or enter X Y Z",
  "bot.gathering.myPosition": "My position",
  "bot.gathering.blockImAimingAt": "Block I'm aiming at",
  "bot.gathering.gatheringTasks": "GATHERING TASKS",
  "bot.gathering.addWorkToThe":
    "Add work to the queue. The bot runs tasks in order and keeps the loot in its inventory.",
  "bot.gathering.youCanSetUp": "You can set up a task in advance. Click “Connect bot” to start it.",
  "bot.gathering.bringMeTheLoot": "BRING ME THE LOOT",
  "bot.gathering.inventoryAndStatus": "INVENTORY AND STATUS",
  "bot.gathering.addYourFirstTask": "Add your first task",
  "bot.gathering.mined": "Mined",
  "bot.gathering.collected": "Collected",
  "bot.gathering.taskList": "Task list",
  "bot.gathering.actions": "Actions",
  "bot.gathering.delivered": "Delivered",
  "bot.gathering.currentTaskProgress": "Current task progress",
  "bot.gathering.cancelTask": "Cancel task",
  "bot.gathering.cancelTheCurrentTask": "Cancel the current task",
  "bot.gathering.afterDelivery": "After delivery",
  "bot.gathering.queue": "QUEUE",
  "bot.gathering.clearQueue": "Clear queue",
  "bot.gathering.moveTaskUp": "Move task up",
  "bot.gathering.up": "Up",
  "bot.gathering.moveTaskDown": "Move task down",
  "bot.gathering.down": "Down",
  "bot.gathering.removeTask": "Remove task",
  "bot.gathering.remove": "Remove",
  "bot.gathering.theNextTaskWill": "The next task will appear here once you add it.",
  "bot.gathering.theQueueIsEmpty": "The queue is empty. Choose work below.",
  "bot.gathering.cancelAll": "CANCEL ALL",
  "bot.gathering.addATask": "ADD A TASK",
  "bot.gathering.typeOfWork": "Type of work",
  "bot.gathering.actions0All": "ACTIONS · 0 = ALL",
  "bot.gathering.blocksOrGroup": "BLOCKS OR GROUP",
  "bot.gathering.nameOrIdDiamond": "Name or ID · diamond, iron, ores",
  "bot.gathering.blockCount0All": "BLOCK COUNT · 0 = ALL",
  "bot.gathering.horizontalRadius": "HORIZONTAL RADIUS",
  "bot.gathering.radiusBlocks2": "RADIUS · BLOCKS",
  "bot.gathering.minimumY": "MINIMUM Y",
  "bot.gathering.maximumY": "MAXIMUM Y",
  "bot.gathering.itemEmptyAll": "ITEM · EMPTY = ALL",
  "bot.gathering.nameOrIdDiamondRawIron": "Name or ID · diamond, raw_iron",
  "bot.gathering.length": "LENGTH",
  "bot.gathering.replantAfterHarvest": "REPLANT AFTER HARVEST",
  "bot.gathering.useSeedsFromThe": "Use seeds from the inventory and the harvest",
  "bot.gathering.standInTheCorner":
    "Stand in the corner or look at its block, then pick the point. The bot must be able to see you; the block you aim at must be within 6 blocks.",
  "bot.gathering.limitOf32768": "limit of 32,768 exceeded",
  "bot.gathering.eachCornerNeedsThree": "Each corner needs three numbers: X Y Z.",
  "bot.gathering.searchAllDepths": "SEARCH ALL DEPTHS",
  "bot.gathering.fromTheBottomOf": "From the bottom of the world; checks loaded chunks",
  "bot.gathering.removeLeaves": "REMOVE LEAVES",
  "bot.gathering.alongWithTheTrunks": "Along with the trunks",
  "bot.gathering.scaffoldForTallTrees": "SCAFFOLD FOR TALL TREES",
  "bot.gathering.usesBlocksFromThe": "Uses blocks from the inventory",
  "bot.gathering.looksForOreUnderground":
    "Looks for ore underground and digs a passage to the deposit. The radius limits the horizontal search; height is set separately. A suitable pickaxe is required.",
  "bot.gathering.chopsTheTrunksOf":
    "Chops the trunks of the chosen forest. Climbing needs building blocks; on the way down it removes the supports beneath it. Other supports stay.",
  "bot.gathering.clearsEverythingBetweenThe":
    "Clears everything between the corners, inclusive, from top to bottom. At most 32,768 blocks.",
  "bot.gathering.digsForwardInThe":
    "Digs forward in the direction the bot is facing. The floor under the tunnel is kept.",
  "bot.gathering.picksUpItemsLying": "Picks up items lying within the given radius.",
  "bot.gathering.addToQueue": "ADD TO QUEUE",
  "bot.gathering.addAndStart": "ADD AND START",
  "bot.gathering.completedTasks": "Completed tasks",
  "bot.gathering.defenseWhileGathering": "DEFENSE WHILE GATHERING",
  "bot.gathering.selfDefenseWhileMining":
    "Self-defense while mining, logging, collecting, and unloading",
  "bot.gathering.defendAgainstMobs": "DEFEND AGAINST MOBS",
  "bot.gathering.fightsOffDangerousMobs":
    "Fights off dangerous mobs nearby and those that attacked the bot",
  "bot.gathering.defendAgainstPlayers": "DEFEND AGAINST PLAYERS",
  "bot.gathering.hitsBackReturnsTo": "Hits back; returns to work after 3 seconds without new hits",
  "bot.gathering.defendAgainstArrows": "DEFEND AGAINST ARROWS",
  "bot.gathering.usesAShieldIf": "Uses a shield if available, otherwise looks for a safe retreat",
  "bot.gathering.usesTheCurrentMelee":
    "Uses the current melee settings. At low health, without a weapon, or near a creeper it retreats along a safe path. After the danger passes it continues the same task. A manual pause is kept. These settings also apply when automatic PvP is off.",
  "bot.gathering.applyToBot": "APPLY TO BOT",
  "bot.gathering.tunnelsAndLighting": "TUNNELS AND LIGHTING",
  "bot.gathering.passageSizeWhenMining": "Passage size when mining, stairs, and wall torches",
  "bot.gathering.tunnelWidthBlocks": "TUNNEL WIDTH · BLOCKS",
  "bot.gathering.tunnelHeightBlocks": "TUNNEL HEIGHT · BLOCKS",
  "bot.gathering.stairWidthBlocks": "STAIR WIDTH · BLOCKS",
  "bot.gathering.stairClearanceBlocks": "STAIR CLEARANCE · BLOCKS",
  "bot.gathering.flatTunnelsAre2":
    "Flat tunnels are 2 × 2 by default. Stairs rise or fall one block per step; the clearance above the floor is at least three blocks so you can jump without hitting your head. For delivery and returning, the bot looks for a route through existing passages.",
  "bot.gathering.placeTorchesInCaves": "PLACE TORCHES IN CAVES",
  "bot.gathering.usesRegularTorchesFrom":
    "Uses regular torches from the inventory and attaches them to walls",
  "bot.gathering.torchSpacingBlocks": "TORCH SPACING · BLOCKS",
  "bot.gathering.theDefaultSpacingIs":
    "The default spacing is 8 blocks. If there are no torches or no suitable wall, the bot keeps working. Settings are saved and applied when you add mining or a tunnel; for the current work, click “Apply to bot”.",
  "bot.gathering.lootIsKeptIn":
    "Loot is kept in the bot's inventory. “Bring me the loot” walks to the owner, drops the loot in front of them, and returns. Tools, armor, food, and up to 64 building blocks for pathing are kept. When the inventory fills up, the bot sorts the loot into the configured chest groups. Items without a matching group stay with the bot.",
  "bot.gathering.chatCornersHint":
    "You can mark both corners right in the in-game chat: {first} and {second}. Use your own prefix instead of {prefix}.",
  "bot.gathering.farmStats": "Tilled: {tilled} · Planted: {planted} · Harvested: {harvested}",
  "bot.gathering.minedStat": "Mined: {mined}",
  "bot.gathering.queueStats": "Collected: {collected} · Queued: {queued}",
  "bot.gathering.historyFarm": "tilled {tilled} · planted {planted} · harvested {harvested}",
  "bot.gathering.historyMined": "mined {mined}",
  "bot.gathering.historyCollected": "collected {collected}",
  "bot.gathering.areaBlocks": { one: "{count} block", other: "{count} blocks" },

  // bot.inventory
  "bot.inventory.slot": "Slot",
  "bot.inventory.empty": "empty",
  "bot.inventory.emptySlot": "Empty slot",
  "bot.inventory.health": "HEALTH",
  "bot.inventory.hunger": "HUNGER",
  "bot.inventory.saturation": "Saturation",
  "bot.inventory.armor": "ARMOR",
  "bot.inventory.armorPoints": "Armor points",
  "bot.inventory.inventoryAndStatus": "INVENTORY AND STATUS",
  "bot.inventory.theBotsItemsEquipment":
    "The bot's items, equipment, and stats update during play.",
  "bot.inventory.bot": "Bot",
  "bot.inventory.inGame": "In game",
  "bot.inventory.disconnected": "Disconnected",
  "bot.inventory.toGatheringTasks": "To gathering tasks →",
  "bot.inventory.loadingInventory": "Loading inventory…",
  "bot.inventory.connectTheBot": "Connect the bot",
  "bot.inventory.statsWillAppearOnce": "Stats will appear once the character has loaded.",
  "bot.inventory.clickConnectBotTo": "Click “Connect bot” to see items and status.",
  "bot.inventory.backpack": "BACKPACK",
  "bot.inventory.mainInventory": "Main inventory",
  "bot.inventory.hotbar": "HOTBAR",
  "bot.inventory.inHandSlot": "In hand: slot",
  "bot.inventory.hotbar2": "Hotbar",
  "bot.inventory.equipment": "EQUIPMENT",
  "bot.inventory.selectAnItemTo": "Select an item to see its count, durability, and enchantments.",
  "bot.inventory.thisSlotIsEmpty": "This slot is empty.",
  "bot.inventory.occupancy": {
    one: "{occupied} / {count} slot",
    other: "{occupied} / {count} slots",
  },
  "bot.inventory.itemCount": "{count} pcs",
  "bot.inventory.durabilityValue": "durability {current} / {max}",

  // bot.main
  "bot.main.sentToTheBot": "Sent to the bot",
  "bot.main.restart": "Restart",
  "bot.main.pleaseWait": "Please wait…",
  "bot.main.disconnect": "Disconnect",
  "bot.main.connectBot": "Connect bot",
  "bot.main.connected": "Connected",
  "bot.main.reconnecting": "Reconnecting…",
  "bot.main.connecting": "Connecting…",
  "bot.main.notConnected": "Not connected",
  "bot.main.noServerSet": "No server set",
  "bot.main.turnTheExtensionOn": "Turn the extension on with the switch above.",
  "bot.main.chooseASeparateMicrosoft": "Choose a separate Microsoft account for the bot.",
  "bot.main.setTheServerAnd": "Set the server and the bot account in the connection settings.",
  "bot.main.openSettings": "Open settings ↗",
  "bot.main.botWorkspace": "Bot workspace",
  "bot.main.settingsSections": "Settings sections",
  "bot.main.server": "SERVER",
  "bot.main.serverAddress": "SERVER ADDRESS",
  "bot.main.localhostOrPlayExample": "localhost or play.example.net",
  "bot.main.port": "PORT",
  "bot.main.version": "VERSION",
  "bot.main.botAccount": "BOT ACCOUNT",
  "bot.main.offline": "OFFLINE",
  "bot.main.botNickname": "BOT NICKNAME",
  "bot.main.noMicrosoftAccountsAdd":
    "No Microsoft accounts. Add a separate account in the launcher.",
  "bot.main.theActivePlayersAccount":
    "The active player's account is selected. The bot needs a separate account.",
  "bot.main.reconnecting2": "RECONNECTING",
  "bot.main.autoReconnect": "AUTO-RECONNECT",
  "bot.main.comeBackAfterA": "Come back after a lost connection",
  "bot.main.autoRespawn": "AUTO-RESPAWN",
  "bot.main.respawnAfterDying": "Respawn after dying",
  "bot.main.retryDelaySec": "RETRY DELAY · SEC",
  "bot.main.attempts0Unlimited": "ATTEMPTS · 0 = UNLIMITED",
  "bot.main.loginTimeoutSec": "LOGIN TIMEOUT · SEC",
  "bot.main.movementProfile": "MOVEMENT PROFILE",
  "bot.main.movementAndRoute": "MOVEMENT AND ROUTE",
  "bot.main.followDistance": "FOLLOW DISTANCE",
  "bot.main.arrivalRadius": "ARRIVAL RADIUS",
  "bot.main.maxFallHeight": "MAX FALL HEIGHT",
  "bot.main.sprint": "SPRINT",
  "bot.main.runOnStraightStretches": "Run on straight stretches",
  "bot.main.lowCeilingJumps": "LOW-CEILING JUMPS",
  "bot.main.frequentSprintJumpsIn":
    "Frequent sprint jumps in two-block tunnels and under leaves · needs sprint",
  "bot.main.parkour": "PARKOUR",
  "bot.main.jumpAcrossSmallGaps": "Jump across small gaps",
  "bot.main.blockBreaking": "BLOCK BREAKING",
  "bot.main.letsTheBotChange": "Lets the bot change the world",
  "bot.main.airStrafe": "AIR STRAFE",
  "bot.main.a45TurnFor": "A 45° turn for a longer jump",
  "bot.main.swimming": "SWIMMING",
  "bot.main.swimFastAndConserve": "Swim fast and conserve air",
  "bot.main.waterDropIntoWater": "WATER DROP INTO WATER",
  "bot.main.jumpIntoWaterAfter": "Jump into water after checking the trajectory",
  "bot.main.waterDropWithA": "WATER DROP WITH A BUCKET",
  "bot.main.placeWaterBeforeLanding": "Place water before landing and pick it up",
  "bot.main.routeDebugging": "ROUTE DEBUGGING",
  "bot.main.writeRouteChangesTo": "Write route changes to the log",
  "bot.main.antiKnockback": "ANTI-KNOCKBACK",
  "bot.main.blockPushesAndHits": "BLOCK PUSHES AND HITS · AFTER A BOT RESTART",
  "bot.main.afterJoiningTheServer": "AFTER JOINING THE SERVER",
  "bot.main.followTheOwner": "FOLLOW THE OWNER",
  "bot.main.startMovingAfterJoining": "Start moving after joining",
  "bot.main.joinMessage": "JOIN MESSAGE",
  "bot.main.greetingTextAndPlaceholders": "Greeting text and placeholders",
  "bot.main.messageText": "MESSAGE TEXT",
  "bot.main.readyOwner": "Ready, %owner%!",
  "bot.main.autoEat": "AUTO-EAT",
  "bot.main.safeFoodFromThe":
    "Safe food from the inventory · settings apply after the bot restarts",
  "bot.main.eatAtHungerOut": "EAT AT HUNGER ≤ · OUT OF 20",
  "bot.main.eatAtHunger": "EAT AT HUNGER",
  "bot.main.eatAtHealthOut": "EAT AT HEALTH ≤ · OUT OF 20",
  "bot.main.eatAtHealth": "EAT AT HEALTH",
  "bot.main.foodChoice": "FOOD CHOICE",
  "bot.main.moreSaturation": "More saturation",
  "bot.main.moreFoodPoints": "More food points",
  "bot.main.theBotPausesTo":
    "The bot pauses to eat and switches back to the previous item. Dangerous food and golden apples are kept. Regular food isn't used when hunger is full.",
  "bot.main.autoBuffsAndHealing": "AUTO-BUFFS AND HEALING POTIONS",
  "bot.main.potionsFromTheInventory":
    "Potions from the inventory in combat · settings apply after the bot restarts",
  "bot.main.healingPotions": "HEALING POTIONS",
  "bot.main.instantHealingAndRegeneration": "Instant healing and regeneration at low health",
  "bot.main.combatBuffs": "COMBAT BUFFS",
  "bot.main.strengthSpeedAndFire": "Strength, speed, and fire resistance at a safe distance",
  "bot.main.healAtHealthHp": "HEAL AT HEALTH ≤ · HP",
  "bot.main.healthForHealingPotion": "HEALTH FOR HEALING POTION",
  "bot.main.theBotUsesDrinkable":
    "The bot uses drinkable and splash potions, accounts for active effects, and switches back to its weapon. Splash potions are thrown at its feet away from other creatures. Lingering potions are kept. Adaptive combat helps retreat to heal.",
  "bot.main.emergencyMlg": "EMERGENCY MLG",
  "bot.main.aWaterBucketSave": "A water-bucket save after an accidental fall or knockback",
  "bot.main.minFallBlocks": "MIN FALL · BLOCKS",
  "bot.main.minFallForMlg": "MIN FALL FOR MLG",
  "bot.main.pickUpWaterAfter": "PICK UP WATER AFTER MLG",
  "bot.main.onlyYourOwnSource": "Only your own source and only after landing",
  "bot.main.aWaterBucketIs":
    "A water bucket is needed in the inventory. The bot calculates the trajectory accounting for speed and obstacles. Water isn't placed in the Nether. Planned Water Drops are configured in the “Behavior” tab.",
  "bot.main.commandAccess": "COMMAND ACCESS",
  "bot.main.commandPrefix": "COMMAND PREFIX",
  "bot.main.pauseBetweenCommandsMs": "PAUSE BETWEEN COMMANDS · MS",
  "bot.main.publicChat": "Public chat",
  "bot.main.whispers": "Whispers",
  "bot.main.bothChannels": "Both channels",
  "bot.main.extraOwnersCommaSeparated": "EXTRA OWNERS · COMMA-SEPARATED OR ONE PER LINE",
  "bot.main.chatReplies": "CHAT REPLIES",
  "bot.main.confirmCommandsInGame": "Confirm commands in-game",
  "bot.main.sayCommand": "SAY COMMAND",
  "bot.main.theOwnerCanType": "The owner can type as the bot",
  "bot.main.quitCommand": "QUIT COMMAND",
  "bot.main.theOwnerCanDisconnect": "The owner can disconnect the bot",
  "bot.main.commandReference": "COMMAND REFERENCE",
  "bot.main.botConnection": "Bot connection",
  "bot.main.refreshStatus": "Refresh status",
  "bot.main.state": "STATE",
  "bot.main.owner": "OWNER",
  "bot.main.bot": "BOT",
  "bot.main.botChatAndCommands": "BOT CHAT AND COMMANDS",
  "bot.main.forestChopTreesDeliver":
    "forest — chop trees, deliver — bring loot, craft — craft, smelt — smelt, station — use workstations. These commands also work without the prefix. Any other text goes to the in-game chat.",
  "bot.main.messageAsTheBot": "Message as the bot",
  "bot.main.typeAMessage": "Type a message…",
  "bot.main.connectTheBotTo": "Connect the bot to a server",
  "bot.main.sending": "Sending…",
  "bot.main.send": "Send",
  "bot.main.eventLog": "EVENT LOG",
  "bot.main.eventLog2": "Event log",
  "bot.main.couldNotOpenThe": "Could not open the bot control window.",
  "bot.main.screenlauncherBotControl": "ScreenLauncher — Bot control",
  "bot.main.couldNotSaveSettings": "Could not save settings",
  "bot.main.botControl": "Bot control",
  "bot.main.loadingSettings": "Loading settings…",
  "bot.main.couldNotLoadThe": "Could not load the bot settings.",
  "bot.main.closeWindow": "Close window",

  // bot.production
  "bot.production.commandAcceptedTheResult":
    "Command accepted. The result and current stage will appear below.",
  "bot.production.blocksAroundTheBot": "BLOCKS AROUND THE BOT",
  "bot.production.findsWorkstationsAndContainers":
    "Finds workstations and containers in the loaded area around the bot. Pick a found block and the bot walks over and opens it.",
  "bot.production.scanRadiusBlocks": "SCAN RADIUS · BLOCKS",
  "bot.production.scanWorkstations": "Scan workstations",
  "bot.production.workstationsFound": "Workstations found",
  "bot.production.walkOverAndOpen": "WALK OVER AND OPEN",
  "bot.production.noWorkstationsFoundWithin":
    "No workstations found within this radius. Move closer to the base or increase the radius.",
  "bot.production.automaticCrafting": "AUTOMATIC CRAFTING",
  "bot.production.theBotCraftsIntermediate":
    "The bot crafts intermediate ingredients from inventory resources. It finds a crafting table within 32 blocks or makes and places one nearby.",
  "bot.production.item": "ITEM",
  "bot.production.howManyToCraft": "HOW MANY TO CRAFT",
  "bot.production.craftingSpot": "CRAFTING SPOT",
  "bot.production.automatic": "Automatic",
  "bot.production.inventory22": "Inventory · 2×2",
  "bot.production.craftingTable33": "Crafting table · 3×3",
  "bot.production.theCountIsIn":
    "The count is in items. If a recipe yields several at once, the bot rounds up to a whole batch. Missing ingredients must be gathered beforehand.",
  "bot.production.checkRecipe": "Check recipe",
  "bot.production.craft": "Craft",
  "bot.production.smeltingAndCooking": "SMELTING AND COOKING",
  "bot.production.theBotLoadsAn":
    "The bot loads an empty furnace, picks fuel, waits for the result, and collects it. A smoker suits food; a blast furnace suits ores and metal.",
  "bot.production.rawMaterial": "RAW MATERIAL",
  "bot.production.rawMaterialCount": "RAW MATERIAL COUNT",
  "bot.production.fuelEmptyAuto": "FUEL · EMPTY = AUTO",
  "bot.production.furnace": "FURNACE",
  "bot.production.regularFurnace": "Regular furnace",
  "bot.production.blastFurnace": "Blast furnace",
  "bot.production.smoker": "Smoker",
  "bot.production.startSmelting": "Start smelting",
  "bot.production.workstations": "WORKSTATIONS",
  "bot.production.pickABlockThe":
    "Pick a block: the bot walks over and opens it. Then put materials into the right slots, choose an action, and take the result.",
  "bot.production.blockNearTheBot": "BLOCK NEAR THE BOT",
  "bot.production.walkOverAndOpen2": "Walk over and open",
  "bot.production.slotNumberingStartsAt":
    "Slot numbering starts at 0. Items move between the block and the bot's inventory.",
  "bot.production.open": "Open",
  "bot.production.workstationSlots": "Workstation slots",
  "bot.production.slot": "SLOT",
  "bot.production.slotNumber": "SLOT NUMBER",
  "bot.production.itemToLoad": "ITEM TO LOAD",
  "bot.production.countToLoad": "COUNT TO LOAD",
  "bot.production.putIntoSlot": "Put into slot",
  "bot.production.takeFromSlot": "Take from slot",
  "bot.production.enchantmentOption02": "ENCHANTMENT OPTION · 0–2",
  "bot.production.optionNumberFrom0": "OPTION NUMBER · FROM 0",
  "bot.production.requiredLevels": "Required levels",
  "bot.production.enchant": "Enchant",
  "bot.production.chooseOption": "Choose option",
  "bot.production.newItemName": "NEW ITEM NAME",
  "bot.production.setName": "Set name",
  "bot.production.currentWork": "CURRENT WORK",
  "bot.production.readyToWork": "Ready to work",
  "bot.production.connectTheBotTo": "Connect the bot to a server",
  "bot.production.stopAndCloseThe": "Stop and close the block",
  "bot.production.whenSmeltingOrBrewing":
    "When smelting or brewing is stopped, the materials stay in the block. Open it to take the contents.",
  "bot.production.scanResult": "Found: {found} · radius {radius}",

  // bot.storageGroups
  "bot.storageGroups.sharedStorage": "Shared storage",
  "bot.storageGroups.newGroup": "New group",
  "bot.storageGroups.thisChestIsAlready": "This chest is already in the group.",
  "bot.storageGroups.aGroupCanHold": "A group can hold up to 32 chests",
  "bot.storageGroups.chestAddedTo": "Chest {chest} added to “{group}”.",
  "bot.storageGroups.couldNotGetThe": "Could not get the selected chest. Select it again.",
  "bot.storageGroups.groupsAppliedToThe":
    "Groups applied to the bot. It will sort loot by the selected resources.",
  "bot.storageGroups.theBotIsChecking":
    "The bot is checking the chest contents. Discovered assignments are saved automatically.",
  "bot.storageGroups.chestsAndSorting": "CHESTS AND SORTING",
  "bot.storageGroups.lootStorage": "LOOT STORAGE",
  "bot.storageGroups.groups": "Groups",
  "bot.storageGroups.addGroup": "ADD GROUP",
  "bot.storageGroups.autoScanChests": "AUTO-SCAN CHESTS",
  "bot.storageGroups.theBotFindsChests":
    "The bot finds chests, barrels, and shulker boxes, walks up to them, and decides their purpose from the contents. Empty ones get more room for bulk blocks and junk, with a separate storage for valuables. Groups you configured are kept.",
  "bot.storageGroups.radiusAroundTheBot": "RADIUS AROUND THE BOT · BLOCKS",
  "bot.storageGroups.chestScanRadius": "Chest scan radius",
  "bot.storageGroups.scanning": "SCANNING…",
  "bot.storageGroups.scanAndAssign": "SCAN AND ASSIGN",
  "bot.storageGroups.aDoubleChestCounts":
    "A double chest counts as one container. Up to 64 containers are checked per pass. The assignment decides where loot is unloaded later; chest contents stay in place.",
  "bot.storageGroups.checked": "Checked",
  "bot.storageGroups.scanCompleteFoundAdded": "Scan complete: {total} found, {added} added.",
  "bot.storageGroups.scanStoppedGroupsWere": "Scan stopped. Groups were saved.",
  "bot.storageGroups.theScanDidNot": "The scan did not finish; check the bot log.",
  "bot.storageGroups.stopScan": "STOP SCAN",
  "bot.storageGroups.chestsFound": "Chests found",
  "bot.storageGroups.alreadyConfigured": "already configured",
  "bot.storageGroups.doubleChest": "Double chest",
  "bot.storageGroups.barrel": "Barrel",
  "bot.storageGroups.container": "Container",
  "bot.storageGroups.freeSlots": "Free slots",
  "bot.storageGroups.aSeparateStorageFor": "A separate storage for each resource",
  "bot.storageGroups.createAGroupChoose":
    "Create a group, choose what goes into it, and add one or more chests.",
  "bot.storageGroups.wood3Chests": "Wood → 3 chests",
  "bot.storageGroups.diamonds1Chest": "Diamonds → 1 chest",
  "bot.storageGroups.stone2Chests": "Stone → 2 chests",
  "bot.storageGroups.addSelectedChest": "ADD SELECTED CHEST",
  "bot.storageGroups.chooseResources": "Choose resources",
  "bot.storageGroups.noChests": "No chests",
  "bot.storageGroups.disableGroup": "Disable group",
  "bot.storageGroups.enableGroup": "Enable group",
  "bot.storageGroups.groupName": "GROUP NAME",
  "bot.storageGroups.forExampleWoodAt": "For example, wood at base",
  "bot.storageGroups.resourceGroups": "Resource groups",
  "bot.storageGroups.whatToStore": "WHAT TO STORE",
  "bot.storageGroups.storageCategories": "Storage categories",
  "bot.storageGroups.resourcesByMaterial": "Resources by material",
  "bot.storageGroups.itemsAndBlocks": "Items and blocks",
  "bot.storageGroups.anItemABlock": "An item, a block, or several resources",
  "bot.storageGroups.removeResource": "Remove resource",
  "bot.storageGroups.chestsInGroup": "CHESTS IN GROUP",
  "bot.storageGroups.filledInOrder": "Filled in order",
  "bot.storageGroups.unloaded": "Unloaded",
  "bot.storageGroups.full": "Full",
  "bot.storageGroups.unavailable": "Unavailable",
  "bot.storageGroups.moveChestUp": "Move chest up",
  "bot.storageGroups.moveChestDown": "Move chest down",
  "bot.storageGroups.removeChest": "Remove chest",
  "bot.storageGroups.addTheChestYou": "Add the chest you are aiming at or enter coordinates below.",
  "bot.storageGroups.selecting": "SELECTING…",
  "bot.storageGroups.aimedAt": "⊕ AIMED AT",
  "bot.storageGroups.chestCoordinatesFor": "Chest coordinates for",
  "bot.storageGroups.addAChestBy": "Add a chest by coordinates",
  "bot.storageGroups.groupPriority": "Group priority",
  "bot.storageGroups.moveGroupUp": "Move group up",
  "bot.storageGroups.moveGroupDown": "Move group down",
  "bot.storageGroups.deleteGroup": "DELETE GROUP",
  "bot.storageGroups.groupsAreSavedIn":
    "Groups are saved in the launcher. Specific resources are checked from top to bottom; “Everything else” is used for the remaining loot. If a chest is full or unavailable, the bot tries the next one in the same group. It keeps tools and food.",
  "bot.storageGroups.applying": "APPLYING…",
  "bot.storageGroups.applyToBot": "APPLY TO BOT",
  "bot.storageGroups.unloadLoot": "UNLOAD LOOT",
  "bot.storageGroups.groupsAreAppliedAutomatically":
    "Groups are applied automatically before starting or resuming work and before unloading. To pick by aim, look at a container within 6 blocks; the bot must be able to see you. Chests, barrels, and shulker boxes work.",
  "bot.storageGroups.group": "Group",
  "bot.storageGroups.chests": { one: "{count} chest", other: "{count} chests" },

  // bot.workflow
  "bot.workflow.chooseAnItem": "Choose an item",
  "bot.workflow.bedsNextToWater": "Beds next to water",
  "bot.workflow.upToActions": { one: "up to {count} action", other: "up to {count} actions" },
  "bot.workflow.allAvailable": "all available",
  "bot.workflow.noReplanting": "no replanting",
  "bot.workflow.withReplanting": "with replanting",
  "bot.workflow.withinBlocks": "Within {radius} blocks",
  "bot.workflow.toWhereTheWorkflow": "To where the workflow started",
  "bot.workflow.intoTheConfiguredStorage": "Into the configured storage chests",
  "bot.workflow.craftingTable": "crafting table",
  "bot.workflow.inventory": "inventory",
  "bot.workflow.blastFurnace": "blast furnace",
  "bot.workflow.smoker": "smoker",
  "bot.workflow.automatic": "automatic",
  "bot.workflow.addAnAction": "Add an action",
  "bot.workflow.addAnAction2": "ADD AN ACTION",
  "bot.workflow.chestsAndLootSorting": "Chests and loot sorting",
  "bot.workflow.setUpStorage": "Set up storage",
  "bot.workflow.add": "Add",
  "bot.workflow.actionSequence": "Action sequence",
  "bot.workflow.workflowName": "WORKFLOW NAME",
  "bot.workflow.workflowName2": "Workflow name",
  "bot.workflow.generateAnAutomaticName": "Generate an automatic name",
  "bot.workflow.actionOrder": "ACTION ORDER",
  "bot.workflow.clear": "Clear",
  "bot.workflow.resume": "Resume",
  "bot.workflow.pauseAfterStep": "Pause after step",
  "bot.workflow.stop": "Stop",
  "bot.workflow.starting": "Starting…",
  "bot.workflow.runWorkflow": "Run workflow",
  "bot.workflow.workflowCompleted": "Workflow completed",
  "bot.workflow.paused": "Paused",
  "bot.workflow.finishingTheStepBefore": "Finishing the step before pausing",
  "bot.workflow.workflowStopped": "Workflow stopped",
  "bot.workflow.yourHelpIsNeeded": "Your help is needed",
  "bot.workflow.runningTheWorkflow": "Running the workflow",
  "bot.workflow.completedSteps": "Completed steps",
  "bot.workflow.thisWorkflowHasNo": "This workflow has no actions yet.",
  "bot.workflow.addAnActionAbove": "Add an action above. Its options will open here.",
  "bot.workflow.holdAndDragThe": "Hold and drag the step",
  "bot.workflow.moveStepUp": "Move step up",
  "bot.workflow.up": "Up",
  "bot.workflow.moveStepDown": "Move step down",
  "bot.workflow.down": "Down",
  "bot.workflow.duplicateStep": "Duplicate step",
  "bot.workflow.duplicate": "Duplicate",
  "bot.workflow.deleteStep": "Delete step",
  "bot.workflow.delete": "Delete",
  "bot.workflow.whatToMine": "WHAT TO MINE",
  "bot.workflow.rawMaterial": "RAW MATERIAL",
  "bot.workflow.craftResult": "CRAFT RESULT",
  "bot.workflow.blockCount": "BLOCK COUNT",
  "bot.workflow.actions0All": "ACTIONS · 0 = ALL",
  "bot.workflow.logCount": "LOG COUNT",
  "bot.workflow.itemCount": "ITEM COUNT",
  "bot.workflow.radiusBlocks": "RADIUS · BLOCKS",
  "bot.workflow.replantAfterHarvest": "REPLANT AFTER HARVEST",
  "bot.workflow.craftingSpot": "CRAFTING SPOT",
  "bot.workflow.furnaceType": "FURNACE TYPE",
  "bot.workflow.craftingSpot2": "Crafting spot",
  "bot.workflow.furnaceType2": "Furnace type",
  "bot.workflow.inventory2": "Inventory",
  "bot.workflow.craftingTable2": "Crafting table",
  "bot.workflow.furnace": "Furnace",
  "bot.workflow.blastFurnace2": "Blast furnace",
  "bot.workflow.smoker2": "Smoker",
  "bot.workflow.theBotCraftsIntermediate":
    "The bot crafts intermediate ingredients, including planks, on its own. In Auto mode it finds a crafting table within 32 blocks or makes and places one.",
  "bot.workflow.aFurnaceMustBe":
    "A furnace must be nearby, with the raw material and fuel in the inventory. The bot picks the fuel and collects the result itself.",
  "bot.workflow.theBotReturnsTo":
    "The bot returns to where the workflow started. Start the workflow near a furnace and a crafting spot.",
  "bot.workflow.usesTheChestGroups": "Uses the chest groups from the storage settings.",
  "bot.workflow.theCountIsIn": "The count is in blocks. Iron needs a stone pickaxe or better.",
  "bot.workflow.theActionStartsAfter": "The action starts after the previous step finishes.",
  "bot.workflow.connectTheBotTo": "Connect the bot to run the workflow.",
  "bot.workflow.connection": "Connection ↗",
  "bot.workflow.pauseTakesEffectAfter":
    "Pause takes effect after the current step. Stop interrupts the work immediately.",
  "bot.workflow.theBotIsBusy": "The bot is busy. Finish the current work before starting.",
  "bot.workflow.ifAnErrorOccurs": "If an error occurs, execution stops at the failing step.",
  "bot.workflow.whatTheIronTools": "What the “Iron tools” preset needs",
  "bot.workflow.ironToolsNeedA":
    "Iron tools need a stone pickaxe, reachable ores, trees, and an empty furnace near the start point. After mining, the bot returns to the start. It makes planks and a crafting table from wood.",
  "bot.workflow.mineDetail": "{item} · blocks: {count} · radius {radius}",
  "bot.workflow.forestDetail": "Logs: {count} · radius {radius}",
  "bot.workflow.stepLabel": "{label}, step {index}",
  "bot.workflow.radiusValue": "radius {radius}",

  // bot.workflowHistory
  "bot.workflowHistory.completed": "Completed",
  "bot.workflowHistory.stopped": "Stopped",
  "bot.workflowHistory.interrupted": "Interrupted",
  "bot.workflowHistory.workflowHistory": "Workflow history",
  "bot.workflowHistory.completedWorkflows": "COMPLETED WORKFLOWS",
  "bot.workflowHistory.showWorkflows": "Show workflows",
  "bot.workflowHistory.completed2": "Completed",
  "bot.workflowHistory.allRuns": "All runs",
  "bot.workflowHistory.completedWorkflowsWillAppear":
    "Completed workflows will appear here, with their steps and run time.",
  "bot.workflowHistory.workflowRunResultsAre": "Workflow run results are saved here.",
  "bot.workflowHistory.error": "Error",
  "bot.workflowHistory.notRun": "Not run",
  "bot.workflowHistory.loadTheStepsInto": "Load the steps into the workflow editor",
  "bot.workflowHistory.repeatWorkflow": "Repeat workflow",
  "bot.workflowHistory.progress": {
    one: "{completed} / {count} step",
    other: "{completed} / {count} steps",
  },

  // bot.workflowPresets
  "bot.workflowPresets.workflowPresets": "Workflow presets",
  "bot.workflowPresets.readyMadeWorkflows": "READY-MADE WORKFLOWS",
  "bot.workflowPresets.collapse": "Collapse",
  "bot.workflowPresets.chooseAPreset": "Choose a preset",
  "bot.workflowPresets.presetCategory": "Preset category",
  "bot.workflowPresets.requires": "Requires:",
  "bot.workflowPresets.addPreset": "Add preset",
  "bot.workflowPresets.aPlanCanHave": "A plan can have at most {WORKFLOW_STEP_LIMIT} steps",
  "bot.workflowPresets.addStepsToThe": "Add {stepsCount} steps to the end of the plan",
  "bot.workflowPresets.notEnoughRoomIn": "Not enough room in the plan",
  "bot.workflowPresets.addToPlan": "+ Add to plan",
  "bot.workflowPresets.stepCount": { one: "{count} step", other: "{count} steps" },

  // buildActivityCalendar
  "buildActivityCalendar.calendarPeriod": "Calendar period",
  "buildActivityCalendar.3Months": "3 months",
  "buildActivityCalendar.year": "Year",
  "buildActivityCalendar.previousPeriod": "Previous period",
  "buildActivityCalendar.nextPeriod": "Next period",
  "buildActivityCalendar.today": "Today",
  "buildActivityCalendar.noActivity": "no activity",
  "buildActivityCalendar.buildCreated": ", build created",
  "buildActivityCalendar.today2": ", today",
  "buildActivityCalendar.created": "Created",
  "buildActivityCalendar.created2": " · created",
  "buildActivityCalendar.lastLaunch": " · last launch",
  "buildActivityCalendar.noActivity2": "No activity",
  "buildActivityCalendar.total": "TOTAL",
  "buildActivityCalendar.last30Days": "LAST 30 DAYS",
  "buildActivityCalendar.activeDays": "ACTIVE DAYS",
  "buildActivityCalendar.lastLaunch2": "LAST LAUNCH",
  "buildActivityCalendar.sessions": { one: "{count} session", other: "{count} sessions" },

  // buildCardPin
  "buildCardPin.pinnedBuild": "Pinned build",

  // buildConfigurationGrid
  "buildConfigurationGrid.selectBuild": "SELECT BUILD",
  "buildConfigurationGrid.mcVersion": "MC VERSION",
  "buildConfigurationGrid.selectVersion": "SELECT VERSION",
  "buildConfigurationGrid.loader": "LOADER",
  "buildConfigurationGrid.selectLoader": "SELECT LOADER",
  "buildConfigurationGrid.source": "SOURCE",
  "buildConfigurationGrid.timeInBuild": "TIME IN BUILD",
  "buildConfigurationGrid.0HrsOnRecord": "0 hrs on record",

  // buildConstellation
  "buildConstellation.linesConnectStarsBy": "Lines connect stars by the same author",
  "buildConstellation.mod": "MOD",
  "buildConstellation.shader": "SHADER",
  "buildConstellation.pack": "PACK",
  "buildConstellation.search": "Search",
  "buildConstellation.searchByNameOr": "Search by name or author",
  "buildConstellation.labels": "Labels",
  "buildConstellation.resume": "Resume",
  "buildConstellation.pause": "Pause",
  "buildConstellation.gatherStars": "Gather stars",
  "buildConstellation.noMatches": "No matches",
  "buildConstellation.interactiveConstellationOfInstalled":
    "Interactive constellation of installed content. Search and controls above the map let you select stars.",
  "buildConstellation.catchMe": "CATCH ME",
  "buildConstellation.drop": "DROP",

  // buildEnvironmentVariables
  "buildEnvironmentVariables.environment": "ENVIRONMENT",
  "buildEnvironmentVariables.add": "ADD",
  "buildEnvironmentVariables.variablesArePassedTo":
    "Variables are passed to the game at launch. Enter values as-is, without quotes or substitutions.",
  "buildEnvironmentVariables.theSystemEnvironmentIs":
    "The system environment is used. Add a variable to override it for this build.",
  "buildEnvironmentVariables.name": "NAME",
  "buildEnvironmentVariables.environmentVariable": "Environment variable",
  "buildEnvironmentVariables.removeEnvironmentVariable": "Remove environment variable",
  "buildEnvironmentVariables.value": "VALUE",
  "buildEnvironmentVariables.valueCanBeEmpty": "Value (can be empty)",
  "buildEnvironmentVariables.environmentVariable2": "Environment variable",
  "buildEnvironmentVariables.nameLabel": "{label} {index} name",
  "buildEnvironmentVariables.valueLabel": "{label} {index} value",

  // buildLogs
  "buildLogs.noCrashReportWas": "No crash report was found for this launch.",
  "buildLogs.noLaunchLogHas": "No launch log has been created yet.",
  "buildLogs.jvmLog": "JVM LOG",
  "buildLogs.notCreatedYet": "NOT CREATED YET",
  "buildLogs.crashReport": "CRASH REPORT",
  "buildLogs.exit": "EXIT",
  "buildLogs.unknown": "UNKNOWN",
  "buildLogs.runtime": "RUNTIME",
  "buildLogs.crashLog": "CRASH LOG",
  "buildLogs.buildLogs": "BUILD LOGS",
  "buildLogs.minimize": "Minimize",
  "buildLogs.maximize": "Maximize",
  "buildLogs.likelyCause": "LIKELY CAUSE",
  "buildLogs.jvmOutput": "JVM OUTPUT",
  "buildLogs.copy": "Copy",
  "buildLogs.crashReport2": "crash report",
  "buildLogs.jvmOutput2": "JVM output",
  "buildLogs.copied": "COPIED",
  "buildLogs.copy2": "COPY",
  "buildLogs.loadingLogs": "LOADING LOGS...",
  "buildLogs.openFolder": "OPEN FOLDER",
  "buildLogs.loadingLogs2": "LOADING LOGS...",

  // buildMods
  "buildMods.saveTheBuildTo": "Save the build to manage its mods.",
  "buildMods.vanillaBuildsDontUse": "Vanilla builds don't use mods.",
  "buildMods.readingInstalledMods": "Reading installed mods.",
  "buildMods.thisBuildHasNo": "This build has no mods installed yet.",
  "buildMods.disableMod": "Disable mod",
  "buildMods.enableMod": "Enable mod",
  "buildMods.noBuildYet": "NO BUILD YET",
  "buildMods.vanilla": "VANILLA",
  "buildMods.loading": "LOADING",
  "buildMods.error": "ERROR",
  "buildMods.empty": "EMPTY",
  "buildMods.installed": "INSTALLED",

  // buildPlaceholders
  "buildPlaceholders.restingTilt": "Resting tilt",
  "buildPlaceholders.slightTiltOfThe": "Slight tilt of the sheet at rest",
  "buildPlaceholders.tilt": "Tilt",
  "buildPlaceholders.dragAnimation": "Drag animation",
  "buildPlaceholders.sheetSwayAndPin": "Sheet sway and pin lift while dragging",
  "buildPlaceholders.animation": "Animation",
  "buildPlaceholders.minimizeWindow": "Minimize window",
  "buildPlaceholders.closeWindow": "Close window",
  "buildPlaceholders.screenlauncherCheatSheet": "SCREENLAUNCHER · CHEAT SHEET",
  "buildPlaceholders.placeholders": "Placeholders",
  "buildPlaceholders.theyInsertDataInto": "They insert data into text. Click a code to copy it.",
  "buildPlaceholders.findAPlaceholder": "Find a placeholder",
  "buildPlaceholders.searchByNameOr": "Search by name or meaning…",
  "buildPlaceholders.placeholderGroups": "Placeholder groups",
  "buildPlaceholders.all": "All",
  "buildPlaceholders.thesePlaceholdersOnlyWork":
    "These placeholders only work in the Mineflayer bot join message.",
  "buildPlaceholders.copyFailedYouCan":
    "Copy failed. You can select the code and copy it manually.",
  "buildPlaceholders.copy": "Copy {token}",
  "buildPlaceholders.copied": "Copied",
  "buildPlaceholders.copy2": "Copy",
  "buildPlaceholders.nothingFoundTryAnother": "Nothing found. Try another word.",
  "buildPlaceholders.openFailed": "Could not open the placeholders window.",
  "buildPlaceholders.windowTitle": "ScreenLauncher — Placeholders",
  "buildPlaceholders.caretHint": "The {caret} sign makes letters uppercase.",

  // buildPlay
  "buildPlay.stopGame": "STOP GAME",
  "buildPlay.playBuild": "PLAY BUILD",
  "buildPlay.starting": "STARTING…",

  // buildRuntimeSettings
  "buildRuntimeSettings.importError": "IMPORT ERROR",
  "buildRuntimeSettings.javaArguments": "JAVA ARGUMENTS",
  "buildRuntimeSettings.exportArguments": "Export arguments",
  "buildRuntimeSettings.importArguments": "Import arguments",
  "buildRuntimeSettings.search": "SEARCH",
  "buildRuntimeSettings.noMatch": "NO MATCH",
  "buildRuntimeSettings.previousMatch": "Previous match",
  "buildRuntimeSettings.nextMatch": "Next match",
  "buildRuntimeSettings.replace": "REPLACE",
  "buildRuntimeSettings.newValue": "new value",
  "buildRuntimeSettings.replace2": "REPLACE",
  "buildRuntimeSettings.all": "ALL",
  "buildRuntimeSettings.logs": "LOGS",
  "buildRuntimeSettings.openLogWindow": "OPEN LOG WINDOW",
  "buildRuntimeSettings.memory": "MEMORY",
  "buildRuntimeSettings.useTheLauncherManaged": "Use the launcher-managed Java",
  "buildRuntimeSettings.scanning": "SCANNING...",
  "buildRuntimeSettings.autoScan": "AUTO-SCAN",
  "buildRuntimeSettings.autoManagedRuntimeOr": "AUTO (managed runtime) — or type a javaw.exe path",
  "buildRuntimeSettings.noJavaFound": "NO JAVA FOUND",
  "buildRuntimeSettings.testingJava": "TESTING JAVA...",
  "buildRuntimeSettings.testJavaSettings": "TEST JAVA SETTINGS",
  "buildRuntimeSettings.checksTheCurrentRam":
    "Checks the current RAM, arguments, and environment without starting Minecraft.",
  "buildRuntimeSettings.javaCheckPassed": "JAVA CHECK PASSED",
  "buildRuntimeSettings.javaCheckFailed": "JAVA CHECK FAILED",
  "buildRuntimeSettings.javaReturnedNoDiagnostic": "Java returned no diagnostic output.",
  "buildRuntimeSettings.window": "WINDOW",
  "buildRuntimeSettings.fullscreen": "FULLSCREEN",
  "buildRuntimeSettings.windowed": "WINDOWED",
  "buildRuntimeSettings.width": "WIDTH",
  "buildRuntimeSettings.windowWidth": "Window width",
  "buildRuntimeSettings.height": "HEIGHT",
  "buildRuntimeSettings.windowHeight": "Window height",

  // buildSafetyModals
  "buildSafetyModals.buildTrash": "Build trash",
  "buildSafetyModals.buildTrash2": "BUILD TRASH",
  "buildSafetyModals.deletedBuilds": "Deleted builds",
  "buildSafetyModals.filesRemainOnDisk":
    "Files remain on disk until permanently deleted. Deleting a build also removes its world backups.",
  "buildSafetyModals.trashIsEmpty": "Trash is empty.",
  "buildSafetyModals.restore": "RESTORE",
  "buildSafetyModals.confirmDelete": "CONFIRM DELETE",
  "buildSafetyModals.deleteForever": "DELETE FOREVER",

  // buildScreenshots
  "buildScreenshots.screenshots": "SCREENSHOTS",
  "buildScreenshots.loadingScreenshots": "LOADING SCREENSHOTS...",
  "buildScreenshots.noScreenshotsYet": "NO SCREENSHOTS YET",
  "buildScreenshots.theyWillAppearHere":
    "They will appear here after Minecraft saves them in this build.",
  "buildScreenshots.loadingImage": "LOADING IMAGE...",
  "buildScreenshots.screenshot": "Screenshot",
  "buildScreenshots.selectScreenshot": "SELECT SCREENSHOT",
  "buildScreenshots.openFolder": "OPEN FOLDER",
  "buildScreenshots.unknownDate": "UNKNOWN DATE",

  // buildStats
  "buildStats.gbMemory": "GB memory",
  "buildStats.disabled": "Disabled",
  "buildStats.gameSession": "Game session",
  "buildStats.lastLaunch": "Last launch",
  "buildStats.inGame": "In game",
  "buildStats.closeStatistics": "Close statistics",
  "buildStats.stats": "STATS",
  "buildStats.statisticsSection": "Statistics section",
  "buildStats.verticalTimeline": "Vertical timeline",
  "buildStats.vertical": "Vertical",
  "buildStats.horizontalTimeline": "Horizontal timeline",
  "buildStats.horizontal": "Horizontal",
  "buildStats.someDataCouldNot": "Some data could not be loaded.",
  "buildStats.eventFilter": "Event filter",
  "buildStats.newestFirst": "Newest first",
  "buildStats.oldestFirst": "Oldest first",
  "buildStats.noEvents": "No events",
  "buildStats.horizontallyScrollingEventTimeline": "Horizontally scrolling event timeline",
  "buildStats.events": { one: "{count} event", other: "{count} events" },

  // catalogProjectCard
  "catalogProjectCard.download": "Download",
  "catalogProjectCard.resolvingDependencies": "Resolving dependencies…",
  "catalogProjectCard.openDetails": "Open {title} details",
  "catalogProjectCard.downloaded": "DOWNLOADED",
  "catalogProjectCard.removing": "REMOVING...",
  "catalogProjectCard.update": "UPDATE",
  "catalogProjectCard.installing": "INSTALLING...",
  "catalogProjectCard.by": "BY",
  "catalogProjectCard.downloads": { one: "{count} DOWNLOAD", other: "{count} DOWNLOADS" },
  "catalogProjectCard.followers": { one: "{count} FOLLOWER", other: "{count} FOLLOWERS" },

  // common
  "common.close": "CLOSE",
  "common.loading": "Loading…",
  "common.remove": "REMOVE",
  "common.close2": "Close",
  "common.refresh": "REFRESH",
  "common.javaPath": "JAVA PATH",
  "common.retry": "Retry",
  "common.auto": "Auto",
  "common.paused": "PAUSED",
  "common.downloading": "DOWNLOADING",
  "common.resume": "RESUME",
  "common.pause": "PAUSE",
  "common.cancel": "CANCEL",
  "common.install": "INSTALL",
  "common.working": "WORKING...",
  "common.noEventsYet": "No events yet",
  "common.empty": "Empty",
  "common.buildCaps": "BUILD",
  "common.deleteCaps": "DELETE",
  "common.onCaps": "ON",
  "common.offCaps": "OFF",
  "common.modsCaps": "MODS",
  "common.on": "On",
  "common.off": "Off",
  "common.enable": "Enable",

  // discordRpc
  "discordRpc.connectToDiscord": "CONNECT TO DISCORD",
  "discordRpc.discordApplicationAndDisplay": "Discord application and display mode",
  "discordRpc.discordApplicationId": "Discord application ID",
  "discordRpc.whatToShowIn": "WHAT TO SHOW IN YOUR PROFILE",
  "discordRpc.displayMode": "Display mode",
  "discordRpc.statusText": "STATUS TEXT",
  "discordRpc.activityNameAndTwo": "Activity name and two lines in your profile",
  "discordRpc.activityName": "ACTIVITY NAME",
  "discordRpc.mainLine": "MAIN LINE",
  "discordRpc.secondLine": "SECOND LINE",
  "discordRpc.statusTemplatePreview": "Status template preview",
  "discordRpc.templatePreview": "TEMPLATE PREVIEW",
  "discordRpc.000InGame": "0:00 in game",
  "discordRpc.imagesAndButton": "IMAGES AND BUTTON",
  "discordRpc.largeImageKey": "LARGE IMAGE KEY",
  "discordRpc.smallImageKey": "SMALL IMAGE KEY",
  "discordRpc.buttonText": "BUTTON TEXT",
  "discordRpc.optional": "Optional",
  "discordRpc.buttonLink": "BUTTON LINK",
  "discordRpc.enterTheNamesOf":
    "Enter the names of images uploaded to Discord Developer Portal → Rich Presence → Art Assets. The button appears once you set its text.",

  // elementToggle
  "elementToggle.hide": "Hide",
  "elementToggle.show": "Show",
  "elementToggle.toggleSettings": "{action} additional settings {title}",

  // instanceTransferModals
  "instanceTransferModals.buildName": "BUILD NAME",
  "instanceTransferModals.ramSettings": "RAM SETTINGS",
  "instanceTransferModals.javaArguments": "JAVA ARGUMENTS",
  "instanceTransferModals.environmentVariables": "ENVIRONMENT VARIABLES",
  "instanceTransferModals.windowSize": "WINDOW SIZE",
  "instanceTransferModals.shaders": "SHADERS",
  "instanceTransferModals.resourcePacks": "RESOURCE PACKS",
  "instanceTransferModals.exportBuild": "EXPORT BUILD",
  "instanceTransferModals.slbuildStoresTheProject":
    ".SLBUILD stores the project list. .MRPACK also includes local mods, configs, and other user files through OVERRIDES.",
  "instanceTransferModals.creatingMrpack": "CREATING .MRPACK...",
  "instanceTransferModals.importBuild": "IMPORT BUILD",
  "instanceTransferModals.newBuild": "NEW BUILD",
  "instanceTransferModals.enterABuildName": "Enter a build name",
  "instanceTransferModals.filesFromTheMrpack":
    "Files from the .mrpack will be downloaded and unpacked into the build folders.",
  "instanceTransferModals.versionAndLoaderCome":
    "Version and loader come from the file. Modrinth projects will be downloaded again.",
  "instanceTransferModals.installed": "Installed",
  "instanceTransferModals.preparing": "PREPARING",
  "instanceTransferModals.installing": "INSTALLING",
  "instanceTransferModals.extracting": "EXTRACTING",
  "instanceTransferModals.done": "DONE",
  "instanceTransferModals.buildImportProgress": "Build import progress",
  "instanceTransferModals.stoppingAndCleaningUp": "Stopping and cleaning up the incomplete build…",
  "instanceTransferModals.preparingFiles": "Preparing files…",
  "instanceTransferModals.importing": "IMPORTING...",
  "instanceTransferModals.retryFailed": "RETRY FAILED",
  "instanceTransferModals.import": "IMPORT",
  "instanceTransferModals.cancelling": "CANCELLING…",
  "instanceTransferModals.cancelImport": "CANCEL IMPORT",
  "instanceTransferModals.couldNotReadThe": "Could not read the file.",
  "instanceTransferModals.importSummary":
    "Build created. Installed {installed} / {total} components.",

  // instanceTransfers
  "instanceTransfers.exportedSlbuild": "{name} exported (.slbuild)",
  "instanceTransfers.exportedMrpack": "{name} exported (.mrpack)",
  "instanceTransfers.allBuildComponentsAre": "All build components are installed",
  "instanceTransfers.buildImported": "Build {name} imported",
  "instanceTransfers.buildCreatedButComponents":
    "Build created, but {failedCount} components failed to install",
  "instanceTransfers.reinstallCancelledFilesThat":
    "Reinstall cancelled. Files that were already installed were kept.",
  "instanceTransfers.importCancelledYouCan":
    "Import cancelled. You can change the options and try again.",
  "instanceTransfers.buildImportCancelled": "Build import cancelled",

  // instances
  "instances.instanceLibrary": "INSTANCE LIBRARY",
  "instances.buildTrash": "Build trash",
  "instances.trash": "TRASH",
  "instances.importBuildFromFile": "Import build from file",
  "instances.createBuild": "CREATE BUILD",
  "instances.noBuildsYet": "NO BUILDS YET",
  "instances.createYourFirstBuild": "Create your first build to begin installing.",
  "instances.dropFile": "DROP FILE",
  "instances.createNewBuild": "CREATE NEW BUILD",
  "instances.buildName": "BUILD NAME",
  "instances.myVanillaBuild": "My Vanilla Build",
  "instances.mcVersion": "MC VERSION",
  "instances.selectVersion": "SELECT VERSION",
  "instances.loader": "LOADER",
  "instances.loaderVersion": "LOADER VERSION",
  "instances.loading": "LOADING...",
  "instances.buildSettings": "Build settings",
  "instances.buildConfiguration": "BUILD CONFIGURATION",
  "instances.worldBackups": "WORLD BACKUPS",
  "instances.renameBuild": "RENAME BUILD",
  "instances.saveNewName": "Save new name",
  "instances.cancelRename": "Cancel rename",
  "instances.renameBuild2": "Rename build",
  "instances.stopTheGameBefore": "Stop the game before renaming",
  "instances.unpinBuild": "Unpin build",
  "instances.pinBuild": "Pin build",
  "instances.noBuild": "NO BUILD",
  "instances.installHint":
    "Check and download Minecraft, mod loader and Java files without starting the game. Play does this automatically before launching.",
  "instances.folder": "FOLDER",
  "instances.stats": "STATS",
  "instances.exportBuild": "Export build",
  "instances.screenshots": "Screenshots",
  "instances.deleteBuild": "Delete build",
  "instances.retryInstall": "RETRY INSTALL",
  "instances.retryLaunch": "RETRY LAUNCH",
  "instances.selectLoaderVersion": "SELECT {loader} VERSION",

  // launcherGuide
  "launcherGuide.skip": "SKIP",
  "launcherGuide.back": "BACK",
  "launcherGuide.done": "DONE",
  "launcherGuide.next": "NEXT",

  // launcherPlugins
  "launcherPlugins.botManager": "BOT MANAGER",
  "launcherPlugins.extensions": "EXTENSIONS",
  "launcherPlugins.extensionStatus": "Extension status",
  "launcherPlugins.minimizeWindow": "Minimize window",
  "launcherPlugins.maximizeOrRestoreWindow": "Maximize or restore window",
  "launcherPlugins.closeBotManager": "Close bot manager",
  "launcherPlugins.closeExtensions": "Close extensions",
  "launcherPlugins.extensions2": "Extensions",
  "launcherPlugins.opening": "Opening…",
  "launcherPlugins.openInASeparate": "Open in a separate window",
  "launcherPlugins.checking": "Checking…",
  "launcherPlugins.installing": "Installing…",
  "launcherPlugins.removing": "Removing…",
  "launcherPlugins.install": "Install",
  "launcherPlugins.disable": "Disable",
  "launcherPlugins.confirmRemoval": "Confirm removal",
  "launcherPlugins.removePackage": "Remove package",
  "launcherPlugins.settingsFor": "Settings for",
  "launcherPlugins.checkingWhetherTheExtension":
    "Checking whether the extension package is installed…",
  "launcherPlugins.installThePackageWith":
    "Install the package with the button above to enable this extension. You can configure its settings beforehand.",
  "launcherPlugins.loadingSettings": "Loading settings…",
  "launcherPlugins.settingsAreSavedAutomatically": "Settings are saved automatically",
  "launcherPlugins.done": "Done",
  "launcherPlugins.totalCount": "{count} total",
  "launcherPlugins.enabledCount": "{count} enabled",

  // launcherUpdate
  "launcherUpdate.updateInterrupted": "Update interrupted",
  "launcherUpdate.newVersion": "New version",
  "launcherUpdate.justAMoment": "Just a moment.",
  "launcherUpdate.almostReadyToGo": "Almost ready to go.",
  "launcherUpdate.aLittleBetter": "A little better.",
  "launcherUpdate.withEveryLaunch": "With every launch.",
  "launcherUpdate.yourCurrentVersionIs": "Your current version is ready to use.",
  "launcherUpdate.theLauncherWillClose": "The launcher will close and reopen automatically.",
  "launcherUpdate.aLauncherUpdateIs": "A launcher update is available.",
  "launcherUpdate.updatingTheLauncher": "Updating the launcher.",
  "launcherUpdate.yourBuildsAndSettings": "Your builds and settings will stay in place.",
  "launcherUpdate.installingUpdate": "Installing update",
  "launcherUpdate.verifyingFileSignature": "Verifying file signature",
  "launcherUpdate.downloadingUpdate": "Downloading update",
  "launcherUpdate.restartingAutomatically": "Restarting automatically",
  "launcherUpdate.almostReady": "Almost ready",
  "launcherUpdate.remaining": "Remaining",
  "launcherUpdate.installingUpdate2": "Installing update",
  "launcherUpdate.downloadingUpdate2": "Downloading update",
  "launcherUpdate.installing": "Installing",
  "launcherUpdate.verifyingSignature": "Verifying signature",
  "launcherUpdate.downloadSizeIsUnknown": "Download size is unknown",
  "launcherUpdate.applyingTheNewVersion": "Applying the new version",
  "launcherUpdate.updateNow": "Update now",
  "launcherUpdate.later": "Later",
  "launcherUpdate.tryAgain": "Try again",
  "launcherUpdate.continueWithoutUpdating": "Continue without updating",
  "launcherUpdate.releaseNotes": "Release notes",
  "launcherUpdate.whatsNew": "What's new",
  "launcherUpdate.updateSteps": "Update steps",
  "launcherUpdate.couldNotUpdate": "Could not{br}update the launcher.",
  "launcherUpdate.progressOf": "{downloaded} of {total}",
  "launcherUpdate.autoStart": "Starting automatically in {seconds} s",

  // mascot
  "mascot.undoMascotChanges": "UNDO MASCOT CHANGES",
  "mascot.theMascotsFullBowl": "The mascot's full bowl. Drag and throw it to tip it over.",
  "mascot.theMascotsEmptyBowl": "The mascot's empty bowl",
  "mascot.pickUpAndThrow": "Pick up and throw the bowl",
  "mascot.isAsleepClickTo": "{name} is asleep. Click to wake up.",
  "mascot.isCarryingAButton": "{name} is carrying a button. Click to return it.",
  "mascot.clickToPetOr": "{name}. Click to pet, or drag and throw.",
  "mascot.clickToWakeUp": "Click to wake up",
  "mascot.clickToReturnThe": "Click to return the button",
  "mascot.petOrThrowThe": "Pet or throw the mascot",

  // microsoftAccounts
  "microsoftAccounts.account": "ACCOUNT",
  "microsoftAccounts.microsoftProfileManager": "Microsoft Profile Manager",
  "microsoftAccounts.accounts": "ACCOUNTS",
  "microsoftAccounts.noMicrosoftAccountsAdded": "No Microsoft accounts added yet.",
  "microsoftAccounts.signInToLoad": "Sign in to load Minecraft profile data.",
  "microsoftAccounts.active": "ACTIVE",
  "microsoftAccounts.removeAccount": "Remove account",
  "microsoftAccounts.waitingForSignIn": "Waiting for sign-in...",
  "microsoftAccounts.completeLoginInThe": "Complete login in the Microsoft window",
  "microsoftAccounts.signingIn": "Signing in...",
  "microsoftAccounts.addMicrosoftAccount": "ADD MICROSOFT ACCOUNT",
  "microsoftAccounts.noAccountSelected": "NO ACCOUNT SELECTED",
  "microsoftAccounts.minecraftProfile": "MINECRAFT PROFILE",
  "microsoftAccounts.loadingProfile": "LOADING PROFILE...",
  "microsoftAccounts.loadingViewer": "LOADING VIEWER...",
  "microsoftAccounts.localPreview": "LOCAL PREVIEW",
  "microsoftAccounts.default": "DEFAULT",
  "microsoftAccounts.layer2": "LAYER 2",
  "microsoftAccounts.base": "BASE",
  "microsoftAccounts.noCape": "NO CAPE",
  "microsoftAccounts.viewer": "VIEWER",
  "microsoftAccounts.rotating": "ROTATING",
  "microsoftAccounts.previewAnimation": "Preview animation",
  "microsoftAccounts.pauseRotate": "PAUSE ROTATE",
  "microsoftAccounts.autoRotate": "AUTO ROTATE",
  "microsoftAccounts.hideLayer2": "HIDE LAYER 2",
  "microsoftAccounts.showLayer2": "SHOW LAYER 2",
  "microsoftAccounts.zoomOff": "ZOOM OFF",
  "microsoftAccounts.zoomOn": "ZOOM ON",
  "microsoftAccounts.resetView": "RESET VIEW",
  "microsoftAccounts.skin": "SKIN",
  "microsoftAccounts.skinModel": "Skin model",
  "microsoftAccounts.pickSkin": "PICK SKIN",
  "microsoftAccounts.applying": "APPLYING...",
  "microsoftAccounts.applySkin": "APPLY SKIN",
  "microsoftAccounts.resetting": "RESETTING...",
  "microsoftAccounts.resetSkin": "RESET SKIN",
  "microsoftAccounts.capes": "CAPES",
  "microsoftAccounts.saving": "SAVING...",
  "microsoftAccounts.applyCape": "APPLY CAPE",
  "microsoftAccounts.hiding": "HIDING...",
  "microsoftAccounts.hideCape": "HIDE CAPE",

  // minecraftSearch
  "minecraftSearch.blocksAndGroups": "Blocks and groups",
  "minecraftSearch.items": "Items",
  "minecraftSearch.catalog": "Catalog",
  "minecraftSearch.blocks": "{blocksCount} blocks",
  "minecraftSearch.group": "Group",
  "minecraftSearch.block": "Block",
  "minecraftSearch.item": "Item",
  "minecraftSearch.nothingFoundTryA": "Nothing found. Try a Minecraft name or ID.",
  "minecraftSearch.theCatalogIsUnavailable":
    "The catalog is unavailable for now. You can type a Minecraft ID manually.",
  "minecraftSearch.selectEnterConfirm": "↑ ↓ select · Enter confirm",
  "minecraftSearch.ctrlAddRemoveShift": " · Ctrl — add/remove · Shift — range",

  // modrinthContent
  "modrinthContent.installingTheModAnd": "Installing the mod and required dependencies…",
  "modrinthContent.modAndRequiredDependencies": "Mod and required dependencies installed",
  "modrinthContent.uninstallingMod": "Uninstalling mod...",
  "modrinthContent.installingResourcePack": "Installing resource pack...",
  "modrinthContent.resourcePackInstallFinished": "Resource pack install finished",
  "modrinthContent.uninstallingResourcePack": "Uninstalling resource pack...",
  "modrinthContent.installingShader": "Installing shader...",
  "modrinthContent.shaderInstallFinished": "Shader install finished",
  "modrinthContent.uninstallingShader": "Uninstalling shader...",
  "modrinthContent.downloadCancelled": "{projectName}: download cancelled",
  "modrinthContent.removedFrom": "{title} removed from {name}",
  "modrinthContent.results": "RESULTS",
  "modrinthContent.nothingFound": "NOTHING FOUND",
  "modrinthContent.targetVersion": "TARGET VERSION",
  "modrinthContent.empty": "EMPTY",

  // modrinthDependencies
  "modrinthDependencies.requiredModDependencies": "Required mod dependencies",
  "modrinthDependencies.requiredDependencies": "REQUIRED DEPENDENCIES",
  "modrinthDependencies.modVersion": "Mod version",
  "modrinthDependencies.chooseABuildTo":
    "Choose a build to see dependencies for its Minecraft version.",
  "modrinthDependencies.checkingRequiredDependencies": "Checking required dependencies…",
  "modrinthDependencies.couldNotCheckDependencies": "Could not check dependencies",
  "modrinthDependencies.thisModVersionHas": "This mod version has no required dependencies.",
  "modrinthDependencies.theseInstallAutomaticallyWith": "These install automatically with the mod.",
  "modrinthDependencies.version": "Version",
  "modrinthDependencies.transitiveDependency": " · Transitive dependency",

  // modrinthProject
  "modrinthProject.by": "BY",
  "modrinthProject.noShortDescriptionWas": "No short description was provided for this project.",
  "modrinthProject.projectStatistics": "Project statistics",
  "modrinthProject.downloads": "DOWNLOADS",
  "modrinthProject.followers": "FOLLOWERS",
  "modrinthProject.updated": "UPDATED",
  "modrinthProject.license": "LICENSE",
  "modrinthProject.loadingProjectDetails": "LOADING PROJECT DETAILS",
  "modrinthProject.aboutThisProject": "ABOUT THIS PROJECT",
  "modrinthProject.categories": "CATEGORIES",
  "modrinthProject.installing": "INSTALLING...",
  "modrinthProject.downloaded": "DOWNLOADED",
  "modrinthProject.update": "UPDATE",

  // obsTelemetry
  "obsTelemetry.obsSource": "OBS SOURCE",
  "obsTelemetry.addThisAddressAs": "Add this address as a Browser source in OBS",
  "obsTelemetry.obsPort": "OBS PORT",
  "obsTelemetry.mainOverlayAddress": "MAIN OVERLAY ADDRESS",
  "obsTelemetry.overlayControls": "OVERLAY CONTROLS",
  "obsTelemetry.working": "Working…",
  "obsTelemetry.start": "START",
  "obsTelemetry.stop": "STOP",
  "obsTelemetry.open": "OPEN",
  "obsTelemetry.copied": "COPIED",
  "obsTelemetry.copyAddress": "COPY ADDRESS",
  "obsTelemetry.individualWidgets": "INDIVIDUAL WIDGETS",
  "obsTelemetry.healthArmorCoordinatesAnd":
    "Health, armor, coordinates, and other sources · click to copy the address",
  "obsTelemetry.copied2": "Copied",
  "obsTelemetry.dataAndLog": "DATA AND LOG",
  "obsTelemetry.serverStateAndThe": "Server state and the latest player data",
  "obsTelemetry.server": "SERVER",
  "obsTelemetry.liveData": "LIVE DATA",
  "obsTelemetry.yes": "Yes",
  "obsTelemetry.no": "No",
  "obsTelemetry.player": "PLAYER",
  "obsTelemetry.updated": "UPDATED",
  "obsTelemetry.health": "HEALTH",
  "obsTelemetry.armor": "ARMOR",
  "obsTelemetry.food": "FOOD",
  "obsTelemetry.coordinates": "COORDINATES",
  "obsTelemetry.inHand": "IN HAND",

  // overview
  "overview.activeBuild": "ACTIVE BUILD",
  "overview.totalTimeInGame": "TOTAL TIME IN GAME",
  "overview.nickname": "NICKNAME",
  "overview.loggedIn": "LOGGED IN",
  "overview.noAccountClickTo": "No account — click to add",
  "overview.account": "ACCOUNT",
  "overview.noBuilds": "NO BUILDS",
  "overview.createAMinecraftBuild":
    "Create a Minecraft build to install the required files and start playing.",
  "overview.openBuilds": "OPEN BUILDS",
  "overview.lastSession": "LAST SESSION",
  "overview.minecraftFilesDownloadAutomatically":
    "Minecraft files download automatically before launch.",
  "overview.mcLoader": "MC / LOADER",
  "overview.lastPlayed": "LAST PLAYED",
  "overview.timeInGame": "TIME IN GAME",
  "overview.playLast2": "PLAY LAST",
  "overview.createFirstBuild": "Create your{br}first build.",
  "overview.playLastBuild": "Play last{br}build.",

  // placeholderGuide
  "placeholderGuide.couldNotOpenThe": "Could not open the placeholder guide. Try again.",
  "placeholderGuide.openThePlaceholderGuide": "Open the placeholder guide",
  "placeholderGuide.placeholders": "Placeholders",
  "placeholderGuide.launcher_name": "The launcher product name.",
  "placeholderGuide.system_ram": "Total memory detected on this computer.",
  "placeholderGuide.system_ram_value": "Detected system memory as a number without the GB suffix.",
  "placeholderGuide.launcher_ram": "The RAM value selected in Launcher Settings.",
  "placeholderGuide.launcher_ram_value": "Launcher RAM as a number without the GB suffix.",
  "placeholderGuide.player_name": "Offline nickname or the active Microsoft account name.",
  "placeholderGuide.account_type": "The active account mode, such as Offline or Microsoft.",
  "placeholderGuide.build_name": "Name of the build represented by this element.",
  "placeholderGuide.build_version": "Minecraft version of the current build.",
  "placeholderGuide.build_loader": "Loader family, such as Vanilla, Fabric, Forge or NeoForge.",
  "placeholderGuide.build_loader_version": "Installed loader version, when the build uses one.",
  "placeholderGuide.build_full_loader": "Friendly loader name followed by its installed version.",
  "placeholderGuide.build_ram": "Memory allocated to the current build.",
  "placeholderGuide.build_ram_value": "Build memory as a number without the GB suffix.",
  "placeholderGuide.build_playtime": "Total recorded play time for the current build.",
  "placeholderGuide.build_last_played": "Relative date when this build was last launched.",
  "placeholderGuide.build_created": "Calendar date when the current build was created.",
  "placeholderGuide.build_status": "Persistent installation status, such as Ready or Updating.",
  "placeholderGuide.build_state": "Transient state supplied by the current view, such as Running.",
  "placeholderGuide.build_source":
    "Build origin: Official for a build created in the launcher, Imported for an imported build.",
  "placeholderGuide.total_playtime": "Recorded play time across every build.",
  "placeholderGuide.total_builds": "Number of builds in the launcher library.",
  "placeholderGuide.total_modded_builds": "Number of builds that use a mod loader.",
  "placeholderGuide.total_vanilla_builds": "Number of Vanilla builds in the library.",
  "placeholderGuide.total_allocated_ram": "Sum of the RAM settings across every build.",
  "placeholderGuide.owner": "The bot owner's nickname. Only in the Mineflayer bot join message.",
  "placeholderGuide.ownerLabel": "Bot owner",
  "placeholderGuide.bot": "The connected bot's nickname. Only in the Mineflayer bot join message.",
  "placeholderGuide.botLabel": "Bot nickname",
  "placeholderGuide.server": "The server address. Only in the Mineflayer bot join message.",
  "placeholderGuide.serverLabel": "Bot server",

  // pluginCard
  "pluginCard.checking": "Checking…",
  "pluginCard.installing": "Installing…",
  "pluginCard.availableToInstall": "Available to install",

  // proxy
  "proxy.connectThroughAProxy": "CONNECT THROUGH A PROXY",
  "proxy.addressCredentialsAndConnection": "Address, credentials, and connection test",
  "proxy.proxyAddress": "PROXY ADDRESS",
  "proxy.hideProxyDetails": "Hide proxy details",
  "proxy.showProxyDetails": "Show proxy details",
  "proxy.testing": "Testing…",
  "proxy.testConnection": "Test connection",
  "proxy.connectionEstablished": "Connection established",
  "proxy.connectionFailed": "Connection failed",
  "proxy.directConnection": "DIRECT CONNECTION",
  "proxy.domainsAndNetworksTo": "Domains and networks to open without the proxy",
  "proxy.proxyExceptions": "PROXY EXCEPTIONS",
  "proxy.separateAddressesWithCommas":
    "Separate addresses with commas or line breaks. A domain includes its subdomains; you can also enter an IP address or a CIDR range.",
  "proxy.supportedSchemes":
    "Supported: {http}, {https}, and {socks}. If a username and password are required, include them in the proxy address.",

  // settings
  "settings.launcherSettings": "LAUNCHER SETTINGS",
  "settings.appearance": "APPEARANCE",
  "settings.customDesignActiveEdit":
    "Custom design active · edit in Appearance Studio (Ctrl+Shift+A)",
  "settings.editDesignInAppearance": "Edit design in Appearance Studio (Ctrl+Shift+A)",
  "settings.downloadSource": "DOWNLOAD SOURCE",
  "settings.autoDownloadJava": "AUTO-DOWNLOAD JAVA",
  "settings.language": "LANGUAGE",
  "settings.launcherUpdates": "LAUNCHER UPDATES",
  "settings.version": "Version",
  "settings.newVersionsAreChecked":
    "New versions are checked at startup and installed without a Windows installer.",
  "settings.checking": "CHECKING…",
  "settings.checkNow": "CHECK NOW",
  "settings.preferences": "PREFERENCES",
  "settings.optimizedJavaArguments": "OPTIMIZED JAVA ARGUMENTS",
  "settings.launchWithG1gcSettings":
    "Launch with G1GC settings and fixed heap size. Turn off for a standard launch.",
  "settings.wheelTabSwitching": "WHEEL TAB SWITCHING",
  "settings.switchTabsWithThe": "Switch tabs with the mouse wheel.",
  "settings.launcherMascot": "LAUNCHER MASCOT",
  "settings.theMascotWalksAround":
    "The mascot walks around the launcher. Use the arrow to configure its behavior.",
  "settings.mascotName": "MASCOT NAME",
  "settings.mascotName2": "Mascot name",
  "settings.showMascotName": "SHOW MASCOT NAME",
  "settings.showTheMascotsName": "Show the mascot's name on hover.",
  "settings.rageMode": "RAGE MODE",
  "settings.hardThrowsBuildUp": "Hard throws build up warnings and may make the mascot angry.",
  "settings.waterBowl": "WATER BOWL",
  "settings.showABowlThe":
    "Show a bowl the mascot can drink from; you can pick it up and throw it.",
  "settings.autonomousMovement": "AUTONOMOUS MOVEMENT",
  "settings.allowTheMascotTo": "Allow the mascot to walk around the launcher.",
  "settings.playWithControls": "PLAY WITH CONTROLS",
  "settings.jumpOntoButtonsFields": "Jump onto buttons, fields, and sliders in calm mode.",
  "settings.carryUiElements": "CARRY UI ELEMENTS",
  "settings.pickUpAndCarry": "Pick up and carry interface elements.",
  "settings.scrollLists": "SCROLL LISTS",
  "settings.walkUpToLists": "Walk up to lists and scroll through them.",
  "settings.showSnapshots": "SHOW SNAPSHOTS",
  "settings.showSnapshotVersionsIn": "Show snapshot versions in the install list.",
  "settings.showPreReleases": "SHOW PRE-RELEASES",
  "settings.showPreReleaseAnd": "Show pre-release and release candidate versions.",
  "settings.advancedSettings": "ADVANCED SETTINGS",
  "settings.enablesBuildSettingsAnd": "Enables build settings and custom card appearance.",
  "settings.extensions": "EXTENSIONS",
  "settings.manage": "MANAGE",

  // updateProgress
  "updateProgress.mb": "MB",
  "updateProgress.mbS": "MB/s",
  "updateProgress.underASecond": "under a second",
  "updateProgress.theUpdateSignatureCheck":
    "The update signature check failed. The file was not installed.",
  "updateProgress.theUpdateServerDid":
    "The update server did not respond in time. Check your connection and try again.",
  "updateProgress.cantReachTheUpdate":
    "Can't reach the update server. Check your connection or proxy.",
  "updateProgress.theUpdateServerReturned": "The update server returned an error. Try again later.",
  "updateProgress.unknownUpdateError": "Unknown update error.",
  "updateProgress.seconds": "~{seconds} s",
  "updateProgress.minutes": "~{minutes} min",

  // worldBackups
  "worldBackups.savingWorlds": "Saving worlds…",
  "worldBackups.restoringWorlds": "Restoring worlds…",
  "worldBackups.deletingBackup": "Deleting backup…",
  "worldBackups.refreshing": "Refreshing…",
  "worldBackups.whichWorldsShouldBe": "Which worlds should be restored?",
  "worldBackups.deleteThisBackup": "Delete this backup?",
  "worldBackups.selectedWorldsWillReplace":
    "Selected worlds will replace the current game worlds. Their previous versions will be backed up first.",
  "worldBackups.clearSelection": "Clear selection",
  "worldBackups.selectAll": "Select all",
  "worldBackups.replaceInGame": "Replace in game",
  "worldBackups.restoreToGame": "Restore to game",
  "worldBackups.onlyThisBackupWill":
    "Only this backup will be deleted. Your game worlds will remain.",
  "worldBackups.cancel": "Cancel",
  "worldBackups.deleteBackup": "Delete backup",
  "worldBackups.restore": "Restore",
  "worldBackups.worldBackups": "World backups",
  "worldBackups.refreshWorldsAndBackups": "Refresh worlds and backups",
  "worldBackups.refresh": "Refresh",
  "worldBackups.closeWorldBackups": "Close world backups",
  "worldBackups.closeTheGameTo": "Close the game to back up or restore worlds.",
  "worldBackups.worldsToBackUp": "Worlds to back up",
  "worldBackups.loadingWorlds": "Loading worlds…",
  "worldBackups.yourWorldsWillAppear": "Your worlds will appear here",
  "worldBackups.createAWorldIn": "Create a world in this build, then come back to back it up.",
  "worldBackups.backupName": "Backup name",
  "worldBackups.optional": "optional",
  "worldBackups.forExampleBeforeUpdating": "For example, before updating mods",
  "worldBackups.saving": "Saving…",
  "worldBackups.createBackup": "Create backup",
  "worldBackups.savedBackups": "Saved backups",
  "worldBackups.backupType": "Backup type",
  "worldBackups.all": "All",
  "worldBackups.mine": "Mine",
  "worldBackups.automatic": "Automatic",
  "worldBackups.loadingBackups": "Loading backups…",
  "worldBackups.noBackupsOfThis": "No backups of this type yet",
  "worldBackups.noSavedBackupsYet": "No saved backups yet",
  "worldBackups.theyWillAppearAfter": "They will appear after restoring worlds.",
  "worldBackups.backUpYourWorlds": "Back up your worlds so you can return to them later.",
  "worldBackups.worldBackup": "World backup",
  "worldBackups.restored": "Restored",
  "worldBackups.backupContents": "Backup contents",
  "worldBackups.worldsInBackup": "Worlds in backup",
  "worldBackups.beforeRestore": "Before restore",
  "worldBackups.couldNotRefreshThe": "Could not refresh the list",
  "worldBackups.backupCreatedWithWorlds": "Backup created with {worldCount} worlds.",
  "worldBackups.andMore": " and {value} more",
  "worldBackups.restoredToGame": "Restored to game: {worlds}{extra}. {note}",
  "worldBackups.backupDeletedGameWorlds": "Backup deleted. Game worlds were kept.",
  "worldBackups.restoredNoteSafety": "Previous versions were saved in a safety backup.",
  "worldBackups.restoredNoteAvailable": "Worlds are available in the build again.",
  "worldBackups.unknownDate": "Unknown date",
  "worldBackups.worlds": { one: "{count} world", other: "{count} worlds" },
  "worldBackups.selectedOf": "{selected} of {total} selected",

  // worldPreview
  "worldPreview.no": "No",
  "worldPreview.preview": "preview",

  // duration
  "duration.hoursMinutes": "{hours} h {minutes} min",
  "duration.hours": "{hours} h",
  "duration.minutes": "{minutes} min",
  "duration.seconds": "{seconds} sec",
  "duration.minutesSeconds": "{minutes} min {seconds} sec",

  // playtime
  "playtime.neverPlayed": "Never played",
  "playtime.today": "Today",
  "playtime.yesterday": "Yesterday",
  "playtime.daysAgo": { one: "{count} day ago", other: "{count} days ago" },
  "playtime.noPlaytime": "No playtime recorded",
  "playtime.hoursOnRecord": "{hours} hrs on record",

  // buildActivityCalendar.weekday
  "buildActivityCalendar.weekday.mon": "MO",
  "buildActivityCalendar.weekday.tue": "TU",
  "buildActivityCalendar.weekday.wed": "WE",
  "buildActivityCalendar.weekday.thu": "TH",
  "buildActivityCalendar.weekday.fri": "FR",
  "buildActivityCalendar.weekday.sat": "SA",
  "buildActivityCalendar.weekday.sun": "SU",

  // buildActivityCalendar.level
  "buildActivityCalendar.level.0": "No activity",
  "buildActivityCalendar.level.1": "Up to 30 min",
  "buildActivityCalendar.level.2": "30–60 min",
  "buildActivityCalendar.level.3": "1–3 h",
  "buildActivityCalendar.level.4": "> 3 h",

  // buildStats.kind
  "buildStats.kind.created": "Created",
  "buildStats.kind.mod": "Mod",
  "buildStats.kind.pack": "Resource pack",
  "buildStats.kind.shader": "Shader",
  "buildStats.kind.launched": "Game",

  // buildStats.filter
  "buildStats.filter.all": "All events",
  "buildStats.filter.launched": "Game",
  "buildStats.filter.mod": "Mods",
  "buildStats.filter.resources": "Resources",

  // buildStats.tab
  "buildStats.tab.timeline": "Timeline",
  "buildStats.tab.heatmap": "Heatmap",
  "buildStats.tab.constellation": "Constellation",

  // microsoftAccounts.motion
  "microsoftAccounts.motion.STILL": "STILL",
  "microsoftAccounts.motion.IDLE": "IDLE",
  "microsoftAccounts.motion.WALK": "WALK",
  "microsoftAccounts.motion.RUN": "RUN",
  "microsoftAccounts.motion.WAVE": "WAVE",

  // microsoftAccounts.skin
  "microsoftAccounts.skin.CLASSIC": "CLASSIC",
  "microsoftAccounts.skin.SLIM": "SLIM",

  // modrinthDependencies.status
  "modrinthDependencies.status.download": "Will download",
  "modrinthDependencies.status.installed": "Already installed",
  "modrinthDependencies.status.enable": "Will enable",

  // modrinthProject.kind
  "modrinthProject.kind.mods": "MOD",
  "modrinthProject.kind.resourcepacks": "RESOURCE PACK",
  "modrinthProject.kind.shaders": "SHADERPACK",

  // settings.choice
  "settings.choice.light": "LIGHT",
  "settings.choice.dark": "DARK",
  "settings.choice.void": "VOID",
  "settings.choice.studio": "STUDIO",
  "settings.choice.official": "OFFICIAL",
  "settings.choice.auto": "AUTO",
  "settings.choice.mirror": "MIRROR",
  "settings.choice.ru": "RU",
  "settings.choice.en": "EN",

  // discordRpc.mode
  "discordRpc.mode.minecraft": "Minecraft",
  "discordRpc.mode.launcher": "Launcher",
  "discordRpc.mode.combined": "Game and launcher",

  // bot.crop
  "bot.crop.auto": "Any from inventory / all ripe",
  "bot.crop.wheat": "Wheat",
  "bot.crop.beetroot": "Beetroot",
  "bot.crop.carrot": "Carrot",
  "bot.crop.potato": "Potato",
  "bot.crop.pumpkin": "Pumpkin",
  "bot.crop.melon": "Melon",
  "bot.crop.nether_wart": "Nether wart",

  // bot.action.mine
  "bot.action.mine.label": "Mine blocks",
  "bot.action.mine.note": "Ores, stone, and other blocks",
  "bot.action.mine.short": "Mine",

  // bot.action.forest
  "bot.action.forest.label": "Gather wood",
  "bot.action.forest.note": "Chop and collect logs",
  "bot.action.forest.short": "Wood",

  // bot.action.till
  "bot.action.till.label": "Till soil",
  "bot.action.till.note": "Prepare beds next to water",
  "bot.action.till.short": "Till",

  // bot.action.plant
  "bot.action.plant.label": "Plant seeds",
  "bot.action.plant.note": "Fill empty beds",
  "bot.action.plant.short": "Plant",

  // bot.action.harvest
  "bot.action.harvest.label": "Harvest crops",
  "bot.action.harvest.note": "Ripe plants only, with replanting",
  "bot.action.harvest.short": "Harvest",

  // bot.action.farm
  "bot.action.farm.label": "Tend the farm",
  "bot.action.farm.note": "Harvest, till, and plant in one pass",
  "bot.action.farm.short": "Farm",

  // bot.action.craft
  "bot.action.craft.label": "Craft",
  "bot.action.craft.note": "Ingredients and tools",
  "bot.action.craft.short": "Craft",

  // bot.action.smelt
  "bot.action.smelt.label": "Smelt",
  "bot.action.smelt.note": "Metals, food, and materials",
  "bot.action.smelt.short": "Smelt",

  // bot.action.return
  "bot.action.return.label": "Return to start",
  "bot.action.return.note": "Back to where the workflow began",
  "bot.action.return.short": "Return",

  // bot.action.collect
  "bot.action.collect.label": "Pick up items",
  "bot.action.collect.note": "Collect nearby drops",
  "bot.action.collect.short": "Collect",

  // bot.action.deposit
  "bot.action.deposit.label": "Store in chests",
  "bot.action.deposit.note": "Unload to the configured storage",
  "bot.action.deposit.short": "To chests",

  // bot.workspace
  "bot.workspace.scenario": "Scenario",
  "bot.workspace.inventory": "Inventory",
  "bot.workspace.production": "Workstations",
  "bot.workspace.settings": "Settings",
  "bot.workspace.control": "Log and chat",

  // bot.settingsSection
  "bot.settingsSection.connection": "Connection",
  "bot.settingsSection.behavior": "Movement",
  "bot.settingsSection.survival": "Survival",
  "bot.settingsSection.combat": "Combat and items",
  "bot.settingsSection.gathering": "Gathering and storage",
  "bot.settingsSection.commands": "Commands",

  // bot.movementPreset.safe
  "bot.movementPreset.safe.label": "CAUTIOUS",
  "bot.movementPreset.safe.description": "Doesn't change the world",

  // bot.movementPreset.balanced
  "bot.movementPreset.balanced.label": "BALANCED",
  "bot.movementPreset.balanced.description": "Normal movement",

  // bot.movementPreset.explorer
  "bot.movementPreset.explorer.label": "EXPLORER",
  "bot.movementPreset.explorer.description": "Fast, breaks blocks",

  // bot.combatPreset
  "bot.combatPreset.novice": "NOVICE",
  "bot.combatPreset.regular": "REGULAR",
  "bot.combatPreset.expert": "EXPERT",
  "bot.combatPreset.aggressive": "AGGRESSIVE",

  // bot.gathering.mode
  "bot.gathering.mode.mine": "Blocks and ores",
  "bot.gathering.mode.forest": "Forest",
  "bot.gathering.mode.quarry": "Area",
  "bot.gathering.mode.collect": "Drops",
  "bot.gathering.mode.tunnel": "Tunnel",
  "bot.gathering.mode.till": "Tilling",
  "bot.gathering.mode.plant": "Planting",
  "bot.gathering.mode.harvest": "Harvest",
  "bot.gathering.mode.farm": "Farm",

  // bot.gathering.phase
  "bot.gathering.phase.idle": "Ready to work",
  "bot.gathering.phase.scan": "Looking for blocks",
  "bot.gathering.phase.move": "Walking to a block",
  "bot.gathering.phase.equip": "Choosing a tool",
  "bot.gathering.phase.dig": "Digging",
  "bot.gathering.phase.farming": "Working the beds",
  "bot.gathering.phase.pickup": "Picking up loot",
  "bot.gathering.phase.deposit": "Unloading",
  "bot.gathering.phase.deliver": "Bringing loot to you",
  "bot.gathering.phase.return": "Returning",
  "bot.gathering.phase.paused": "Paused",

  // bot.inventory.slot
  "bot.inventory.slot.helmet": "Helmet",
  "bot.inventory.slot.chestplate": "Chestplate",
  "bot.inventory.slot.leggings": "Leggings",
  "bot.inventory.slot.boots": "Boots",
  "bot.inventory.slot.offhand": "Off hand",

  // bot.production.station
  "bot.production.station.crafting_table": "Crafting table",
  "bot.production.station.furnace": "Furnace",
  "bot.production.station.blast_furnace": "Blast furnace",
  "bot.production.station.smoker": "Smoker",
  "bot.production.station.stonecutter": "Stonecutter",
  "bot.production.station.anvil": "Anvil",
  "bot.production.station.chipped_anvil": "Chipped anvil",
  "bot.production.station.damaged_anvil": "Damaged anvil",
  "bot.production.station.enchanting_table": "Enchanting table",
  "bot.production.station.brewing_stand": "Brewing stand",
  "bot.production.station.smithing_table": "Smithing table",
  "bot.production.station.grindstone": "Grindstone",
  "bot.production.station.loom": "Loom",
  "bot.production.station.cartography_table": "Cartography table",
  "bot.production.station.crafter": "Crafter",
  "bot.production.station.chest": "Chest",
  "bot.production.station.barrel": "Barrel",
  "bot.production.station.hopper": "Hopper",
  "bot.production.station.dispenser": "Dispenser",
  "bot.production.station.dropper": "Dropper",

  // bot.production.slotHelp
  "bot.production.slotHelp.crafting_table":
    "0 — result; 1–9 — 3×3 grid. Use the form above for automatic crafting.",
  "bot.production.slotHelp.furnace": "0 — input; 1 — fuel; 2 — result.",
  "bot.production.slotHelp.blast_furnace": "0 — input; 1 — fuel; 2 — result.",
  "bot.production.slotHelp.smoker": "0 — food; 1 — fuel; 2 — result.",
  "bot.production.slotHelp.anvil":
    "0 — item; 1 — material or book; 2 — result. Repairing and combining cost experience.",
  "bot.production.slotHelp.chipped_anvil": "0 — item; 1 — material or book; 2 — result.",
  "bot.production.slotHelp.damaged_anvil": "0 — item; 1 — material or book; 2 — result.",
  "bot.production.slotHelp.stonecutter":
    "0 — material; 1 — result. After loading, choose a recipe number starting from 0.",
  "bot.production.slotHelp.enchanting_table":
    "0 — item; 1 — lapis. Enchantment options: 0, 1, 2. Experience is required.",
  "bot.production.slotHelp.brewing_stand":
    "0–2 — bottles; 3 — ingredient; 4 — blaze powder. Wait for brewing to finish.",
  "bot.production.slotHelp.smithing_table":
    "In newer versions: 0 — template; 1 — item; 2 — material; 3 — result. In older versions: two inputs and a result.",
  "bot.production.slotHelp.grindstone": "0–1 — items; 2 — result.",
  "bot.production.slotHelp.loom":
    "0 — banner; 1 — dye; 2 — pattern; 3 — result. Choose a pattern number starting from 0.",
  "bot.production.slotHelp.cartography_table": "0 — map; 1 — paper, map, or glass; 2 — result.",
  "bot.production.slotHelp.crafter": "0–8 — crafter grid. A redstone signal is needed to run it.",

  // units
  "units.bytes": "{value} B",
  "units.kilobytes": "{value} KB",
  "units.megabytes": "{value} MB",
  "units.gigabytes": "{value} GB",
  "units.terabytes": "{value} TB",
  "units.blocksShort": "{value} bl.",

  // environmentVariables
  "environmentVariables.invalidName": "Enter a variable name without = or NUL.",
  "environmentVariables.valueHasNul": "The value of {name} contains NUL.",
  "environmentVariables.duplicate": "{name} is already added (names are case-insensitive).",

  // launcherUpdate.step
  "launcherUpdate.step.download": "Download",
  "launcherUpdate.step.verify": "Verify",
  "launcherUpdate.step.restart": "Restart",

  // toast
  "toast.buildExported": "Build exported",
  "toast.buildImported": "Build imported",
  "toast.couldntOpenAppearanceStudio": "Couldn't open Appearance Studio",
  "toast.couldntOpenFolder": "Couldn't open folder",
  "toast.couldntSaveRam": "Couldn't save RAM",
  "toast.couldntSaveMascotSetting": "Couldn't save mascot setting",
  "toast.couldntSaveMascotSettings": "Couldn't save mascot settings",
  "toast.couldntSaveNetwork": "Couldn't save network",
  "toast.couldntSavePlugins": "Couldn't save plugins",
  "toast.couldntSaveSetting": "Couldn't save setting",
  "toast.deleteFailed": "Delete failed",
  "toast.downloadCancelled": "Download cancelled",
  "toast.exportFailed": "Export failed",
  "toast.forcedStop": "Forced stop",
  "toast.importCancelled": "Import cancelled",
  "toast.importComplete": "Import complete",
  "toast.importFailed": "Import failed",
  "toast.importIncomplete": "Import incomplete",
  "toast.installFailed": "Install failed",
  "toast.stopFailed": "Stop failed",
  "toast.uninstallFailed": "Uninstall failed",
  "toast.upToDate": "Up to date",
  "toast.updateCheckFailed": "Update check failed",
  "toast.modInstalled": "Mod installed",
  "toast.modInstallFailed": "Mod install failed",
  "toast.modRemoved": "Mod removed",
  "toast.resourcePackInstalled": "Resource pack installed",
  "toast.resourcePackInstallFailed": "Resource pack install failed",
  "toast.resourcePackRemoved": "Resource pack removed",
  "toast.shaderInstalled": "Shader installed",
  "toast.shaderInstallFailed": "Shader install failed",
  "toast.shaderRemoved": "Shader removed",
  "toast.notifications": "Notifications",
  "toast.dismiss": "Dismiss",

  // dialog
  "dialog.buildTask": "Build task",
  "dialog.exportModrinthPack": "Export Modrinth pack",
  "dialog.importBuild": "Import build",

  // toast.default
  "toast.default.info": "DONE",
  "toast.default.warning": "HEADS UP",
  "toast.default.error": "ERROR",

  // tabs
  "tabs.overview": "OVERVIEW",
  "tabs.instances": "BUILDS",
  "tabs.mods": "MODRINTH",
  "tabs.resourcepacks": "PACKS",
  "tabs.shaders": "SHADERS",
  "tabs.settings": "SETTINGS",

  // plugins.discordRpc
  "plugins.discordRpc.tag": "Discord status",
  "plugins.discordRpc.description":
    "Shows your build, Minecraft version, and play time in your Discord profile.",

  // plugins.mineflayerBot
  "plugins.mineflayerBot.tag": "Minecraft companion",
  "plugins.mineflayerBot.description":
    "Create mining, crafting, and smelting workflows for the bot to run in order.",

  // plugins.blueMap
  "plugins.blueMap.tag": "World map",
  "plugins.blueMap.description":
    "Creates an interactive world map and opens it in a browser or separate window.",

  // plugins.obsTelemetry
  "plugins.obsTelemetry.tag": "Stream overlay",
  "plugins.obsTelemetry.description":
    "Sends player health, armor, food, and coordinates to an OBS overlay.",

  // plugins.proxy
  "plugins.proxy.tag": "Network and downloads",
  "plugins.proxy.description": "Downloads launcher files through an HTTP, HTTPS, or SOCKS5 proxy.",

  // pluginStatus
  "pluginStatus.on": "Enabled",
  "pluginStatus.off": "Disabled",
  "pluginStatus.removing": "Removing…",
  "pluginStatus.needsAppId": "Set an Application ID",
  "pluginStatus.needsServer": "Set a server",
  "pluginStatus.needsAccount": "Choose an account",
  "pluginStatus.needsUrl": "Set an address",
  "pluginStatus.needsPackage": "Configure the package",
  "pluginStatus.needsPort": "Set a port",

  // modrinthContent.mods
  "modrinthContent.mods.searchLabel": "MODRINTH SEARCH",
  "modrinthContent.mods.searchPlaceholder": "Search compatible mods...",
  "modrinthContent.mods.catalogLabel": "DISCOVER / INSTALL",
  "modrinthContent.mods.noTargetTitle": "NO MODDED BUILDS",
  "modrinthContent.mods.noTargetText": "Create a Fabric, Quilt or NeoForge build in BUILDS.",
  "modrinthContent.mods.loadingTitle": "LOADING MODS",
  "modrinthContent.mods.loadingText": "Loading mods from Modrinth.",
  "modrinthContent.mods.emptyText": "Try another search or build.",
  "modrinthContent.mods.loadingMoreText": "Loading more mods...",
  "modrinthContent.mods.targetSectionLabel": "CURRENT TARGET",
  "modrinthContent.mods.targetDropdownLabel": "MODDED BUILD",
  "modrinthContent.mods.targetPlaceholder": "SELECT MODDED BUILD",
  "modrinthContent.mods.detailLabel": "LOADER",
  "modrinthContent.mods.installedLabel": "INSTALLED MODS",
  "modrinthContent.mods.installedLoadingText": "Reading installed mods...",
  "modrinthContent.mods.installedEmptyText": "This build has no installed mods yet.",
  "modrinthContent.mods.deleteTitle": "Delete mod",
  "modrinthContent.mods.fallbackCategory": "Mod",

  // modrinthContent.resourcepacks
  "modrinthContent.resourcepacks.searchLabel": "PACK SEARCH",
  "modrinthContent.resourcepacks.searchPlaceholder": "Search resource packs...",
  "modrinthContent.resourcepacks.catalogLabel": "RESOURCE PACKS",
  "modrinthContent.resourcepacks.noTargetTitle": "NO BUILDS",
  "modrinthContent.resourcepacks.noTargetText":
    "Create a build in BUILDS to install resource packs from Modrinth.",
  "modrinthContent.resourcepacks.loadingTitle": "LOADING RESOURCE PACKS",
  "modrinthContent.resourcepacks.loadingText": "Loading resource packs.",
  "modrinthContent.resourcepacks.emptyText": "Try another search or Minecraft version.",
  "modrinthContent.resourcepacks.loadingMoreText": "Loading more packs...",
  "modrinthContent.resourcepacks.targetSectionLabel": "ACTIVE PROFILE",
  "modrinthContent.resourcepacks.targetDropdownLabel": "TARGET BUILD",
  "modrinthContent.resourcepacks.targetPlaceholder": "SELECT BUILD",
  "modrinthContent.resourcepacks.detailLabel": "FOLDER",
  "modrinthContent.resourcepacks.installedLabel": "INSTALLED PACKS",
  "modrinthContent.resourcepacks.installedLoadingText": "Reading installed resource packs...",
  "modrinthContent.resourcepacks.installedEmptyText":
    "This build has no installed resource packs yet.",
  "modrinthContent.resourcepacks.deleteTitle": "Delete resource pack",
  "modrinthContent.resourcepacks.fallbackCategory": "Resource Pack",

  // modrinthContent.shaders
  "modrinthContent.shaders.searchLabel": "SHADER SEARCH",
  "modrinthContent.shaders.searchPlaceholder": "Search shaders...",
  "modrinthContent.shaders.catalogLabel": "SHADERPACKS",
  "modrinthContent.shaders.noTargetTitle": "NO BUILDS",
  "modrinthContent.shaders.noTargetText":
    "Create a build in BUILDS to install shaders from Modrinth.",
  "modrinthContent.shaders.loadingTitle": "LOADING SHADERS",
  "modrinthContent.shaders.loadingText": "Loading shaders.",
  "modrinthContent.shaders.emptyText": "Try another search or Minecraft version.",
  "modrinthContent.shaders.loadingMoreText": "Loading more shaders...",
  "modrinthContent.shaders.targetSectionLabel": "ACTIVE PROFILE",
  "modrinthContent.shaders.targetDropdownLabel": "TARGET BUILD",
  "modrinthContent.shaders.targetPlaceholder": "SELECT BUILD",
  "modrinthContent.shaders.detailLabel": "FOLDER",
  "modrinthContent.shaders.installedLabel": "INSTALLED SHADERS",
  "modrinthContent.shaders.installedLoadingText": "Reading installed shaders...",
  "modrinthContent.shaders.installedEmptyText": "This build has no installed shaders yet.",
  "modrinthContent.shaders.deleteTitle": "Delete shader",
  "modrinthContent.shaders.fallbackCategory": "Shader",

  // guide.navigation
  "guide.navigation.eyebrow": "NAVIGATION / BASICS",
  "guide.navigation.title": "ALL SECTIONS ARE ON THE LEFT",
  "guide.navigation.description":
    "Click a section or use the mouse wheel to switch tabs. The active tab is highlighted.",

  // guide.overviewHome
  "guide.overviewHome.eyebrow": "OVERVIEW / HOME",
  "guide.overviewHome.title": "QUICK START",
  "guide.overviewHome.description":
    "The home screen shows the selected build, playtime, and launch button. If you have no builds, create one from here.",

  // guide.nickname
  "guide.nickname.eyebrow": "OVERVIEW / PLAYER",
  "guide.nickname.title": "OFFLINE NICKNAME",
  "guide.nickname.description":
    "Click the nickname to edit it. Offline Minecraft uses this name; the player card updates immediately.",

  // guide.account
  "guide.account.eyebrow": "OVERVIEW / ACCOUNT",
  "guide.account.title": "OFFLINE OR MICROSOFT",
  "guide.account.description":
    "Choose your sign-in method. OFFLINE uses your nickname; MICROSOFT opens the account manager for official sign-in.",

  // guide.buildLibrary
  "guide.buildLibrary.eyebrow": "BUILDS / LIBRARY",
  "guide.buildLibrary.title": "YOUR BUILDS",
  "guide.buildLibrary.description":
    "Each card is a separate Minecraft instance with its own version, loader, mods, settings, and playtime. Click a card to select it.",

  // guide.buildCreateImport
  "guide.buildCreateImport.eyebrow": "BUILDS / ADD",
  "guide.buildCreateImport.title": "CREATE OR IMPORT",
  "guide.buildCreateImport.description":
    "CREATE BUILD opens the new build form. The arrow button imports an archive or mrpack file.",

  // guide.buildEditor
  "guide.buildEditor.eyebrow": "BUILDS / CONFIGURATION",
  "guide.buildEditor.title": "VERSION, LOADER, PROFILE",
  "guide.buildEditor.description":
    "Set a new build's name, Minecraft version, and loader here, or inspect the selected build. Fabric, Quilt, Forge, and NeoForge support mods.",

  // guide.buildActions
  "guide.buildActions.eyebrow": "BUILDS / ACTIONS",
  "guide.buildActions.title": "LAUNCH AND MANAGE",
  "guide.buildActions.description":
    "PLAY launches the build, INSTALL downloads files, FOLDER opens its directory, and STATS shows playtime. Export, screenshots, appearance, and delete are on the right.",

  // guide.modsSearch
  "guide.modsSearch.eyebrow": "MODRINTH / SEARCH",
  "guide.modsSearch.title": "FIND A MOD",
  "guide.modsSearch.description":
    "Search Modrinth by mod name or keyword. Results are filtered for the selected build's version.",

  // guide.modsCatalog
  "guide.modsCatalog.eyebrow": "MODRINTH / CATALOG",
  "guide.modsCatalog.title": "MOD CARDS",
  "guide.modsCatalog.description":
    "Open a card for details or click INSTALL. The launcher chooses a compatible file and required dependencies. Installed mods can be updated or removed.",

  // guide.modsTarget
  "guide.modsTarget.eyebrow": "MODRINTH / TARGET",
  "guide.modsTarget.title": "CHOOSE A BUILD",
  "guide.modsTarget.description":
    "The target build receives the mod. Only compatible modded builds appear here.",

  // guide.modsInstalled
  "guide.modsInstalled.eyebrow": "MODRINTH / INSTALLED",
  "guide.modsInstalled.title": "INSTALLED MODS",
  "guide.modsInstalled.description":
    "The selected build's installed mods appear below. You can remove them here.",

  // guide.packsSearch
  "guide.packsSearch.eyebrow": "PACKS / SEARCH",
  "guide.packsSearch.title": "FIND RESOURCE PACKS",
  "guide.packsSearch.description":
    "Search Modrinth for textures and visual packs. Results follow the selected build's Minecraft version.",

  // guide.packsCatalog
  "guide.packsCatalog.eyebrow": "PACKS / CATALOG",
  "guide.packsCatalog.title": "ONE-CLICK INSTALL",
  "guide.packsCatalog.description":
    "Cards show the author, description, and popularity. INSTALL adds a pack to the selected build's resourcepacks folder.",

  // guide.packsTarget
  "guide.packsTarget.eyebrow": "PACKS / TARGET",
  "guide.packsTarget.title": "CHOOSE A BUILD",
  "guide.packsTarget.description":
    "Check the target before installing. Resource packs work with any loader when the Minecraft version is compatible.",

  // guide.packsInstalled
  "guide.packsInstalled.eyebrow": "PACKS / INSTALLED",
  "guide.packsInstalled.title": "MANAGE RESOURCE PACKS",
  "guide.packsInstalled.description":
    "This list shows packs in the selected build. Removing one does not affect other builds.",

  // guide.shadersSearch
  "guide.shadersSearch.eyebrow": "SHADERS / SEARCH",
  "guide.shadersSearch.title": "FIND SHADERS",
  "guide.shadersSearch.description":
    "Search Modrinth for shader packs by name, lighting style, or performance.",

  // guide.shadersCatalog
  "guide.shadersCatalog.eyebrow": "SHADERS / CATALOG",
  "guide.shadersCatalog.title": "DOWNLOAD SHADERS",
  "guide.shadersCatalog.description":
    "INSTALL downloads a compatible version to shaderpacks. Open a card to read its full description first.",

  // guide.shadersTarget
  "guide.shadersTarget.eyebrow": "SHADERS / COMPATIBILITY",
  "guide.shadersTarget.title": "CHECK IRIS",
  "guide.shadersTarget.description":
    "Choose the target build. For Fabric, the launcher indicates whether Iris is installed; Minecraft needs Iris or an equivalent to enable shaders.",

  // guide.shadersInstalled
  "guide.shadersInstalled.eyebrow": "SHADERS / INSTALLED",
  "guide.shadersInstalled.title": "INSTALLED SHADERS",
  "guide.shadersInstalled.description":
    "Downloaded shader packs for the selected build appear below. Remove unwanted packs here.",

  // guide.settingsRam
  "guide.settingsRam.eyebrow": "SETTINGS / MEMORY",
  "guide.settingsRam.title": "ALLOCATE RAM",
  "guide.settingsRam.description":
    "The slider sets default game memory. Typical builds use 4–6 GB; large modpacks may need more. Leave enough for the system.",

  // guide.settingsAppearance
  "guide.settingsAppearance.eyebrow": "SETTINGS / APPEARANCE",
  "guide.settingsAppearance.title": "LAUNCHER THEME",
  "guide.settingsAppearance.description":
    "LIGHT, DARK, and VOID change the theme instantly. With advanced settings enabled, STUDIO opens the appearance editor.",

  // guide.settingsSource
  "guide.settingsSource.eyebrow": "SETTINGS / NETWORK",
  "guide.settingsSource.title": "DOWNLOAD SOURCE",
  "guide.settingsSource.description":
    "OFFICIAL uses Mojang servers, MIRROR uses a mirror, and AUTO selects a route and switches when needed.",

  // guide.settingsAutoJava
  "guide.settingsAutoJava.eyebrow": "SETTINGS / JAVA",
  "guide.settingsAutoJava.title": "AUTOMATIC JAVA",
  "guide.settingsAutoJava.description":
    "When enabled, the launcher downloads a suitable Java version for Minecraft. Turn it off only if you manage Java yourself.",

  // guide.settingsLanguage
  "guide.settingsLanguage.eyebrow": "SETTINGS / LANGUAGE",
  "guide.settingsLanguage.title": "INTERFACE LANGUAGE",
  "guide.settingsLanguage.description":
    "Choose the launcher language here. The interface changes immediately and your choice is saved for the next launch.",

  // guide.settingsPreferences
  "guide.settingsPreferences.eyebrow": "SETTINGS / PREFERENCES",
  "guide.settingsPreferences.title": "LAUNCHER BEHAVIOR",
  "guide.settingsPreferences.description":
    "These switches control launch behavior, navigation, version visibility, and extra features.",

  // guide.settingsOptimized
  "guide.settingsOptimized.eyebrow": "PREFERENCES / JAVA",
  "guide.settingsOptimized.title": "OPTIMIZED JAVA ARGUMENTS",
  "guide.settingsOptimized.description":
    "Adds tested G1GC arguments and a fixed heap for more stable play. Turn off if you use custom Java arguments.",

  // guide.settingsWheel
  "guide.settingsWheel.eyebrow": "PREFERENCES / NAVIGATION",
  "guide.settingsWheel.title": "WHEEL TAB SWITCHING",
  "guide.settingsWheel.description":
    "Switch main tabs with the mouse wheel. Lists still scroll normally without changing sections.",

  // guide.settingsMascot
  "guide.settingsMascot.eyebrow": "PREFERENCES / MASCOT",
  "guide.settingsMascot.title": "LAUNCHER MASCOT",
  "guide.settingsMascot.description":
    "Enable the interactive mascot. Expand this setting to adjust its name, movement, reactions, and abilities.",

  // guide.settingsSnapshots
  "guide.settingsSnapshots.eyebrow": "PREFERENCES / VERSIONS",
  "guide.settingsSnapshots.title": "SHOW SNAPSHOTS",
  "guide.settingsSnapshots.description":
    "Add experimental Minecraft snapshots to the build form. They may be unstable or incompatible with mods.",

  // guide.settingsPrereleases
  "guide.settingsPrereleases.eyebrow": "PREFERENCES / VERSIONS",
  "guide.settingsPrereleases.title": "SHOW PRE-RELEASES",
  "guide.settingsPrereleases.description":
    "Show pre-release and release candidate versions for early testing.",

  // guide.settingsAdvanced
  "guide.settingsAdvanced.eyebrow": "PREFERENCES / ADVANCED",
  "guide.settingsAdvanced.title": "ADVANCED SETTINGS",
  "guide.settingsAdvanced.description":
    "Unlock build card appearance, Appearance Studio, and the extension manager.",

  // guide.guideReplay
  "guide.guideReplay.eyebrow": "GUIDE / DONE",
  "guide.guideReplay.title": "REPLAY THE GUIDE",
  "guide.guideReplay.description":
    "The GUIDE button in the top bar starts these tips again whenever you need them.",

  // obsTelemetry.overlay
  "obsTelemetry.overlay.all": "Full overlay",
  "obsTelemetry.overlay.settings": "Overlay settings",
  "obsTelemetry.overlay.health": "Health",
  "obsTelemetry.overlay.food": "Food",
  "obsTelemetry.overlay.xp": "Experience",
  "obsTelemetry.overlay.armor": "Armor",
  "obsTelemetry.overlay.helmet": "Helmet",
  "obsTelemetry.overlay.chestplate": "Chestplate",
  "obsTelemetry.overlay.leggings": "Leggings",
  "obsTelemetry.overlay.boots": "Boots",
  "obsTelemetry.overlay.coords": "Coordinates",
  "obsTelemetry.overlay.items": "Items",
  "obsTelemetry.overlay.mainHand": "Main hand",
  "obsTelemetry.overlay.offhand": "Off hand",
  "obsTelemetry.overlay.dimension": "Dimension",

  // bot.catalog
  "bot.catalog.blockTypes": { one: "{count} block type", other: "{count} block types" },
  "bot.catalog.allOres": "all ores",
  "bot.catalog.allLogs": "all logs",

  // bot.catalog.group
  "bot.catalog.group.ores": "All ores",
  "bot.catalog.group.logs": "Tree trunks",
  "bot.catalog.group.wood": "Wood",
  "bot.catalog.group.leaves": "Leaves",
  "bot.catalog.group.coal": "Coal",
  "bot.catalog.group.iron": "Iron",
  "bot.catalog.group.copper": "Copper",
  "bot.catalog.group.gold": "Gold",
  "bot.catalog.group.redstone": "Redstone",
  "bot.catalog.group.lapis": "Lapis Lazuli",
  "bot.catalog.group.diamond": "Diamonds",
  "bot.catalog.group.emerald": "Emeralds",
  "bot.catalog.group.quartz": "Quartz",

  // bot.storageFilter.valuable
  "bot.storageFilter.valuable.name": "Valuable resources",
  "bot.storageFilter.valuable.description": "Diamonds, emeralds, gold, netherite, and rare items",

  // bot.storageFilter.bulk
  "bot.storageFilter.bulk.name": "Bulk blocks and junk",
  "bot.storageFilter.bulk.description": "Stone, dirt, sand, gravel, and other bulk materials",

  // bot.storageFilter.food
  "bot.storageFilter.food.name": "Food",
  "bot.storageFilter.food.description": "Produce and cooked food",

  // bot.storageFilter.all
  "bot.storageFilter.all.name": "Everything else",
  "bot.storageFilter.all.description": "Loot with no dedicated group",

  // bot.storageFilter.wood
  "bot.storageFilter.wood.name": "All wooden",
  "bot.storageFilter.wood.description": "Wood: logs, planks, leaves, and wooden items",

  // bot.storageFilter.logs
  "bot.storageFilter.logs.name": "Logs and stems",
  "bot.storageFilter.logs.description": "All species, including stripped logs",

  // bot.storageFilter.leaves
  "bot.storageFilter.leaves.name": "Leaves and saplings",
  "bot.storageFilter.leaves.description": "All tree species",

  // bot.storageFilter.ores
  "bot.storageFilter.ores.name": "Ores and minerals",
  "bot.storageFilter.ores.description": "Ore blocks, raw materials, ingots, and mined minerals",

  // bot.storageFilter.stone
  "bot.storageFilter.stone.name": "Stone and rock",
  "bot.storageFilter.stone.description": "Stone, cobblestone, deepslate, and other rock",

  // bot.storageFilter.coal
  "bot.storageFilter.coal.name": "Coal",
  "bot.storageFilter.coal.description": "Coal, coal ores, and blocks",

  // bot.storageFilter.iron
  "bot.storageFilter.iron.name": "Iron",
  "bot.storageFilter.iron.description": "Ores, raw iron, ingots, and blocks",

  // bot.storageFilter.copper
  "bot.storageFilter.copper.name": "Copper",
  "bot.storageFilter.copper.description": "Ores, raw copper, ingots, and blocks",

  // bot.storageFilter.gold
  "bot.storageFilter.gold.name": "Gold",
  "bot.storageFilter.gold.description": "Ores, raw gold, ingots, and blocks",

  // bot.storageFilter.diamond
  "bot.storageFilter.diamond.name": "Diamonds",
  "bot.storageFilter.diamond.description": "Diamonds, diamond ores, and blocks",

  // bot.storageFilter.emerald
  "bot.storageFilter.emerald.name": "Emeralds",
  "bot.storageFilter.emerald.description": "Emeralds, emerald ores, and blocks",

  // bot.storageFilter.redstone
  "bot.storageFilter.redstone.name": "Redstone",
  "bot.storageFilter.redstone.description": "Redstone dust, redstone ores, and blocks",

  // bot.storageFilter.lapis
  "bot.storageFilter.lapis.name": "Lapis Lazuli",
  "bot.storageFilter.lapis.description": "Lapis, lapis ores, and blocks",

  // bot.storageFilter.quartz
  "bot.storageFilter.quartz.name": "Quartz",
  "bot.storageFilter.quartz.description": "Quartz, quartz ores, and blocks",

  // bot.storageFilter.netherite
  "bot.storageFilter.netherite.name": "Netherite",
  "bot.storageFilter.netherite.description": "Ancient debris, scrap, ingots, and blocks",

  // bot.item
  "bot.item.iron": "Iron",
  "bot.item.coal": "Coal",
  "bot.item.gold": "Gold",
  "bot.item.copper": "Copper",
  "bot.item.diamond": "Diamond",
  "bot.item.emerald": "Emerald",
  "bot.item.redstone": "Redstone Dust",
  "bot.item.lapis": "Lapis Lazuli",
  "bot.item.stone": "Stone",
  "bot.item.cobblestone": "Cobblestone",
  "bot.item.dirt": "Dirt",
  "bot.item.sand": "Sand",
  "bot.item.stick": "Stick",
  "bot.item.raw_iron": "Raw Iron",
  "bot.item.iron_ingot": "Iron Ingot",
  "bot.item.iron_pickaxe": "Iron Pickaxe",
  "bot.item.iron_axe": "Iron Axe",
  "bot.item.iron_sword": "Iron Sword",
  "bot.item.iron_shovel": "Iron Shovel",
  "bot.item.wooden_spear": "Wooden Spear",
  "bot.item.stone_spear": "Stone Spear",
  "bot.item.iron_spear": "Iron Spear",
  "bot.item.golden_spear": "Golden Spear",
  "bot.item.diamond_spear": "Diamond Spear",
  "bot.item.netherite_spear": "Netherite Spear",
  "bot.item.crafting_table": "Crafting Table",
  "bot.item.oak_planks": "Oak Planks",
  "bot.item.spruce_planks": "Spruce Planks",
  "bot.item.birch_planks": "Birch Planks",

  // bot.preset.new_farm
  "bot.preset.new_farm.label": "New farm",
  "bot.preset.new_farm.description": "Gather wood, craft a hoe, then till and plant the beds.",
  "bot.preset.new_farm.requires":
    "Start next to water. You need seeds or vegetables to plant; the bot prepares wood and a hoe on its own.",

  // bot.preset.farm
  "bot.preset.farm.label": "Farm upkeep",
  "bot.preset.farm.description": "Harvest ripe crops, replant, and fill empty beds in one pass.",
  "bot.preset.farm.requires": "The bot needs a hoe and seeds; new tilling needs water nearby.",

  // bot.preset.harvest
  "bot.preset.harvest.label": "Harvest",
  "bot.preset.harvest.description": "Harvest every ripe crop within 8 blocks and replant it.",
  "bot.preset.harvest.requires":
    "Ripe plants nearby; seeds from the inventory and the harvest for replanting.",

  // bot.preset.wheat
  "bot.preset.wheat.label": "Sow wheat",
  "bot.preset.wheat.description": "Prepare the beds and plant wheat seeds.",
  "bot.preset.wheat.requires":
    "Start next to water. You need seeds or vegetables to plant; the bot prepares wood and a hoe on its own.",

  // bot.preset.carrots
  "bot.preset.carrots.label": "Carrot beds",
  "bot.preset.carrots.description": "Till the soil and plant carrots from the inventory.",
  "bot.preset.carrots.requires":
    "Start next to water. You need seeds or vegetables to plant; the bot prepares wood and a hoe on its own.",

  // bot.preset.potatoes
  "bot.preset.potatoes.label": "Plant potatoes",
  "bot.preset.potatoes.description": "Craft a hoe, prepare the soil, and plant potatoes.",
  "bot.preset.potatoes.requires":
    "Start next to water. You need seeds or vegetables to plant; the bot prepares wood and a hoe on its own.",

  // bot.preset.beetroot
  "bot.preset.beetroot.label": "Beetroot beds",
  "bot.preset.beetroot.description": "Till and sow free soil with beetroot seeds.",
  "bot.preset.beetroot.requires":
    "Start next to water. You need seeds or vegetables to plant; the bot prepares wood and a hoe on its own.",

  // bot.preset.pumpkins
  "bot.preset.pumpkins.label": "Pumpkin patch",
  "bot.preset.pumpkins.description": "Plant pumpkins, leaving room nearby for the fruit.",
  "bot.preset.pumpkins.requires":
    "Start next to water. You need seeds or vegetables to plant; the bot prepares wood and a hoe on its own.",

  // bot.preset.melons
  "bot.preset.melons.label": "Melon patch",
  "bot.preset.melons.description": "Prepare the beds and plant melon seeds.",
  "bot.preset.melons.requires":
    "Start next to water. You need seeds or vegetables to plant; the bot prepares wood and a hoe on its own.",

  // bot.preset.nether_wart
  "bot.preset.nether_wart.label": "Nether wart",
  "bot.preset.nether_wart.description": "Plant free soul sand within 8 blocks.",
  "bot.preset.nether_wart.requires": "Nether wart in the inventory and prepared soul sand nearby.",

  // bot.preset.coal
  "bot.preset.coal.label": "Coal stock",
  "bot.preset.coal.description": "Mine 32 coal ore blocks and return to the start.",
  "bot.preset.coal.requires": "A wooden pickaxe or better; loaded ore within 32 blocks.",

  // bot.preset.iron_ingots
  "bot.preset.iron_ingots.label": "32 iron ingots",
  "bot.preset.iron_ingots.description": "Mine coal and iron, return, and smelt the raw ore.",
  "bot.preset.iron_ingots.requires":
    "A stone pickaxe or better. A furnace at the start point; a crafting table nearby or wood to make one.",

  // bot.preset.copper_ingots
  "bot.preset.copper_ingots.label": "32 copper ingots",
  "bot.preset.copper_ingots.description": "Gather fuel and copper, then smelt 32 raw units.",
  "bot.preset.copper_ingots.requires":
    "A stone pickaxe or better. A furnace at the start point; a crafting table nearby or wood to make one.",

  // bot.preset.gold_ingots
  "bot.preset.gold_ingots.label": "32 gold ingots",
  "bot.preset.gold_ingots.description": "Mine coal and gold ore, then smelt the gold.",
  "bot.preset.gold_ingots.requires":
    "An iron pickaxe or better. A furnace at the start point; a crafting table nearby or wood to make one.",

  // bot.preset.diamonds
  "bot.preset.diamonds.label": "Diamond run",
  "bot.preset.diamonds.description": "Mine 8 diamond ore blocks and return to base.",
  "bot.preset.diamonds.requires": "An iron pickaxe or better; diamond ore in loaded chunks.",

  // bot.preset.building_stone
  "bot.preset.building_stone.label": "Building stone",
  "bot.preset.building_stone.description":
    "Mine 128 stone blocks and bring the cobblestone back to the start.",
  "bot.preset.building_stone.requires":
    "A pickaxe with plenty of durability and free inventory space.",

  // bot.preset.starter
  "bot.preset.starter.label": "Wooden start",
  "bot.preset.starter.description": "Gather wood, craft a crafting table and five wooden tools.",
  "bot.preset.starter.requires":
    "Trees within 16 blocks; the bot crafts the crafting table itself.",

  // bot.preset.stone_tools
  "bot.preset.stone_tools.label": "Stone tools",
  "bot.preset.stone_tools.description": "Craft a wooden pickaxe, mine stone, and make five tools.",
  "bot.preset.stone_tools.requires":
    "Trees and plain stone nearby; the bot crafts the pickaxe first.",

  // bot.preset.iron
  "bot.preset.iron.label": "Iron tools",
  "bot.preset.iron.description":
    "Gather fuel, iron, and wood; craft a pickaxe, axe, sword, and shovel.",
  "bot.preset.iron.requires":
    "A stone pickaxe or better. A furnace at the start point; a crafting table nearby or wood to make one.",

  // bot.preset.iron_armor
  "bot.preset.iron_armor.label": "Full iron armor",
  "bot.preset.iron_armor.description": "Mine and smelt iron, then craft all four armor pieces.",
  "bot.preset.iron_armor.requires":
    "A stone pickaxe or better. A furnace at the start point; a crafting table nearby or wood to make one.",

  // bot.preset.farmer_gear
  "bot.preset.farmer_gear.label": "Farmer kit",
  "bot.preset.farmer_gear.description":
    "Gather resources and craft an iron hoe and an empty bucket.",
  "bot.preset.farmer_gear.requires":
    "A stone pickaxe or better. A furnace at the start point; a crafting table nearby or wood to make one.",

  // bot.preset.wood
  "bot.preset.wood.label": "Wood → sticks",
  "bot.preset.wood.description": "Chop 4 logs and craft 16 sticks.",
  "bot.preset.wood.requires": "Trees within 16 blocks.",

  // bot.preset.torches
  "bot.preset.torches.label": "64 torches",
  "bot.preset.torches.description": "Gather wood and coal, return, and craft torches.",
  "bot.preset.torches.requires": "A pickaxe for coal; trees and coal ore nearby.",

  // bot.preset.chests
  "bot.preset.chests.label": "8 chests",
  "bot.preset.chests.description": "Gather 20 logs and craft chests for a future storage.",
  "bot.preset.chests.requires": "Trees nearby; the chests stay in the bot's inventory.",

  // bot.preset.glass
  "bot.preset.glass.label": "32 glass blocks",
  "bot.preset.glass.description": "Mine coal and sand, return, and smelt glass.",
  "bot.preset.glass.requires":
    "A pickaxe for coal; sand nearby. A furnace at the start point; a crafting table nearby or wood to make one.",

  // bot.preset.stone_bricks
  "bot.preset.stone_bricks.label": "32 stone bricks",
  "bot.preset.stone_bricks.description":
    "Mine stone and coal, smelt cobblestone, and craft bricks.",
  "bot.preset.stone_bricks.requires":
    "A regular pickaxe without Silk Touch. A furnace at the start point; a crafting table nearby or wood to make one.",

  // bot.preset.furnaces
  "bot.preset.furnaces.label": "4 furnaces",
  "bot.preset.furnaces.description": "Gather wood and stone, then craft four regular furnaces.",
  "bot.preset.furnaces.requires": "A pickaxe without Silk Touch; trees and stone nearby.",

  // bot.preset.bread
  "bot.preset.bread.label": "8 bread",
  "bot.preset.bread.description":
    "Gather wood, harvest and replant 24 ripe wheat, then bake bread.",
  "bot.preset.bread.requires":
    "At least 24 ripe wheat plants within 8 blocks; seeds for replanting.",

  // bot.preset.baked_potatoes
  "bot.preset.baked_potatoes.label": "16 baked potatoes",
  "bot.preset.baked_potatoes.description":
    "Mine coal, harvest and replant potatoes, then cook them.",
  "bot.preset.baked_potatoes.requires":
    "A pickaxe for coal, 16 ripe potato plants nearby, and a furnace or smoker at the start.",

  // bot.preset.harvest_storage
  "bot.preset.harvest_storage.label": "Harvest to storage",
  "bot.preset.harvest_storage.description":
    "Harvest and replant ripe crops, return, and unload the haul.",
  "bot.preset.harvest_storage.requires":
    "Configured chest groups and suitable filters for the harvest.",

  // bot.preset.cleanup
  "bot.preset.cleanup.label": "Area cleanup",
  "bot.preset.cleanup.description": "Pick up drops within 16 blocks and store them.",
  "bot.preset.cleanup.requires": "Configured storage with suitable filters and free space.",

  // bot.presetGroup
  "bot.presetGroup.farm": "Farm",
  "bot.presetGroup.mining": "Resources",
  "bot.presetGroup.gear": "Gear",
  "bot.presetGroup.craft": "Crafting and building",
  "bot.presetGroup.food": "Food",
  "bot.presetGroup.storage": "Storage",
  "bot.presetGroup.all": "All",

  // bot.workflowName
  "bot.workflowName.wood": "Wood{amount}",
  "bot.workflowName.till": "Tilling beds",
  "bot.workflowName.plant": "Planting seeds",
  "bot.workflowName.harvest": "Harvesting crops",
  "bot.workflowName.farm": "Tending the farm",
  "bot.workflowName.mine": "Mining: {item}{amount}",
  "bot.workflowName.mineFallback": "blocks",
  "bot.workflowName.craftFallback": "Craft",
  "bot.workflowName.smelt": "Smelting: {item}{amount}",
  "bot.workflowName.smeltFallback": "materials",
  "bot.workflowName.collect": "Collecting items",
  "bot.workflowName.deposit": "To storage",
  "bot.workflowName.return": "Returning",
  "bot.workflowName.new": "New workflow",

  // placeholderGuide.group
  "placeholderGuide.group.build": "Build",
  "placeholderGuide.group.player": "Player",
  "placeholderGuide.group.launcher": "Launcher",
  "placeholderGuide.group.library": "Library",
  "placeholderGuide.group.bot": "Mineflayer bot",

  // placeholderValue
  "placeholderValue.empty": "Empty",
  "placeholderValue.fabric": "Fabric",
  "placeholderValue.forge": "Forge",
  "placeholderValue.microsoft": "Microsoft",
  "placeholderValue.neoforge": "NeoForge",
  "placeholderValue.offline": "Offline",
  "placeholderValue.official": "Official",
  "placeholderValue.imported": "Imported",
  "placeholderValue.quilt": "Quilt",
  "placeholderValue.ready": "Ready",
  "placeholderValue.running": "Running",
  "placeholderValue.updating": "Updating",
  "placeholderValue.vanilla": "Vanilla",
  "placeholderValue.unknown": "Unknown",

  // buildCard
  "buildCard.cardAppearance": "CARD APPEARANCE",
  "buildCard.reset": "RESET",
  "buildCard.save": "SAVE",
  "buildCard.layout": "Layout",
  "buildCard.height": "Height",
  "buildCard.vertical": "Vertical",
  "buildCard.top": "Top",
  "buildCard.center": "Center",
  "buildCard.bottom": "Bottom",
  "buildCard.grid": "Grid",
  "buildCard.onEdit": "On · edit",
  "buildCard.offLock": "Off · lock",
  "buildCard.positions": "Positions",
  "buildCard.resetPositions": "RESET POSITIONS",
  "buildCard.sizes": "Sizes",
  "buildCard.resetSizes": "RESET SIZES",
  "buildCard.turnOnTheGrid":
    "Turn on the grid, then select any text, tag or pin. Drag it to move, or pull its bottom-right handle to resize. Positions snap to {gridSize}px cells. The pin appears on pinned builds.",
  "buildCard.turnItOffTo": "Turn it off to continue drawing.",

  // buildCardDrawingCanvas
  "buildCardDrawingCanvas.buildCardDrawingCanvas": "Build card drawing canvas",
  "buildCardDrawingCanvas.brushColor": "Brush color",
  "buildCardDrawingCanvas.brushSize": "Brush size",
  "buildCardDrawingCanvas.undo": "Undo",
  "buildCardDrawingCanvas.clear": "Clear",

  // buildCardEditorBackground
  "buildCardEditorBackground.fitWholeImage": "FIT WHOLE IMAGE",
  "buildCardEditorBackground.fillCard": "FILL CARD",
  "buildCardEditorBackground.fit": "Fit",
  "buildCardEditorBackground.imageFit": "IMAGE FIT",
  "buildCardEditorBackground.opacity": "Opacity",
  "buildCardEditorBackground.background": "Background",
  "buildCardEditorBackground.type": "Type",
  "buildCardEditorBackground.color": "Color",
  "buildCardEditorBackground.image": "Image",
  "buildCardEditorBackground.draw": "Draw",
  "buildCardEditorBackground.source": "Source",
  "buildCardEditorBackground.changeImage": "CHANGE IMAGE",
  "buildCardEditorBackground.uploadImage": "UPLOAD IMAGE",
  "buildCardEditorBackground.clearImage": "CLEAR IMAGE",
  "buildCardEditorBackground.canvas": "Canvas",
  "buildCardEditorBackground.drawDirectlyOnThe":
    "Draw directly on the card canvas. Choose a brush color and size on the left.",

  // buildCardEditorBadge
  "buildCardEditorBadge.badge": "Badge",
  "buildCardEditorBadge.visible": "Visible",
  "buildCardEditorBadge.always": "Always",
  "buildCardEditorBadge.text": "Text",
  "buildCardEditorBadge.bgColor": "Bg Color",
  "buildCardEditorBadge.textColor": "Text Color",

  // buildCardEditorContent
  "buildCardEditorContent.tag": "Tag",
  "buildCardEditorContent.text": "Text",
  "buildCardEditorContent.tagPlaceholder": "Tag placeholder",
  "buildCardEditorContent.textPlaceholder": "Text placeholder",
  "buildCardEditorContent.deleteTag": "Delete tag",
  "buildCardEditorContent.size": "Size",
  "buildCardEditorContent.border": "Border",
  "buildCardEditorContent.stroke": "Stroke",
  "buildCardEditorContent.fill": "Fill",
  "buildCardEditorContent.fill2": "Fill %",
  "buildCardEditorContent.text2": "Text %",
  "buildCardEditorContent.content": "Content",
  "buildCardEditorContent.mode": "Mode",
  "buildCardEditorContent.plainText": "Plain text",
  "buildCardEditorContent.tags": "Tags",
  "buildCardEditorContent.align": "Align",
  "buildCardEditorContent.left": "Left",
  "buildCardEditorContent.center": "Center",
  "buildCardEditorContent.right": "Right",
  "buildCardEditorContent.textOutline": "TEXT OUTLINE",
  "buildCardEditorContent.drawAStrokeAround": "Draw a stroke around plain text placeholders.",
  "buildCardEditorContent.addATagTo":
    "Add a tag to show build placeholders inside the card content area.",
  "buildCardEditorContent.addTag": "Add tag",

  // buildCardResizeHandle
  "buildCardResizeHandle.resizeElement": "Resize element",
  "buildCardResizeHandle.dragToResizeArrow": "Drag to resize · Arrow keys to adjust size",

  // buildCardSettingsPopup
  "buildCardSettingsPopup.newBuildSettings": "NEW BUILD SETTINGS",
  "buildCardSettingsPopup.buildSettings": "BUILD SETTINGS",
  "buildCardSettingsPopup.buildSettingsSections": "Build settings sections",
  "buildCardSettingsPopup.card": "CARD",
  "buildCardSettingsPopup.reset": "RESET",
  "buildCardSettingsPopup.save": "SAVE",

  // buildPlaceholderCaseControl
  "buildPlaceholderCaseControl.placeholderOutputCase": "Placeholder output case",
  "buildPlaceholderCaseControl.forceTheResolvedPlaceholder":
    "Force the resolved placeholder value to uppercase",
  "buildPlaceholderCaseControl.keepTheResolvedPlaceholder":
    "Keep the resolved placeholder value's natural casing",
  "buildPlaceholderCaseControl.uppercase": "UPPERCASE",
  "buildPlaceholderCaseControl.asValue": "AS VALUE",
  "buildPlaceholderCaseControl.mixedCase": "MIXED CASE",

  // colorPicker
  "colorPicker.saturationBrightnessUseArrow":
    "Saturation {saturationPercent}%, brightness {brightnessPercent}%. Use arrow keys to adjust.",
  "colorPicker.pickColorFromScreen": "Pick color from screen",
  "colorPicker.selectedColor": "Selected color {previewColor}",
  "colorPicker.hue": "Hue",

  // inlineDropdown
  "inlineDropdown.noIris": "NO IRIS",

  // installProgress
  "installProgress.buildTask": "BUILD TASK",
  "installProgress.minimize": "Minimize",
  "installProgress.currentStep": "CURRENT STEP",
  "installProgress.waitingForBuildTask": "WAITING FOR BUILD TASK",

  // launcherGuideScenes
  "launcherGuideScenes.name": "NAME",
  "launcherGuideScenes.movement": "MOVEMENT",

  // minecraftSkinPreview
  "minecraftSkinPreview.noSkinData": "NO SKIN DATA",

  // numberStepperArrows
  "numberStepperArrows.increaseValue": "Increase value",
  "numberStepperArrows.decreaseValue": "Decrease value",
};
