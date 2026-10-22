import { interfaceRu } from "./interface.ru";
import { appearanceRu } from "./appearance.ru";
import type { RussianPlural } from "./types";

/**
 * Russian interface text — the source catalog. Every key here must also exist in `en.ts`;
 * TypeScript reports a missing or extra English key. Placeholders use `{name}`.
 */
export const ru = {
  ...interfaceRu,
  ...appearanceRu,
  "commandPalette.title": "Быстрые команды",
  "commandPalette.shortcut": "Ctrl+K",
  "commandPalette.context": "Игрок: {player}. Выбранная сборка: {build}.",
  "commandPalette.contextTag": "Игрок и сборка",
  "commandPalette.drag": "Потяните — отпустите, и панель вернётся на место",
  "commandPalette.contentTarget": "Сборка для контента: {name}",
  "commandPalette.placeholder": "Настройки, действия, сборки, моды…",
  "commandPalette.results": "Команды, настройки и контент",
  "commandPalette.search.mods": "Найти «{query}» в модах",
  "commandPalette.search.resourcepacks": "Найти «{query}» в ресурспаках",
  "commandPalette.search.shaders": "Найти «{query}» в шейдерах",
  "commandPalette.mods": "Моды",
  "commandPalette.resourcepacks": "Ресурспаки",
  "commandPalette.shaders": "Шейдеры",
  "commandPalette.installed": "Установлено",
  "commandPalette.actions": "Действия",
  "commandPalette.sections": "Разделы",
  "commandPalette.revealSetting": "Перейти к настройке",
  "commandPalette.selectBuild": "Для поиска выберите сборку",
  "commandPalette.loading": "Поиск в Modrinth…",
  "commandPalette.catalogError": "Не удалось загрузить: {kinds}. Можно повторить поиск в каталоге.",
  "commandPalette.stopBuild": "Остановить игру",
  "commandPalette.installFiles": "Установить файлы Minecraft",
  "commandPalette.deletedBuilds": "Корзина сборок",
  "commandPalette.accounts": "Аккаунты Microsoft",
  "commandPalette.appearanceStudio": "Редактор оформления",
  "commandPalette.searchTarget": "Modrinth · {name}",
  "commandPalette.searchNeedsBuild": "Modrinth · для поиска выберите сборку с загрузчиком модов",
  "commandPalette.openFolder": "Открыть папку",
  "commandPalette.launchBuild": "Запустить сборку",
  "commandPalette.createBuild": "Создать сборку",
  "commandPalette.empty": "Доступных команд пока нет",
  // app
  "app.youHaveTheLatest": "Установлена последняя версия",
  "app.enterABuildName": "Введите название сборки",
  "app.chooseAMinecraftVersion": "Выберите версию Minecraft",
  "app.chooseALoaderVersion": "Выберите версию загрузчика {createLoader}",
  "app.creatingBuild": "Создаём сборку…",
  "app.buildCreated": "Сборка создана",
  "app.buildCreatedCleanName": "Сборка {cleanName} создана",
  "app.createFailed": "Не удалось создать сборку",
  "app.installingMinecraftFiles": "Устанавливаем файлы Minecraft…",
  "app.installFinished": "Установка завершена",
  "app.filesInstalled": "Файлы {name} установлены",
  "app.installComplete": "Установка завершена",
  "app.installFailed": "Ошибка установки",
  "app.selectAMicrosoftAccount": "Выберите аккаунт Microsoft перед запуском",
  "app.launched": "{name} запущена",
  "app.minecraftLaunched": "Minecraft запущен",
  "app.minecraftIsStillRunning": "Minecraft всё ещё работает после команды остановки.",
  "app.stillRunning": "Всё ещё запущен",
  "app.stopTheGameBefore": "Сначала остановите игру, затем перемести сборку в корзину.",
  "app.buildIsRunning": "Сборка запущена",
  "app.buildMovedToTrash": "Сборка {deletedName} перемещена в корзину",
  "app.buildMovedToTrash2": "Сборка в корзине",
  "app.buildRestored": "Сборка {name} восстановлена",
  "app.buildRestored2": "Сборка восстановлена",
  "app.buildPermanentlyDeleted": "Сборка удалена окончательно",
  "app.buildDeleted": "Сборка удалена",
  "app.theMascotHidFrom": "Заяц спрятал {hiddenName} только из списка — файлы не удалены.",
  "app.mascotChaos": "Проделки маскота",
  "app.dropJarZipOn": "Перетащите .jar/.zip на сборку или .mrpack/.slbuild для импорта",
  "app.nothingToInstall": "Нечего устанавливать",
  "app.chooseABuildFor": "Сначала выберите сборку, в которую установить файлы",
  "app.noBuildSelected": "Сборка не выбрана",
  "app.startTheLauncherGuide": "Запустить тур по лаунчеру",
  "app.guide": "ОБЗОР",
  "app.minimize": "СВЕРНУТЬ",
  "app.expand": "РАЗВЕРНУТЬ",
  "app.player": "НИК",
  "app.launcherSections": "Разделы лаунчера",
  "app.createInstallPlay": "СОЗДАТЬ / УСТАНОВИТЬ / ИГРАТЬ ↓",
  "app.dropToImportBuild": "Отпустите — ИМПОРТ СБОРКИ",
  "app.dropIntoBuild": "Отпустите — В СБОРКУ {value}",
  "app.chooseABuild": "Выберите СБОРКУ",
  "app.selectABuildFirst": "сначала выберите сборку",
  "app.neverPlayed": "Ещё не запускалась",
  "app.deleteBuild": "УДАЛИТЬ СБОРКУ",
  "app.theBuildWillBe":
    "Сборка будет скрыта из списка. Файлы останутся на диске, и сборку можно будет восстановить из корзины.",
  "app.allBuildFilesWill": "Все файлы сборки будут удалены с диска безвозвратно.",
  "app.moveToTrash": "В КОРЗИНУ",

  // blueMap
  "blueMap.worldMap": "КАРТА МИРА",
  "blueMap.addressOfTheInteractive": "Адрес интерактивной карты",
  "blueMap.mapAddress": "АДРЕС КАРТЫ",
  "blueMap.serverAndJava": "СЕРВЕР И JAVA",
  "blueMap.bluemapPathWorkingFolder": "Путь к BlueMap, рабочая папка и параметры обновления",
  "blueMap.bluemapCliFileJar": "ФАЙЛ BLUEMAP CLI · JAR",
  "blueMap.workingFolder": "РАБОЧАЯ ПАПКА",
  "blueMap.folderContainingTheJar": "Папка с JAR-файлом",
  "blueMap.backgroundRender": "ФОНОВЫЙ РЕНДЕР",
  "blueMap.mapUpdate": "ОБНОВЛЕНИЕ КАРТЫ",
  "blueMap.mapControls": "УПРАВЛЕНИЕ КАРТОЙ",
  "blueMap.prepare": "ПОДГОТОВИТЬ",
  "blueMap.working": "Выполняется…",
  "blueMap.start": "ЗАПУСТИТЬ",
  "blueMap.stop": "ОСТАНОВИТЬ",
  "blueMap.hideMap": "СКРЫТЬ КАРТУ",
  "blueMap.showMap": "ПОКАЗАТЬ КАРТУ",
  "blueMap.inBrowser": "В БРАУЗЕРЕ",
  "blueMap.inWindow": "В ОКНЕ",
  "blueMap.state": "СОСТОЯНИЕ",
  "blueMap.world": "МИР",
  "blueMap.serverLog": "ЖУРНАЛ СЕРВЕРА",
  "blueMap.eventsBluemapMessages": "{value} событий · сообщения BlueMap",

  // bot.combatSettings
  "bot.combatSettings.enablePvp": "ВКЛЮЧИТЬ PVP",
  "bot.combatSettings.tacticsAndSkill": "ТАКТИКА И УРОВЕНЬ",
  "bot.combatSettings.adaptiveCombat": "АДАПТИВНЫЙ БОЙ",
  "bot.combatSettings.aggressiveClosingInFinishing":
    "Агрессивное сближение, добивание и выбор действий по здоровью и ситуации. Решения обновляются каждый игровой тик.",
  "bot.combatSettings.healingInCombat": "ЛЕЧЕНИЕ В БОЮ",
  "bot.combatSettings.potionsGoldenApplesAnd":
    "Зелья, золотые яблоки и еда. Адаптивный бой помогает отойти для лечения; автобафы настраиваются в разделе «Выживание».",
  "bot.combatSettings.pearlRetreat": "ЖЕМЧУГ ДЛЯ ОТХОДА",
  "bot.combatSettings.createDistanceToHeal":
    "Создать дистанцию для лечения. Требует включённого жемчуга и соблюдает запас, здоровье и безопасное приземление.",
  "bot.combatSettings.tactic": "ТАКТИКА",
  "bot.combatSettings.autoPressureAndWeapon": "Авто: давление и выбор оружия",
  "bot.combatSettings.meleeOnly": "Только ближний бой",
  "bot.combatSettings.bowOnly": "Только лук",
  "bot.combatSettings.endCrystals": "Кристаллы Края",
  "bot.combatSettings.targetSelection": "ВЫБОР ЦЕЛИ",
  "bot.combatSettings.onCommandOnly": "Только по команде",
  "bot.combatSettings.autoHostileMobs": "Авто: враждебные мобы",
  "bot.combatSettings.searchChaseRange": "ДАЛЬНОСТЬ ПОИСКА / ПРЕСЛЕДОВАНИЯ",
  "bot.combatSettings.reactionMs": "РЕАКЦИЯ, МС",
  "bot.combatSettings.melee": "БЛИЖНИЙ БОЙ",
  "bot.combatSettings.combatEngine": "ДВИЖОК БОЯ",
  "bot.combatSettings.customPvpTacticsAnd": "Custom PvP — тактики и криты",
  "bot.combatSettings.mineflayerPvpBasicCombat": "Mineflayer PvP — базовый бой",
  "bot.combatSettings.weapon": "ОРУЖИЕ",
  "bot.combatSettings.sword": "Меч",
  "bot.combatSettings.axe": "Топор",
  "bot.combatSettings.maceWindCharge": "Булава + заряд ветра",
  "bot.combatSettings.meleeSkill": "НАВЫК БЛИЖНЕГО БОЯ",
  "bot.combatSettings.maxHitsPerSecond": "МАКСИМУМ УДАРОВ В СЕКУНДУ",
  "bot.combatSettings.hitRangeBlocks": "ДИСТАНЦИЯ УДАРА, БЛОКИ",
  "bot.combatSettings.strafe": "СТРЕЙФ",
  "bot.combatSettings.off": "Выключен",
  "bot.combatSettings.smart": "Умный",
  "bot.combatSettings.circle": "По кругу",
  "bot.combatSettings.random": "Случайный",
  "bot.combatSettings.criticalHits": "КРИТИЧЕСКИЕ УДАРЫ",
  "bot.combatSettings.off2": "Выключены",
  "bot.combatSettings.jump": "Прыжок",
  "bot.combatSettings.shortJump": "Короткий прыжок",
  "bot.combatSettings.sprintReset": "СБРОС СПРИНТА",
  "bot.combatSettings.sprintCancel": "Сброс спринта",
  "bot.combatSettings.aLowSkillAdds":
    "Низкий навык добавляет пропуски ударов. Скорость атаки также ограничена перезарядкой оружия в вашей версии Minecraft. Стрейфы, криты, сброс спринта и пробивание щита работают в Custom PvP. Пробивание щита выполняется ударом топора в прыжке, даже если общие криты выключены. Если меча нет, бот наносит топором криты при каждом заряженном ударе.",
  "bot.combatSettings.minecraftJava121":
    "Minecraft Java 1.21+: положите булаву и заряды ветра в инвентарь. Бот прыгает, бросает заряд под ноги, направляется к цели и бьёт на спуске после падения более чем на 1,5 блока. После подтверждённого попадания повторяет связку; «Порыв ветра» позволяет продолжить серию в воздухе. При поднятом щите цели Custom PvP сначала использует топор, если включено пробивание щита. Без зарядов выполняет обычные удары булавой с перезарядкой. Связка работает с обоими движками боя.",
  "bot.combatSettings.useShield": "ИСПОЛЬЗОВАТЬ ЩИТ",
  "bot.combatSettings.inTheInventoryOr": "В ИНВЕНТАРЕ ИЛИ ЛЕВОЙ РУКЕ",
  "bot.combatSettings.breakShields": "ПРОБИВАТЬ ЩИТ",
  "bot.combatSettings.axeAndAJump": "ТОПОР И УДАР В ПРЫЖКЕ",
  "bot.combatSettings.maceDefense": "ЗАЩИТА ОТ БУЛАВЫ",
  "bot.combatSettings.raiseTheShieldAnd": "ПОДНЯТЬ ЩИТ И СЛЕДИТЬ ЗА ПАДАЮЩИМ ПРОТИВНИКОМ",
  "bot.combatSettings.pearlChase": "ПРЕСЛЕДОВАНИЕ ЖЕМЧУГОМ",
  "bot.combatSettings.closeInOnA": "СБЛИЖАТЬСЯ С ДАЛЁКИМ ВРАГОМ И СЛЕДОВАТЬ ЗА ЕГО ТЕЛЕПОРТАЦИЕЙ",
  "bot.combatSettings.theBotThrowsA":
    "Бот бросает жемчуг к далёкому противнику по минимальной дистанции броска, даже если враг не использует жемчуг. После телепортации врага следует к месту его появления и продолжает бой. Переключатель работает независимо от жемчуга для перемещения; безопасное приземление, запас, здоровье и перерыв между бросками учитываются.",
  "bot.combatSettings.smoothAim": "ПЛАВНОЕ НАВЕДЕНИЕ",
  "bot.combatSettings.turnSpeedTowardThe": "Скорость поворота к цели перед ударом и выстрелом",
  "bot.combatSettings.aimSpeed": "СКОРОСТЬ НАВЕДЕНИЯ",
  "bot.combatSettings.100IsTheNormal":
    "100% — обычная скорость поворота головы. 50% — вдвое медленнее, 200% — вдвое быстрее. Применяется к мечу и луку, когда включено плавное наведение.",
  "bot.combatSettings.arrowDefense": "ЗАЩИТА ОТ СТРЕЛ",
  "bot.combatSettings.aimDetection": "РАСПОЗНАВАНИЕ ПРИЦЕЛА",
  "bot.combatSettings.earlyDetection": "Раннее распознавание",
  "bot.combatSettings.byArrowTrajectory": "По траектории стрелы",
  "bot.combatSettings.checkIntervalMs": "ИНТЕРВАЛ ПРОВЕРКИ, МС",
  "bot.combatSettings.detectionRangeBlocks": "ДАЛЬНОСТЬ РАСПОЗНАВАНИЯ, БЛОКИ",
  "bot.combatSettings.sensitivityMarginBlocks": "ЗАПАС ЧУВСТВИТЕЛЬНОСТИ, БЛОКИ",
  "bot.combatSettings.shieldHoldAfterThreat": "УДЕРЖАНИЕ ЩИТА ПОСЛЕ УГРОЗЫ, МС",
  "bot.combatSettings.onlyWhenTheBow": "ТОЛЬКО ПРИ НАТЯЖЕНИИ ЛУКА",
  "bot.combatSettings.dontReactToA": "НЕ РЕАГИРОВАТЬ НА ЛУК, ПРОСТО ВЗЯТЫЙ В РУКИ",
  "bot.combatSettings.earlyModeNoticesThe":
    "Ранний режим замечает направление прицела при натяжении. Режим траектории проверяет полёт с разной силой выстрела. Больший запас чувствительности даёт более раннюю защиту. Повороты и натяжение проверяются сразу при обновлении игрока сервером.",
  "bot.combatSettings.bowShooting": "СТРЕЛЬБА ИЗ ЛУКА",
  "bot.combatSettings.trajectoryCalculation": "РАСЧЁТ ТРАЕКТОРИИ",
  "bot.combatSettings.aimAccuracy": "ТОЧНОСТЬ ПРИЦЕЛА",
  "bot.combatSettings.bowRangeBlocks": "ДАЛЬНОСТЬ ЛУКА, БЛОКИ",
  "bot.combatSettings.shotIntervalMs": "ИНТЕРВАЛ ВЫСТРЕЛОВ, МС",
  "bot.combatSettings.leadTarget": "УПРЕЖДЕНИЕ",
  "bot.combatSettings.accountForTargetMovement": "УЧИТЫВАТЬ ДВИЖЕНИЕ ЦЕЛИ",
  "bot.combatSettings.bowInOffHand": "ЛУК В ЛЕВОЙ РУКЕ",
  "bot.combatSettings.inVersionsWithAn": "В ВЕРСИЯХ СО ВТОРОЙ РУКОЙ",
  "bot.combatSettings.switchToSword": "ПЕРЕХОДИТЬ НА МЕЧ",
  "bot.combatSettings.whenOutOfBow": "КОГДА НЕТ ЛУКА ИЛИ СТРЕЛ",
  "bot.combatSettings.accuracySetsTheAim":
    "Точность задаёт разброс прицела: 100% убирает добавленный разброс. Попадание зависит от движения цели и сервера. Автовыбор атакует только враждебных мобов. Командой с ником можно вызвать на бой любого игрока, включая владельца.",
  "bot.combatSettings.endCrystals2": "КРИСТАЛЛЫ КРАЯ",
  "bot.combatSettings.placeCrystals": "СТАВИТЬ КРИСТАЛЛЫ",
  "bot.combatSettings.onObsidianAndBedrock": "НА ОБСИДИАН И БЕДРОК В ПРЕДЕЛАХ ДОСЯГАЕМОСТИ",
  "bot.combatSettings.detonateCrystals": "ВЗРЫВАТЬ КРИСТАЛЛЫ",
  "bot.combatSettings.accountingForDamageAnd": "С УЧЁТОМ УРОНА И ЦЕПНЫХ ВЗРЫВОВ",
  "bot.combatSettings.buildABase": "СТРОИТЬ ОСНОВУ",
  "bot.combatSettings.placeObsidianFromThe": "СТАВИТЬ ОБСИДИАН ИЗ ИНВЕНТАРЯ",
  "bot.combatSettings.coverBlock": "ЗАЩИТНЫЙ БЛОК",
  "bot.combatSettings.reduceSelfDamageBefore": "ПЕРЕД ВЗРЫВОМ УМЕНЬШАТЬ УРОН СЕБЕ",
  "bot.combatSettings.fastCrystalAim": "БЫСТРОЕ НАВЕДЕНИЕ КРИСТАЛЛОВ",
  "bot.combatSettings.turnWithoutWaitingFor": "ПОВОРАЧИВАТЬСЯ БЕЗ ОЖИДАНИЯ ПЛАВНОЙ АНИМАЦИИ",
  "bot.combatSettings.targetMovementPrediction": "ПРОГНОЗ ДВИЖЕНИЯ ЦЕЛИ",
  "bot.combatSettings.checkTheCurrentAnd": "ПРОВЕРЯТЬ ТЕКУЩУЮ И БУДУЩУЮ ПОЗИЦИЮ",
  "bot.combatSettings.protectOtherOwners": "БЕРЕЧЬ ДРУГИХ ВЛАДЕЛЬЦЕВ",
  "bot.combatSettings.dontDetonateNearThem": "НЕ ВЗРЫВАТЬ РЯДОМ С НИМИ",
  "bot.combatSettings.positionChoice": "ВЫБОР ПОЗИЦИИ",
  "bot.combatSettings.moreDamage": "Больше урона",
  "bot.combatSettings.closerToTheBot": "Ближе к боту",
  "bot.combatSettings.coverBlockType": "БЛОК ДЛЯ ЗАЩИТЫ",
  "bot.combatSettings.automatic": "Автоматически",
  "bot.combatSettings.obsidian": "Обсидиан",
  "bot.combatSettings.planks": "Доски",
  "bot.combatSettings.cobblestone": "Булыжник",
  "bot.combatSettings.placeRangeBlocks": "ДАЛЬНОСТЬ УСТАНОВКИ, БЛОКИ",
  "bot.combatSettings.breakRangeBlocks": "ДАЛЬНОСТЬ РАЗРУШЕНИЯ, БЛОКИ",
  "bot.combatSettings.actionIntervalMs": "ИНТЕРВАЛ ДЕЙСТВИЙ, МС",
  "bot.combatSettings.maxCoverBlocks": "МАКСИМУМ БЛОКОВ УКРЫТИЯ",
  "bot.combatSettings.waitForCrystalFrom": "ОЖИДАНИЕ КРИСТАЛЛА ОТ СЕРВЕРА, МС",
  "bot.combatSettings.crystalPlacementAttempts": "ПОПЫТОК УСТАНОВКИ КРИСТАЛЛА",
  "bot.combatSettings.minTargetDamageHp": "МИНИМАЛЬНЫЙ УРОН ЦЕЛИ, HP",
  "bot.combatSettings.maxSelfDamageHp": "МАКСИМАЛЬНЫЙ УРОН СЕБЕ, HP",
  "bot.combatSettings.keepHealthHp": "ОСТАВИТЬ ЗДОРОВЬЕ, HP",
  "bot.combatSettings.predictTicksAhead": "ПРОГНОЗ НА ТИКОВ ВПЕРЁД",
  "bot.combatSettings.needsCrystalsAndFree":
    "Нужны кристаллы и свободное место над обсидианом или бедроком. Бот проверяет препятствия, занятые позиции и урон до действия, ждёт подтверждения сервера и ограничивает повторные попытки. Оценка урона учитывает броню и защитные блоки. 2 HP равны одному сердцу.",
  "bot.combatSettings.enderPearl": "ЭНДЕР-ЖЕМЧУГ",
  "bot.combatSettings.pearlForFollow": "ЖЕМЧУГ ДЛЯ FOLLOW",
  "bot.combatSettings.shortenTheRouteAfter": "СОКРАЩАТЬ ПУТЬ ЗА ИГРОКОМ",
  "bot.combatSettings.pearlForCome": "ЖЕМЧУГ ДЛЯ COME",
  "bot.combatSettings.shortenTheRouteTo": "СОКРАЩАТЬ ПУТЬ К ИГРОКУ",
  "bot.combatSettings.pearlForGoto": "ЖЕМЧУГ ДЛЯ GOTO",
  "bot.combatSettings.useOnTheWay": "ИСПОЛЬЗОВАТЬ НА ПУТИ К КООРДИНАТАМ",
  "bot.combatSettings.repeatedThrows": "ПОВТОРНЫЕ БРОСКИ",
  "bot.combatSettings.planTheNextLeg": "ПОСЛЕ ТЕЛЕПОРТАЦИИ РАССЧИТАТЬ СЛЕДУЮЩИЙ УЧАСТОК",
  "bot.combatSettings.minRouteShorteningBlocks": "МИНИМАЛЬНОЕ СОКРАЩЕНИЕ ПУТИ, БЛОКИ",
  "bot.combatSettings.maxThrowRangeBlocks": "МАКСИМАЛЬНАЯ ДАЛЬНОСТЬ БРОСКА, БЛОКИ",
  "bot.combatSettings.pauseBetweenThrowsMs": "ПЕРЕРЫВ МЕЖДУ БРОСКАМИ, МС",
  "bot.combatSettings.minHealthBeforeThrowing": "МИНИМУМ ЗДОРОВЬЯ ДО БРОСКА, HP",
  "bot.combatSettings.pearlsToKeepIn": "ОСТАВИТЬ ЖЕМЧУГА В ЗАПАСЕ",
  "bot.combatSettings.theCalculationAccountsFor":
    "Расчёт учитывает скорость и позу бота, гравитацию, сопротивление воздуха и воды, столкновения. Бросок разрешён только на загруженную твёрдую поверхность с местом для бота. При нехватке жемчуга, здоровья или безопасных траекторий бот идёт пешком. После броска ждёт телепортации. Жемчуг обычно отнимает 5 HP. Перемещение работает и при выключенном PvP. Преследование противника включается в разделе «Ближний бой».",
  "bot.combatSettings.stopHint":
    "Вместо player можно указать nearest для ближайшего враждебного моба. Команды движения и {stop} прекращают бой. Настройки применяются при следующем запуске бота.",

  // bot.farmCrop
  "bot.farmCrop.crop": "КУЛЬТУРА",

  // bot.farming
  "bot.farming.theBotNeedsA":
    "Мотыга и семена должны быть у бота. Вспашка — рядом с водой; посадка — в пустые грядки, нарост Незера — на песок душ. Бот собирает только зрелый урожай. Растения растут по обычным правилам Minecraft; для следующего сбора запустите задачу ещё раз.",
  "bot.farming.anyCrops": "Любые культуры",

  // bot.gathering
  "bot.gathering.tillingSoil": "Вспашка земли",
  "bot.gathering.plantingSeeds": "Посадка семян",
  "bot.gathering.harvestingCrops": "Сбор урожая",
  "bot.gathering.tendingTheFarm": "Обработка огорода",
  "bot.gathering.diggingATunnel": "Проходка тоннеля",
  "bot.gathering.logging": "Заготовка леса",
  "bot.gathering.clearingAnArea": "Расчистка области",
  "bot.gathering.collectingItems": "Сбор предметов",
  "bot.gathering.unloadingIntoAChest": "Выгрузка в сундук",
  "bot.gathering.deliveringToTheOwner": "Доставка владельцу",
  "bot.gathering.iron": "железо",
  "bot.gathering.diamonds": "алмазы",
  "bot.gathering.gold": "золото",
  "bot.gathering.coal": "уголь",
  "bot.gathering.copper": "медь",
  "bot.gathering.emeralds": "изумруды",
  "bot.gathering.redstone": "редстоун",
  "bot.gathering.lapis": "лазурит",
  "bot.gathering.mining": "Добыча",
  "bot.gathering.ores": "руды",
  "bot.gathering.blocks": "блоки",
  "bot.gathering.radiusBlocks": {
    one: "радиус {count} блок",
    few: "радиус {count} блока",
    many: "радиус {count} блоков",
  },
  "bot.gathering.blocksInTheArea": {
    one: "{count} блок в области",
    few: "{count} блока в области",
    many: "{count} блоков в области",
  },
  "bot.gathering.targetBlocks": {
    one: "цель {count} блок",
    few: "цель {count} блока",
    many: "цель {count} блоков",
  },
  "bot.gathering.allAvailableBlocks": "все доступные блоки",
  "bot.gathering.couldNotGetThe":
    "Не удалось получить выбранную точку. Переподключите бота и повторите выбор.",
  "bot.gathering.cornerSelectedTheCoordinates":
    "Угол {capture} выбран. Координаты подставлены в форму.",
  "bot.gathering.miningDefenseAppliedTo": "Защита при добыче применена к боту.",
  "bot.gathering.settingsAppliedTheNext":
    "Настройки применены. Следующий проход будет нового размера.",
  "bot.gathering.theBotIsBringing": "Бот несёт добычу к вам, затем вернётся к работе.",
  "bot.gathering.commandAcceptedTheCurrent": "Команда принята. Текущий этап показан ниже.",
  "bot.gathering.firstCornerXY": "ПЕРВЫЙ УГОЛ · X Y Z",
  "bot.gathering.secondCornerXY": "ВТОРОЙ УГОЛ · X Y Z",
  "bot.gathering.pickAPointIn": "Выберите точку в игре или введите X Y Z",
  "bot.gathering.myPosition": "Моя позиция",
  "bot.gathering.blockImAimingAt": "Блок под прицелом",
  "bot.gathering.gatheringTasks": "ЗАДАЧИ ДОБЫЧИ",
  "bot.gathering.addWorkToThe":
    "Добавляйте работу в очередь. Бот выполняет задачи по порядку и хранит добычу в инвентаре.",
  "bot.gathering.youCanSetUp":
    "Можно настроить задачу заранее. Для запуска нажмите «Подключить бота».",
  "bot.gathering.bringMeTheLoot": "ПРИНЕСТИ МНЕ ДОБЫЧУ",
  "bot.gathering.inventoryAndStatus": "ИНВЕНТАРЬ И СОСТОЯНИЕ",
  "bot.gathering.addYourFirstTask": "Добавьте первую задачу",
  "bot.gathering.mined": "Добыто",
  "bot.gathering.collected": "Подобрано",
  "bot.gathering.taskList": "Список задач",
  "bot.gathering.actions": "Действий",
  "bot.gathering.delivered": "Передано",
  "bot.gathering.currentTaskProgress": "Выполнение текущей задачи",
  "bot.gathering.cancelTask": "Отменить задачу",
  "bot.gathering.cancelTheCurrentTask": "Отменить текущую задачу",
  "bot.gathering.afterDelivery": "После доставки",
  "bot.gathering.queue": "ОЧЕРЕДЬ",
  "bot.gathering.clearQueue": "Очистить очередь",
  "bot.gathering.moveTaskUp": "Поднять задачу",
  "bot.gathering.up": "Выше",
  "bot.gathering.moveTaskDown": "Опустить задачу",
  "bot.gathering.down": "Ниже",
  "bot.gathering.removeTask": "Удалить задачу",
  "bot.gathering.remove": "Удалить",
  "bot.gathering.theNextTaskWill": "Следующая задача появится здесь после добавления.",
  "bot.gathering.theQueueIsEmpty": "Очередь пуста. Выберите работу ниже.",
  "bot.gathering.cancelAll": "ОТМЕНИТЬ ВСЁ",
  "bot.gathering.addATask": "ДОБАВИТЬ ЗАДАЧУ",
  "bot.gathering.typeOfWork": "Вид работы",
  "bot.gathering.actions0All": "ДЕЙСТВИЯ · 0 = ВСЕ",
  "bot.gathering.blocksOrGroup": "БЛОКИ ИЛИ ГРУППА",
  "bot.gathering.nameOrIdDiamond": "Название или ID · diamond, iron, ores",
  "bot.gathering.blockCount0All": "КОЛИЧЕСТВО БЛОКОВ · 0 = ВСЕ",
  "bot.gathering.horizontalRadius": "РАДИУС ПО ГОРИЗОНТАЛИ",
  "bot.gathering.radiusBlocks2": "РАДИУС · БЛОКИ",
  "bot.gathering.minimumY": "МИНИМАЛЬНАЯ ВЫСОТА Y",
  "bot.gathering.maximumY": "МАКСИМАЛЬНАЯ ВЫСОТА Y",
  "bot.gathering.itemEmptyAll": "ПРЕДМЕТ · ПУСТО = ВСЕ",
  "bot.gathering.nameOrIdDiamondRawIron": "Название или ID · diamond, raw_iron",
  "bot.gathering.length": "ДЛИНА",
  "bot.gathering.replantAfterHarvest": "ПЕРЕСАЖИВАТЬ ПОСЛЕ СБОРА",
  "bot.gathering.useSeedsFromThe": "Использовать семена из инвентаря и собранного урожая",
  "bot.gathering.standInTheCorner":
    "Встаньте в нужном углу или наведитесь на его блок, затем выберите точку. Бот должен видеть вас; блок под прицелом — не дальше 6 блоков.",
  "bot.gathering.limitOf32768": "превышен лимит 32 768",
  "bot.gathering.eachCornerNeedsThree": "Нужны три числа X Y Z для каждого угла.",
  "bot.gathering.searchAllDepths": "ИСКАТЬ ПО ВСЕЙ ГЛУБИНЕ",
  "bot.gathering.fromTheBottomOf": "От нижней границы мира; проверяет загруженные чанки",
  "bot.gathering.removeLeaves": "УБИРАТЬ ЛИСТВУ",
  "bot.gathering.alongWithTheTrunks": "Вместе со стволами",
  "bot.gathering.scaffoldForTallTrees": "ПОДСТАВЛЯТЬ БЛОКИ ДЛЯ ВЫСОКИХ ДЕРЕВЬЕВ",
  "bot.gathering.usesBlocksFromThe": "Использует блоки из инвентаря",
  "bot.gathering.looksForOreUnderground":
    "Ищет руду под землёй и прокладывает проход к залежи. Радиус ограничивает поиск по горизонтали, высота задаётся отдельно. Нужна подходящая кирка.",
  "bot.gathering.chopsTheTrunksOf":
    "Срубает стволы выбранного леса. Для подъёма нужны строительные блоки; при спуске разбирает опоры под собой. Остальные опоры остаются.",
  "bot.gathering.clearsEverythingBetweenThe":
    "Расчищает включительно между углами, сверху вниз. Максимум 32 768 блоков.",
  "bot.gathering.digsForwardInThe":
    "Копает вперёд по направлению взгляда бота. Пол под туннелем сохраняется.",
  "bot.gathering.picksUpItemsLying": "Подбирает лежащие предметы в заданном радиусе.",
  "bot.gathering.addToQueue": "ДОБАВИТЬ В ОЧЕРЕДЬ",
  "bot.gathering.addAndStart": "ДОБАВИТЬ И НАЧАТЬ",
  "bot.gathering.completedTasks": "Завершённые задачи",
  "bot.gathering.defenseWhileGathering": "ЗАЩИТА ПРИ ДОБЫЧЕ",
  "bot.gathering.selfDefenseWhileMining":
    "Самозащита во время добычи руды, заготовки леса, сбора и выгрузки",
  "bot.gathering.defendAgainstMobs": "ЗАЩИЩАТЬСЯ ОТ МОБОВ",
  "bot.gathering.fightsOffDangerousMobs":
    "Отбивается от опасных мобов рядом и тех, кто напал на бота",
  "bot.gathering.defendAgainstPlayers": "ЗАЩИЩАТЬСЯ ОТ ИГРОКОВ",
  "bot.gathering.hitsBackReturnsTo":
    "Отвечает на удары; через 3 секунды без новых ударов возвращается к работе",
  "bot.gathering.defendAgainstArrows": "ЗАЩИЩАТЬСЯ ОТ СТРЕЛ",
  "bot.gathering.usesAShieldIf":
    "Использует имеющуюся защиту щитом, а без щита ищет безопасный отход",
  "bot.gathering.usesTheCurrentMelee":
    "Использует текущие настройки ближнего боя. При низком здоровье, без оружия или рядом с крипером отходит по безопасному пути. После опасности продолжает ту же задачу. Ручная пауза сохраняется. Настройки действуют и при выключенном автоматическом PvP.",
  "bot.gathering.applyToBot": "ПРИМЕНИТЬ К БОТУ",
  "bot.gathering.tunnelsAndLighting": "ТОННЕЛИ И ОСВЕЩЕНИЕ",
  "bot.gathering.passageSizeWhenMining":
    "Размер проходов при добыче руды, лестницы и факелы на стенах",
  "bot.gathering.tunnelWidthBlocks": "ШИРИНА ТОННЕЛЯ · БЛОКИ",
  "bot.gathering.tunnelHeightBlocks": "ВЫСОТА ТОННЕЛЯ · БЛОКИ",
  "bot.gathering.stairWidthBlocks": "ШИРИНА ЛЕСТНИЦЫ · БЛОКИ",
  "bot.gathering.stairClearanceBlocks": "ПРОСВЕТ ЛЕСТНИЦЫ · БЛОКИ",
  "bot.gathering.flatTunnelsAre2":
    "Ровные тоннели по умолчанию 2 × 2. Лестницы поднимаются или опускаются на один блок за шаг; просвет от пола — минимум три блока, чтобы прыгать без удара головой. Для доставки и возвращения бот ищет путь по готовым проходам.",
  "bot.gathering.placeTorchesInCaves": "СТАВИТЬ ФАКЕЛЫ В ПЕЩЕРЕ",
  "bot.gathering.usesRegularTorchesFrom":
    "Использует обычные факелы из инвентаря и крепит их к стенам",
  "bot.gathering.torchSpacingBlocks": "ИНТЕРВАЛ ФАКЕЛОВ · БЛОКИ",
  "bot.gathering.theDefaultSpacingIs":
    "Интервал по умолчанию — 8 блоков. Если факелов или подходящей стены нет, бот продолжает работу. Настройки сохраняются и применяются при добавлении добычи или тоннеля; для текущей работы нажмите «Применить к боту».",
  "bot.gathering.lootIsKeptIn":
    "Добыча хранится в инвентаре бота. «Принести мне добычу» — подходит к владельцу, выбрасывает добычу перед ним и возвращается. Инструменты, броня, еда и до 64 строительных блоков для пути сохраняются. При заполнении инвентаря бот раскладывает добычу по настроенным группам сундуков. Предметы без подходящей группы остаются у бота.",
  "bot.gathering.chatCornersHint":
    "Можно отметить оба угла прямо в игровом чате: {first} и {second}. Вместо {prefix} используйте свой префикс.",
  "bot.gathering.farmStats": "Вспахано: {tilled} · Посажено: {planted} · Урожай: {harvested}",
  "bot.gathering.minedStat": "Добыто: {mined}",
  "bot.gathering.queueStats": "Подобрано: {collected} · В очереди: {queued}",
  "bot.gathering.historyFarm": "вспахано {tilled} · посажено {planted} · урожай {harvested}",
  "bot.gathering.historyMined": "добыто {mined}",
  "bot.gathering.historyCollected": "подобрано {collected}",
  "bot.gathering.areaBlocks": { one: "{count} блок", few: "{count} блока", many: "{count} блоков" },

  // bot.inventory
  "bot.inventory.slot": "Слот",
  "bot.inventory.empty": "пусто",
  "bot.inventory.emptySlot": "Пустой слот",
  "bot.inventory.health": "ЗДОРОВЬЕ",
  "bot.inventory.hunger": "СЫТОСТЬ",
  "bot.inventory.saturation": "Насыщение",
  "bot.inventory.armor": "БРОНЯ",
  "bot.inventory.armorPoints": "Очки защиты",
  "bot.inventory.inventoryAndStatus": "ИНВЕНТАРЬ И СОСТОЯНИЕ",
  "bot.inventory.theBotsItemsEquipment":
    "Предметы, экипировка и показатели бота обновляются во время игры.",
  "bot.inventory.bot": "Бот",
  "bot.inventory.inGame": "В игре",
  "bot.inventory.disconnected": "Отключён",
  "bot.inventory.toGatheringTasks": "К задачам добычи →",
  "bot.inventory.loadingInventory": "Получаем инвентарь…",
  "bot.inventory.connectTheBot": "Подключите бота",
  "bot.inventory.statsWillAppearOnce": "Показатели появятся после загрузки персонажа.",
  "bot.inventory.clickConnectBotTo":
    "Нажмите «Подключить бота», чтобы видеть предметы и состояние.",
  "bot.inventory.backpack": "РЮКЗАК",
  "bot.inventory.mainInventory": "Основной инвентарь",
  "bot.inventory.hotbar": "БЫСТРЫЙ ДОСТУП",
  "bot.inventory.inHandSlot": "В руке: слот",
  "bot.inventory.hotbar2": "Панель быстрого доступа",
  "bot.inventory.equipment": "ЭКИПИРОВКА",
  "bot.inventory.selectAnItemTo":
    "Выберите предмет, чтобы увидеть количество, прочность и зачарования.",
  "bot.inventory.thisSlotIsEmpty": "Этот слот пуст.",
  "bot.inventory.occupancy": {
    one: "{occupied} / {count} слот",
    few: "{occupied} / {count} слота",
    many: "{occupied} / {count} слотов",
  },
  "bot.inventory.itemCount": "{count} шт.",
  "bot.inventory.durabilityValue": "прочность {current} / {max}",

  // bot.main
  "bot.main.sentToTheBot": "Отправлено боту",
  "bot.main.restart": "Перезапустить",
  "bot.main.pleaseWait": "Подождите…",
  "bot.main.disconnect": "Отключить",
  "bot.main.connectBot": "Подключить бота",
  "bot.main.connected": "Подключён",
  "bot.main.reconnecting": "Переподключается…",
  "bot.main.connecting": "Подключается…",
  "bot.main.notConnected": "Не подключён",
  "bot.main.noServerSet": "Сервер не указан",
  "bot.main.turnTheExtensionOn": "Включите расширение переключателем выше.",
  "bot.main.chooseASeparateMicrosoft": "Выберите для бота отдельный Microsoft-аккаунт.",
  "bot.main.setTheServerAnd": "Укажите сервер и аккаунт бота в настройках подключения.",
  "bot.main.openSettings": "Открыть настройки ↗",
  "bot.main.botWorkspace": "Рабочая область бота",
  "bot.main.settingsSections": "Разделы настроек",
  "bot.main.server": "СЕРВЕР",
  "bot.main.serverAddress": "АДРЕС СЕРВЕРА",
  "bot.main.localhostOrPlayExample": "localhost или play.example.net",
  "bot.main.port": "ПОРТ",
  "bot.main.version": "ВЕРСИЯ",
  "bot.main.botAccount": "АККАУНТ БОТА",
  "bot.main.offline": "ОФЛАЙН",
  "bot.main.botNickname": "НИК БОТА",
  "bot.main.noMicrosoftAccountsAdd":
    "Нет аккаунтов Microsoft. Добавьте отдельный аккаунт в лаунчере.",
  "bot.main.theActivePlayersAccount":
    "Выбран аккаунт активного игрока. Для бота нужен отдельный аккаунт.",
  "bot.main.reconnecting2": "ПОВТОРНОЕ ПОДКЛЮЧЕНИЕ",
  "bot.main.autoReconnect": "АВТОПЕРЕПОДКЛЮЧЕНИЕ",
  "bot.main.comeBackAfterA": "Возвращаться после разрыва соединения",
  "bot.main.autoRespawn": "АВТОВОЗРОЖДЕНИЕ",
  "bot.main.respawnAfterDying": "Возрождаться после смерти",
  "bot.main.retryDelaySec": "ЗАДЕРЖКА ПОВТОРА · СЕК",
  "bot.main.attempts0Unlimited": "ПОПЫТКИ · 0 = БЕЗ ЛИМИТА",
  "bot.main.loginTimeoutSec": "ТАЙМАУТ ВХОДА · СЕК",
  "bot.main.movementProfile": "ПРОФИЛЬ ДВИЖЕНИЯ",
  "bot.main.movementAndRoute": "ДВИЖЕНИЕ И МАРШРУТ",
  "bot.main.followDistance": "ДИСТАНЦИЯ СЛЕДОВАНИЯ",
  "bot.main.arrivalRadius": "РАДИУС ПРИБЫТИЯ",
  "bot.main.maxFallHeight": "МАКСИМАЛЬНАЯ ВЫСОТА ПАДЕНИЯ",
  "bot.main.sprint": "СПРИНТ",
  "bot.main.runOnStraightStretches": "Бежать на прямых участках",
  "bot.main.lowCeilingJumps": "ПРЫЖКИ ПОД НИЗКИМ ПОТОЛКОМ",
  "bot.main.frequentSprintJumpsIn":
    "Частые спринт-прыжки в тоннелях высотой два блока и под листвой · нужен спринт",
  "bot.main.parkour": "ПАРКУР",
  "bot.main.jumpAcrossSmallGaps": "Перепрыгивать небольшие разрывы",
  "bot.main.blockBreaking": "РАЗРУШЕНИЕ БЛОКОВ",
  "bot.main.letsTheBotChange": "Разрешает боту изменять мир",
  "bot.main.airStrafe": "ПОВОРОТ В ПРЫЖКЕ",
  "bot.main.a45TurnFor": "Поворот на 45° для дальнего прыжка",
  "bot.main.swimming": "ПЛАВАНИЕ",
  "bot.main.swimFastAndConserve": "Плыть быстро и сохранять воздух",
  "bot.main.waterDropIntoWater": "WATER DROP В ВОДОЁМ",
  "bot.main.jumpIntoWaterAfter": "Прыгать в воду после проверки траектории",
  "bot.main.waterDropWithA": "WATER DROP С ВЕДРОМ",
  "bot.main.placeWaterBeforeLanding": "Ставить воду перед приземлением и забирать её",
  "bot.main.routeDebugging": "ОТЛАДКА МАРШРУТА",
  "bot.main.writeRouteChangesTo": "Записывать изменения пути в журнал",
  "bot.main.antiKnockback": "АНТИОТБРАСЫВАНИЕ",
  "bot.main.blockPushesAndHits": "БЛОКИРОВАТЬ ТОЛЧКИ И УДАРЫ · ПОСЛЕ ПЕРЕЗАПУСКА БОТА",
  "bot.main.afterJoiningTheServer": "ПОСЛЕ ВХОДА НА СЕРВЕР",
  "bot.main.followTheOwner": "СЛЕДОВАТЬ ЗА ВЛАДЕЛЬЦЕМ",
  "bot.main.startMovingAfterJoining": "Начинать движение после входа",
  "bot.main.joinMessage": "СООБЩЕНИЕ ПРИ ВХОДЕ",
  "bot.main.greetingTextAndPlaceholders": "Текст приветствия и плейсхолдеры",
  "bot.main.messageText": "ТЕКСТ СООБЩЕНИЯ",
  "bot.main.readyOwner": "Готов, %owner%!",
  "bot.main.autoEat": "АВТОЕДА",
  "bot.main.safeFoodFromThe":
    "Безопасная пища из инвентаря · настройки применяются после перезапуска бота",
  "bot.main.eatAtHungerOut": "ЕСТЬ ПРИ ГОЛОДЕ ≤ · ИЗ 20",
  "bot.main.eatAtHunger": "ЕСТЬ ПРИ ГОЛОДЕ",
  "bot.main.eatAtHealthOut": "ЕСТЬ ПРИ ЗДОРОВЬЕ ≤ · ИЗ 20",
  "bot.main.eatAtHealth": "ЕСТЬ ПРИ ЗДОРОВЬЕ",
  "bot.main.foodChoice": "ВЫБОР ЕДЫ",
  "bot.main.moreSaturation": "Больше насыщения",
  "bot.main.moreFoodPoints": "Больше очков голода",
  "bot.main.theBotPausesTo":
    "Бот делает паузу для еды и возвращает прежний предмет. Опасная еда и золотые яблоки сохраняются. При полном голоде обычная еда не используется.",
  "bot.main.autoBuffsAndHealing": "АВТОБАФЫ И ЛЕЧЕБНЫЕ ЗЕЛЬЯ",
  "bot.main.potionsFromTheInventory":
    "Зелья из инвентаря в бою · настройки применяются после перезапуска бота",
  "bot.main.healingPotions": "ЛЕЧЕБНЫЕ ЗЕЛЬЯ",
  "bot.main.instantHealingAndRegeneration": "Мгновенное лечение и регенерация при низком здоровье",
  "bot.main.combatBuffs": "БОЕВЫЕ УСИЛЕНИЯ",
  "bot.main.strengthSpeedAndFire": "Сила, скорость и огнестойкость при безопасной дистанции",
  "bot.main.healAtHealthHp": "ЛЕЧИТЬСЯ ПРИ ЗДОРОВЬЕ ≤ · HP",
  "bot.main.healthForHealingPotion": "ЗДОРОВЬЕ ДЛЯ ЛЕЧЕБНОГО ЗЕЛЬЯ",
  "bot.main.theBotUsesDrinkable":
    "Бот использует питьевые и взрывные зелья, учитывает действующие эффекты и возвращает оружие. Взрывные зелья бросаются под ноги вдали от других существ. Туманные зелья сохраняются. Адаптивный бой помогает отойти для лечения.",
  "bot.main.emergencyMlg": "АВАРИЙНЫЙ MLG",
  "bot.main.aWaterBucketSave": "Спасение ведром воды при случайном падении или отбрасывании",
  "bot.main.minFallBlocks": "МИНИМАЛЬНОЕ ПАДЕНИЕ · БЛОКИ",
  "bot.main.minFallForMlg": "МИНИМАЛЬНОЕ ПАДЕНИЕ ДЛЯ MLG",
  "bot.main.pickUpWaterAfter": "ЗАБИРАТЬ ВОДУ ПОСЛЕ MLG",
  "bot.main.onlyYourOwnSource": "Только свой источник и только после приземления",
  "bot.main.aWaterBucketIs":
    "Нужно ведро воды в инвентаре. Бот рассчитывает траекторию с учётом скорости и препятствий. В Нижнем мире вода не ставится. Плановые Water Drop настраиваются во вкладке «Поведение».",
  "bot.main.commandAccess": "ДОСТУП К КОМАНДАМ",
  "bot.main.commandPrefix": "ПРЕФИКС КОМАНД",
  "bot.main.pauseBetweenCommandsMs": "ПЕРЕРЫВ МЕЖДУ КОМАНДАМИ · МС",
  "bot.main.publicChat": "Общий чат",
  "bot.main.whispers": "Личные сообщения",
  "bot.main.bothChannels": "Оба канала",
  "bot.main.extraOwnersCommaSeparated":
    "ДОПОЛНИТЕЛЬНЫЕ ВЛАДЕЛЬЦЫ · ЧЕРЕЗ ЗАПЯТУЮ ИЛИ С НОВОЙ СТРОКИ",
  "bot.main.chatReplies": "ОТВЕТЫ В ЧАТ",
  "bot.main.confirmCommandsInGame": "Подтверждать команды в игре",
  "bot.main.sayCommand": "КОМАНДА SAY",
  "bot.main.theOwnerCanType": "Владелец может писать от имени бота",
  "bot.main.quitCommand": "КОМАНДА QUIT",
  "bot.main.theOwnerCanDisconnect": "Владелец может отключить бота",
  "bot.main.commandReference": "СПРАВОЧНИК КОМАНД",
  "bot.main.botConnection": "Подключение бота",
  "bot.main.refreshStatus": "Обновить статус",
  "bot.main.state": "СОСТОЯНИЕ",
  "bot.main.owner": "ВЛАДЕЛЕЦ",
  "bot.main.bot": "БОТ",
  "bot.main.botChatAndCommands": "ЧАТ И КОМАНДЫ БОТА",
  "bot.main.forestChopTreesDeliver":
    "forest — рубить лес, deliver — принести добычу, craft — крафтить, smelt — переплавлять, station — работать со станками. Эти команды работают и без префикса. Остальной текст идёт в игровой чат.",
  "bot.main.messageAsTheBot": "Сообщение от имени бота",
  "bot.main.typeAMessage": "Введите сообщение…",
  "bot.main.connectTheBotTo": "Подключите бота к серверу",
  "bot.main.sending": "Отправка…",
  "bot.main.send": "Отправить",
  "bot.main.eventLog": "ЖУРНАЛ СОБЫТИЙ",
  "bot.main.eventLog2": "Журнал событий",
  "bot.main.couldNotOpenThe": "Не удалось открыть окно управления ботом.",
  "bot.main.screenlauncherBotControl": "ScreenLauncher — Управление ботом",
  "bot.main.couldNotSaveSettings": "Не удалось сохранить настройки",
  "bot.main.botControl": "Управление ботом",
  "bot.main.loadingSettings": "Загружаем настройки…",
  "bot.main.couldNotLoadThe": "Не удалось загрузить настройки бота.",
  "bot.main.closeWindow": "Закрыть окно",

  // bot.production
  "bot.production.commandAcceptedTheResult":
    "Команда принята. Результат и текущий этап появятся ниже.",
  "bot.production.blocksAroundTheBot": "БЛОКИ ВОКРУГ БОТА",
  "bot.production.findsWorkstationsAndContainers":
    "Находит рабочие блоки и контейнеры в загруженной области вокруг бота. Выберите найденный блок, чтобы бот подошёл и открыл его.",
  "bot.production.scanRadiusBlocks": "РАДИУС СКАНИРОВАНИЯ · БЛОКОВ",
  "bot.production.scanWorkstations": "Сканировать рабочие блоки",
  "bot.production.workstationsFound": "Найденные рабочие блоки",
  "bot.production.walkOverAndOpen": "ПОДОЙТИ И ОТКРЫТЬ",
  "bot.production.noWorkstationsFoundWithin":
    "В этом радиусе рабочих блоков не найдено. Подойдите к базе или увеличьте радиус.",
  "bot.production.automaticCrafting": "АВТОМАТИЧЕСКИЙ КРАФТ",
  "bot.production.theBotCraftsIntermediate":
    "Бот изготовит промежуточные ингредиенты из ресурсов в инвентаре. Найдёт верстак в радиусе 32 блоков или изготовит и поставит его рядом.",
  "bot.production.item": "ПРЕДМЕТ",
  "bot.production.howManyToCraft": "СКОЛЬКО ИЗГОТОВИТЬ",
  "bot.production.craftingSpot": "МЕСТО КРАФТА",
  "bot.production.automatic": "Автоматически",
  "bot.production.inventory22": "Инвентарь · 2×2",
  "bot.production.craftingTable33": "Верстак · 3×3",
  "bot.production.theCountIsIn":
    "Количество указано в предметах. Если рецепт выдаёт несколько штук, бот округлит до целой партии. Недостающие исходные ресурсы нужно добыть заранее.",
  "bot.production.checkRecipe": "Проверить рецепт",
  "bot.production.craft": "Изготовить",
  "bot.production.smeltingAndCooking": "ПЕРЕПЛАВКА И ГОТОВКА",
  "bot.production.theBotLoadsAn":
    "Бот загрузит пустую печь, подберёт топливо, дождётся результата и заберёт его. Коптильня подходит для еды, плавильная печь — для руд и металла.",
  "bot.production.rawMaterial": "СЫРЬЁ",
  "bot.production.rawMaterialCount": "КОЛИЧЕСТВО СЫРЬЯ",
  "bot.production.fuelEmptyAuto": "ТОПЛИВО · ПУСТО = АВТОВЫБОР",
  "bot.production.furnace": "ПЕЧЬ",
  "bot.production.regularFurnace": "Обычная печь",
  "bot.production.blastFurnace": "Плавильная печь",
  "bot.production.smoker": "Коптильня",
  "bot.production.startSmelting": "Начать переплавку",
  "bot.production.workstations": "РАБОЧИЕ БЛОКИ",
  "bot.production.pickABlockThe":
    "Выберите блок: бот подойдёт и откроет его. Затем положите материалы в нужные слоты, выберите действие и заберите результат.",
  "bot.production.blockNearTheBot": "БЛОК РЯДОМ С БОТОМ",
  "bot.production.walkOverAndOpen2": "Подойти и открыть",
  "bot.production.slotNumberingStartsAt":
    "Нумерация слотов начинается с 0. Предметы переносятся между блоком и инвентарём бота.",
  "bot.production.open": "Открыт",
  "bot.production.workstationSlots": "Слоты рабочего блока",
  "bot.production.slot": "СЛОТ",
  "bot.production.slotNumber": "НОМЕР СЛОТА",
  "bot.production.itemToLoad": "ПРЕДМЕТ ДЛЯ ЗАГРУЗКИ",
  "bot.production.countToLoad": "КОЛИЧЕСТВО ДЛЯ ЗАГРУЗКИ",
  "bot.production.putIntoSlot": "Положить в слот",
  "bot.production.takeFromSlot": "Забрать из слота",
  "bot.production.enchantmentOption02": "ВАРИАНТ ЗАЧАРОВАНИЯ · 0–2",
  "bot.production.optionNumberFrom0": "НОМЕР ВАРИАНТА · ОТ 0",
  "bot.production.requiredLevels": "Нужные уровни",
  "bot.production.enchant": "Зачаровать",
  "bot.production.chooseOption": "Выбрать вариант",
  "bot.production.newItemName": "НОВОЕ ИМЯ ПРЕДМЕТА",
  "bot.production.setName": "Задать имя",
  "bot.production.currentWork": "ТЕКУЩАЯ РАБОТА",
  "bot.production.readyToWork": "Готов к работе",
  "bot.production.connectTheBotTo": "Подключите бота к серверу",
  "bot.production.stopAndCloseThe": "Остановить и закрыть блок",
  "bot.production.whenSmeltingOrBrewing":
    "При остановке переплавки или варки материалы остаются в блоке. Откройте его, чтобы забрать содержимое.",
  "bot.production.scanResult": "Найдено: {found} · радиус {radius}",

  // bot.storageGroups
  "bot.storageGroups.sharedStorage": "Общий склад",
  "bot.storageGroups.newGroup": "Новая группа",
  "bot.storageGroups.thisChestIsAlready": "Этот сундук уже добавлен в группу.",
  "bot.storageGroups.aGroupCanHold": "В группу можно добавить до 32 сундуков",
  "bot.storageGroups.chestAddedTo": "Сундук {chest} добавлен в «{group}».",
  "bot.storageGroups.couldNotGetThe": "Не удалось получить выбранный сундук. Повторите выбор.",
  "bot.storageGroups.groupsAppliedToThe":
    "Группы применены к боту. Он будет раскладывать добычу по выбранным ресурсам.",
  "bot.storageGroups.theBotIsChecking":
    "Бот проверяет содержимое сундуков. Найденные назначения сохранятся автоматически.",
  "bot.storageGroups.chestsAndSorting": "СУНДУКИ И СОРТИРОВКА",
  "bot.storageGroups.lootStorage": "СКЛАД ДОБЫЧИ",
  "bot.storageGroups.groups": "Групп",
  "bot.storageGroups.addGroup": "ДОБАВИТЬ ГРУППУ",
  "bot.storageGroups.autoScanChests": "АВТОСКАНИРОВАНИЕ СУНДУКОВ",
  "bot.storageGroups.theBotFindsChests":
    "Бот найдёт сундуки, бочки и шалкеры, подойдёт к ним и определит назначение по содержимому. Из пустых выделит больше места под массовые блоки и мусор, отдельный склад — под ценности. Настроенные группы сохраняются.",
  "bot.storageGroups.radiusAroundTheBot": "РАДИУС ВОКРУГ БОТА · БЛОКОВ",
  "bot.storageGroups.chestScanRadius": "Радиус сканирования сундуков",
  "bot.storageGroups.scanning": "СКАНИРУЮ…",
  "bot.storageGroups.scanAndAssign": "СКАНИРОВАТЬ И РАСПРЕДЕЛИТЬ",
  "bot.storageGroups.aDoubleChestCounts":
    "Двойной сундук считается одним хранилищем. За проход проверяется до 64 контейнеров. Назначение определяет дальнейшую выгрузку добычи; содержимое сундуков остаётся на месте.",
  "bot.storageGroups.checked": "Проверено",
  "bot.storageGroups.scanCompleteFoundAdded":
    "Сканирование завершено: найдено {total}, добавлено {added}.",
  "bot.storageGroups.scanStoppedGroupsWere": "Сканирование остановлено. Группы сохранены.",
  "bot.storageGroups.theScanDidNot": "Сканирование не завершилось; проверьте журнал бота.",
  "bot.storageGroups.stopScan": "ОСТАНОВИТЬ СКАНИРОВАНИЕ",
  "bot.storageGroups.chestsFound": "Найденные сундуки",
  "bot.storageGroups.alreadyConfigured": "уже настроен",
  "bot.storageGroups.doubleChest": "Двойной сундук",
  "bot.storageGroups.barrel": "Бочка",
  "bot.storageGroups.container": "Контейнер",
  "bot.storageGroups.freeSlots": "Свободно слотов",
  "bot.storageGroups.aSeparateStorageFor": "Для каждого ресурса — свой склад",
  "bot.storageGroups.createAGroupChoose":
    "Создайте группу, выберите, что в неё складывать, и добавьте один или несколько сундуков.",
  "bot.storageGroups.wood3Chests": "Древесина → 3 сундука",
  "bot.storageGroups.diamonds1Chest": "Алмазы → 1 сундук",
  "bot.storageGroups.stone2Chests": "Камень → 2 сундука",
  "bot.storageGroups.addSelectedChest": "ДОБАВИТЬ ВЫБРАННЫЙ СУНДУК",
  "bot.storageGroups.chooseResources": "Выберите ресурсы",
  "bot.storageGroups.noChests": "Нет сундуков",
  "bot.storageGroups.disableGroup": "Выключить группу",
  "bot.storageGroups.enableGroup": "Включить группу",
  "bot.storageGroups.groupName": "НАЗВАНИЕ ГРУППЫ",
  "bot.storageGroups.forExampleWoodAt": "Например, древесина на базе",
  "bot.storageGroups.resourceGroups": "Группы ресурсов",
  "bot.storageGroups.whatToStore": "ЧТО СКЛАДЫВАТЬ",
  "bot.storageGroups.storageCategories": "Категории склада",
  "bot.storageGroups.resourcesByMaterial": "Ресурсы по материалу",
  "bot.storageGroups.itemsAndBlocks": "Предметы и блоки",
  "bot.storageGroups.anItemABlock": "Предмет, блок или несколько ресурсов",
  "bot.storageGroups.removeResource": "Убрать ресурс",
  "bot.storageGroups.chestsInGroup": "СУНДУКИ В ГРУППЕ",
  "bot.storageGroups.filledInOrder": "Заполняются по порядку",
  "bot.storageGroups.unloaded": "Выгружено",
  "bot.storageGroups.full": "Заполнен",
  "bot.storageGroups.unavailable": "Недоступен",
  "bot.storageGroups.moveChestUp": "Поднять сундук",
  "bot.storageGroups.moveChestDown": "Опустить сундук",
  "bot.storageGroups.removeChest": "Удалить сундук",
  "bot.storageGroups.addTheChestYou": "Добавьте сундук под прицелом или введите координаты ниже.",
  "bot.storageGroups.selecting": "ВЫБИРАЮ…",
  "bot.storageGroups.aimedAt": "⊕ ПОД ПРИЦЕЛОМ",
  "bot.storageGroups.chestCoordinatesFor": "Координаты сундука для",
  "bot.storageGroups.addAChestBy": "Добавить сундук по координатам",
  "bot.storageGroups.groupPriority": "Приоритет группы",
  "bot.storageGroups.moveGroupUp": "Поднять группу",
  "bot.storageGroups.moveGroupDown": "Опустить группу",
  "bot.storageGroups.deleteGroup": "УДАЛИТЬ ГРУППУ",
  "bot.storageGroups.groupsAreSavedIn":
    "Группы сохраняются в лаунчере. Конкретные ресурсы проверяются сверху вниз; «Всё остальное» используется для оставшейся добычи. Если сундук заполнен или недоступен, бот пробует следующий в той же группе. Инструменты и еду оставляет у себя.",
  "bot.storageGroups.applying": "ПРИМЕНЯЮ…",
  "bot.storageGroups.applyToBot": "ПРИМЕНИТЬ К БОТУ",
  "bot.storageGroups.unloadLoot": "ВЫГРУЗИТЬ ДОБЫЧУ",
  "bot.storageGroups.groupsAreAppliedAutomatically":
    "Перед началом и продолжением работы, а также выгрузкой группы применяются автоматически. Для выбора под прицелом наведитесь на контейнер в пределах 6 блоков; бот должен видеть вас. Подходят сундуки, бочки и шалкеровые ящики.",
  "bot.storageGroups.group": "Группа",
  "bot.storageGroups.chests": {
    one: "{count} сундук",
    few: "{count} сундука",
    many: "{count} сундуков",
  },

  // bot.workflow
  "bot.workflow.chooseAnItem": "Выберите предмет",
  "bot.workflow.bedsNextToWater": "Грядки рядом с водой",
  "bot.workflow.upToActions": {
    one: "до {count} действия",
    few: "до {count} действий",
    many: "до {count} действий",
  },
  "bot.workflow.allAvailable": "все доступные",
  "bot.workflow.noReplanting": "без пересадки",
  "bot.workflow.withReplanting": "с пересадкой",
  "bot.workflow.withinBlocks": "В радиусе {radius} блоков",
  "bot.workflow.toWhereTheWorkflow": "К месту запуска сценария",
  "bot.workflow.intoTheConfiguredStorage": "В сундуки настроенного склада",
  "bot.workflow.craftingTable": "верстак",
  "bot.workflow.inventory": "инвентарь",
  "bot.workflow.blastFurnace": "плавильная печь",
  "bot.workflow.smoker": "коптильня",
  "bot.workflow.automatic": "автоматически",
  "bot.workflow.addAnAction": "Добавить действие",
  "bot.workflow.addAnAction2": "ДОБАВИТЬ ДЕЙСТВИЕ",
  "bot.workflow.chestsAndLootSorting": "Сундуки и сортировка добычи",
  "bot.workflow.setUpStorage": "Настроить склад",
  "bot.workflow.add": "Добавить",
  "bot.workflow.actionSequence": "Последовательность действий",
  "bot.workflow.workflowName": "НАЗВАНИЕ СЦЕНАРИЯ",
  "bot.workflow.workflowName2": "Название сценария",
  "bot.workflow.generateAnAutomaticName": "Подобрать автоматическое название",
  "bot.workflow.actionOrder": "ПОРЯДОК ДЕЙСТВИЙ",
  "bot.workflow.clear": "Очистить",
  "bot.workflow.resume": "Продолжить",
  "bot.workflow.pauseAfterStep": "Пауза после шага",
  "bot.workflow.stop": "Остановить",
  "bot.workflow.starting": "Запускаю…",
  "bot.workflow.runWorkflow": "Запустить сценарий",
  "bot.workflow.workflowCompleted": "Сценарий выполнен",
  "bot.workflow.paused": "На паузе",
  "bot.workflow.finishingTheStepBefore": "Завершаю шаг перед паузой",
  "bot.workflow.workflowStopped": "Сценарий остановлен",
  "bot.workflow.yourHelpIsNeeded": "Нужна ваша помощь",
  "bot.workflow.runningTheWorkflow": "Выполняю сценарий",
  "bot.workflow.completedSteps": "Завершённые шаги",
  "bot.workflow.thisWorkflowHasNo": "В сценарии пока нет действий.",
  "bot.workflow.addAnActionAbove": "Добавьте действие сверху. Его параметры откроются здесь.",
  "bot.workflow.holdAndDragThe": "Зажмите и перетащите шаг",
  "bot.workflow.moveStepUp": "Поднять шаг",
  "bot.workflow.up": "Выше",
  "bot.workflow.moveStepDown": "Опустить шаг",
  "bot.workflow.down": "Ниже",
  "bot.workflow.duplicateStep": "Дублировать шаг",
  "bot.workflow.duplicate": "Дублировать",
  "bot.workflow.deleteStep": "Удалить шаг",
  "bot.workflow.delete": "Удалить",
  "bot.workflow.whatToMine": "ЧТО ДОБЫТЬ",
  "bot.workflow.rawMaterial": "СЫРЬЁ",
  "bot.workflow.craftResult": "РЕЗУЛЬТАТ КРАФТА",
  "bot.workflow.blockCount": "КОЛИЧЕСТВО БЛОКОВ",
  "bot.workflow.actions0All": "ДЕЙСТВИЯ · 0 = ВСЕ",
  "bot.workflow.logCount": "КОЛИЧЕСТВО БРЁВЕН",
  "bot.workflow.itemCount": "КОЛИЧЕСТВО ПРЕДМЕТОВ",
  "bot.workflow.radiusBlocks": "РАДИУС · БЛОКОВ",
  "bot.workflow.replantAfterHarvest": "ПЕРЕСАЖИВАТЬ ПОСЛЕ СБОРА",
  "bot.workflow.craftingSpot": "МЕСТО КРАФТА",
  "bot.workflow.furnaceType": "ТИП ПЕЧИ",
  "bot.workflow.craftingSpot2": "Место крафта",
  "bot.workflow.furnaceType2": "Тип печи",
  "bot.workflow.inventory2": "Инвентарь",
  "bot.workflow.craftingTable2": "Верстак",
  "bot.workflow.furnace": "Печь",
  "bot.workflow.blastFurnace2": "Плавильная",
  "bot.workflow.smoker2": "Коптильня",
  "bot.workflow.theBotCraftsIntermediate":
    "Промежуточные ингредиенты, включая доски, бот скрафтит сам. В режиме «Авто» найдёт верстак в 32 блоках или сделает и поставит его.",
  "bot.workflow.aFurnaceMustBe":
    "Печь должна быть рядом, а сырьё и топливо — в инвентаре. Бот сам подберёт топливо и заберёт результат.",
  "bot.workflow.theBotReturnsTo":
    "Бот вернётся к месту запуска сценария. Запускайте сценарий рядом с печью и местом для крафта.",
  "bot.workflow.usesTheChestGroups": "Используются группы сундуков из настроек склада.",
  "bot.workflow.theCountIsIn":
    "Количество считается в блоках. Для железа нужна каменная кирка или лучше.",
  "bot.workflow.theActionStartsAfter": "Действие начнётся после завершения предыдущего шага.",
  "bot.workflow.connectTheBotTo": "Подключите бота, чтобы запустить сценарий.",
  "bot.workflow.connection": "Подключение ↗",
  "bot.workflow.pauseTakesEffectAfter":
    "Пауза сработает после текущего шага. Остановка прервёт работу сразу.",
  "bot.workflow.theBotIsBusy": "Бот занят. Завершите текущую работу перед запуском.",
  "bot.workflow.ifAnErrorOccurs": "При ошибке выполнение остановится на проблемном шаге.",
  "bot.workflow.whatTheIronTools": "Что нужно для пресета «Железные инструменты»",
  "bot.workflow.ironToolsNeedA":
    "Для заготовки железных инструментов нужны каменная кирка, доступные руды, деревья и пустая печь рядом с местом запуска. После добычи бот вернётся к старту. Доски и верстак изготовит из дерева.",
  "bot.workflow.mineDetail": "{item} · блоков: {count} · радиус {radius}",
  "bot.workflow.forestDetail": "Брёвна: {count} · радиус {radius}",
  "bot.workflow.stepLabel": "{label}, шаг {index}",
  "bot.workflow.radiusValue": "радиус {radius}",

  // bot.workflowHistory
  "bot.workflowHistory.completed": "Выполнен",
  "bot.workflowHistory.stopped": "Остановлен",
  "bot.workflowHistory.interrupted": "Прерван",
  "bot.workflowHistory.workflowHistory": "История сценариев",
  "bot.workflowHistory.completedWorkflows": "ЗАВЕРШЁННЫЕ СЦЕНАРИИ",
  "bot.workflowHistory.showWorkflows": "Показать сценарии",
  "bot.workflowHistory.completed2": "Выполненные",
  "bot.workflowHistory.allRuns": "Все запуски",
  "bot.workflowHistory.completedWorkflowsWillAppear":
    "Выполненные сценарии появятся здесь — с шагами и временем работы.",
  "bot.workflowHistory.workflowRunResultsAre": "Здесь сохраняются результаты запусков сценариев.",
  "bot.workflowHistory.error": "Ошибка",
  "bot.workflowHistory.notRun": "Не выполнен",
  "bot.workflowHistory.loadTheStepsInto": "Загрузить шаги в редактор сценария",
  "bot.workflowHistory.repeatWorkflow": "Повторить сценарий",
  "bot.workflowHistory.progress": {
    one: "{completed} / {count} шаг",
    few: "{completed} / {count} шага",
    many: "{completed} / {count} шагов",
  },

  // bot.workflowPresets
  "bot.workflowPresets.workflowPresets": "Пресеты сценария",
  "bot.workflowPresets.readyMadeWorkflows": "ГОТОВЫЕ СЦЕНАРИИ",
  "bot.workflowPresets.collapse": "Свернуть",
  "bot.workflowPresets.chooseAPreset": "Выбрать пресет",
  "bot.workflowPresets.presetCategory": "Категория пресетов",
  "bot.workflowPresets.requires": "Нужно:",
  "bot.workflowPresets.addPreset": "Добавить пресет",
  "bot.workflowPresets.aPlanCanHave": "В плане может быть не больше {WORKFLOW_STEP_LIMIT} шагов",
  "bot.workflowPresets.addStepsToThe": "Добавить {stepsCount} шагов в конец плана",
  "bot.workflowPresets.notEnoughRoomIn": "Не хватает места в плане",
  "bot.workflowPresets.addToPlan": "+ Добавить в план",
  "bot.workflowPresets.stepCount": {
    one: "{count} шаг",
    few: "{count} шага",
    many: "{count} шагов",
  },

  // buildActivityCalendar
  "buildActivityCalendar.calendarPeriod": "Период календаря",
  "buildActivityCalendar.3Months": "3 месяца",
  "buildActivityCalendar.year": "Год",
  "buildActivityCalendar.previousPeriod": "Предыдущий период",
  "buildActivityCalendar.nextPeriod": "Следующий период",
  "buildActivityCalendar.today": "Сегодня",
  "buildActivityCalendar.noActivity": "нет записей",
  "buildActivityCalendar.buildCreated": ", сборка создана",
  "buildActivityCalendar.today2": ", сегодня",
  "buildActivityCalendar.created": "Создана",
  "buildActivityCalendar.created2": " · создана",
  "buildActivityCalendar.lastLaunch": " · последний запуск",
  "buildActivityCalendar.noActivity2": "Нет записей",
  "buildActivityCalendar.total": "ВСЕГО",
  "buildActivityCalendar.last30Days": "ЗА 30 ДНЕЙ",
  "buildActivityCalendar.activeDays": "АКТИВНЫХ ДНЕЙ",
  "buildActivityCalendar.lastLaunch2": "ПОСЛЕДНИЙ ЗАПУСК",
  "buildActivityCalendar.sessions": {
    one: "{count} сеанс",
    few: "{count} сеанса",
    many: "{count} сеансов",
  },

  // buildCardPin
  "buildCardPin.pinnedBuild": "Закреплённая сборка",

  // buildConfigurationGrid
  "buildConfigurationGrid.selectBuild": "ВЫБОР СБОРКИ",
  "buildConfigurationGrid.mcVersion": "ВЕРСИЯ MC",
  "buildConfigurationGrid.selectVersion": "Выберите ВЕРСИЮ",
  "buildConfigurationGrid.loader": "ЗАГРУЗЧИК",
  "buildConfigurationGrid.selectLoader": "Выберите ЗАГРУЗЧИК",
  "buildConfigurationGrid.source": "ИСТОЧНИК",
  "buildConfigurationGrid.timeInBuild": "ВРЕМЯ В СБОРКЕ",
  "buildConfigurationGrid.0HrsOnRecord": "0 ч. в игре",

  // buildConstellation
  "buildConstellation.linesConnectStarsBy": "Линии связывают звёзды одного автора",
  "buildConstellation.mod": "МОД",
  "buildConstellation.shader": "ШЕЙДЕР",
  "buildConstellation.pack": "РЕС. ПАК",
  "buildConstellation.search": "Поиск",
  "buildConstellation.searchByNameOr": "Поиск по названию или автору",
  "buildConstellation.labels": "Подписи",
  "buildConstellation.resume": "Продолжить",
  "buildConstellation.pause": "Пауза",
  "buildConstellation.gatherStars": "Собрать звёзды",
  "buildConstellation.noMatches": "Нет совпадений",
  "buildConstellation.interactiveConstellationOfInstalled":
    "Интерактивное созвездие установленного контента. Поиск и кнопки над картой позволяют выделять звёзды.",
  "buildConstellation.catchMe": "ПОЙМАЙ МЕНЯ",
  "buildConstellation.drop": "Отпустите",

  // buildEnvironmentVariables
  "buildEnvironmentVariables.environment": "ОКРУЖЕНИЕ",
  "buildEnvironmentVariables.add": "ДОБАВИТЬ",
  "buildEnvironmentVariables.variablesArePassedTo":
    "Переменные передаются игре при запуске. Значения вводятся как есть, без кавычек и подстановок.",
  "buildEnvironmentVariables.theSystemEnvironmentIs":
    "Используется окружение системы. Добавьте переменную, чтобы переопределить её для этой сборки.",
  "buildEnvironmentVariables.name": "ИМЯ",
  "buildEnvironmentVariables.environmentVariable": "Имя переменной окружения",
  "buildEnvironmentVariables.removeEnvironmentVariable": "Удалить переменную окружения",
  "buildEnvironmentVariables.value": "ЗНАЧЕНИЕ",
  "buildEnvironmentVariables.valueCanBeEmpty": "Значение (можно оставить пустым)",
  "buildEnvironmentVariables.environmentVariable2": "Значение переменной окружения",
  "buildEnvironmentVariables.nameLabel": "{label} {index}",
  "buildEnvironmentVariables.valueLabel": "{label} {index}",

  // buildLogs
  "buildLogs.noCrashReportWas": "Отчёт о сбое для этого запуска не найден.",
  "buildLogs.noLaunchLogHas": "Журнал запуска ещё не создан.",
  "buildLogs.jvmLog": "ЖУРНАЛ JVM",
  "buildLogs.notCreatedYet": "ЕЩЁ НЕ СОЗДАН",
  "buildLogs.crashReport": "ОТЧЁТ О СБОЕ",
  "buildLogs.exit": "ВЫХОД",
  "buildLogs.unknown": "НЕИЗВЕСТНО",
  "buildLogs.runtime": "ВРЕМЯ РАБОТЫ",
  "buildLogs.crashLog": "ЖУРНАЛ СБОЯ",
  "buildLogs.buildLogs": "ЖУРНАЛ СБОРКИ",
  "buildLogs.minimize": "Свернуть",
  "buildLogs.maximize": "Развернуть",
  "buildLogs.likelyCause": "ВОЗМОЖНАЯ ПРИЧИНА",
  "buildLogs.jvmOutput": "ВЫВОД JVM",
  "buildLogs.copy": "Скопировать",
  "buildLogs.crashReport2": "отчёт о сбое",
  "buildLogs.jvmOutput2": "вывод JVM",
  "buildLogs.copied": "СКОПИРОВАНО",
  "buildLogs.copy2": "КОПИРОВАТЬ",
  "buildLogs.loadingLogs": "ЗАГРУЗКА ЖУРНАЛА…",
  "buildLogs.openFolder": "ОТКРЫТЬ ПАПКУ",
  "buildLogs.loadingLogs2": "ЗАГРУЗКА ЛОГОВ…",

  // buildMods
  "buildMods.saveTheBuildTo": "Сохраните сборку, чтобы управлять её модами.",
  "buildMods.vanillaBuildsDontUse": "Ванильные сборки не используют моды.",
  "buildMods.readingInstalledMods": "Читаю установленные моды.",
  "buildMods.thisBuildHasNo": "В этой сборке пока нет установленных модов.",
  "buildMods.disableMod": "Отключить мод",
  "buildMods.enableMod": "Включить мод",
  "buildMods.noBuildYet": "СБОРКИ ПОКА НЕТ",
  "buildMods.vanilla": "VANILLA",
  "buildMods.loading": "ЗАГРУЗКА",
  "buildMods.error": "ОШИБКА",
  "buildMods.empty": "ПУСТО",
  "buildMods.installed": "УСТАНОВЛЕНЫ",

  // buildPlaceholders
  "buildPlaceholders.restingTilt": "Наклон листа в покое",
  "buildPlaceholders.slightTiltOfThe": "Лёгкий наклон листа в покое",
  "buildPlaceholders.tilt": "Наклон",
  "buildPlaceholders.dragAnimation": "Анимация при перетаскивании",
  "buildPlaceholders.sheetSwayAndPin": "Качание листа и подъём пина при перетаскивании",
  "buildPlaceholders.animation": "Анимация",
  "buildPlaceholders.minimizeWindow": "Свернуть окно",
  "buildPlaceholders.closeWindow": "Закрыть окно",
  "buildPlaceholders.screenlauncherCheatSheet": "SCREENLAUNCHER · ПАМЯТКА",
  "buildPlaceholders.placeholders": "Плейсхолдеры",
  "buildPlaceholders.theyInsertDataInto":
    "Подставляют данные в текст. Нажмите на код, чтобы скопировать.",
  "buildPlaceholders.findAPlaceholder": "Найти плейсхолдер",
  "buildPlaceholders.searchByNameOr": "Найти по названию или смыслу…",
  "buildPlaceholders.placeholderGroups": "Группы плейсхолдеров",
  "buildPlaceholders.all": "Все",
  "buildPlaceholders.thesePlaceholdersOnlyWork":
    "Эти плейсхолдеры работают только в сообщении Mineflayer-бота при входе.",
  "buildPlaceholders.copyFailedYouCan":
    "Не удалось скопировать. Можно выделить код и скопировать вручную.",
  "buildPlaceholders.copy": "Скопировать {token}",
  "buildPlaceholders.copied": "Скопировано",
  "buildPlaceholders.copy2": "Скопировать",
  "buildPlaceholders.nothingFoundTryAnother": "Ничего не найдено. Попробуйте другое слово.",
  "buildPlaceholders.openFailed": "Не удалось открыть окно плейсхолдеров.",
  "buildPlaceholders.windowTitle": "ScreenLauncher — Плейсхолдеры",
  "buildPlaceholders.caretHint": "Знак {caret} делает буквы заглавными.",

  // buildPlay
  "buildPlay.stopGame": "ОСТАНОВИТЬ",
  "buildPlay.playBuild": "ИГРАТЬ",
  "buildPlay.starting": "ЗАПУСК…",

  // buildRuntimeSettings
  "buildRuntimeSettings.importError": "ОШИБКА ИМПОРТА",
  "buildRuntimeSettings.javaArguments": "АРГУМЕНТЫ JAVA",
  "buildRuntimeSettings.exportArguments": "Экспортировать аргументы",
  "buildRuntimeSettings.importArguments": "Импортировать аргументы",
  "buildRuntimeSettings.search": "ПОИСК",
  "buildRuntimeSettings.noMatch": "НЕТ СОВПАДЕНИЙ",
  "buildRuntimeSettings.previousMatch": "Предыдущее совпадение",
  "buildRuntimeSettings.nextMatch": "Следующее совпадение",
  "buildRuntimeSettings.replace": "ЗАМЕНА",
  "buildRuntimeSettings.newValue": "новое значение",
  "buildRuntimeSettings.replace2": "ЗАМЕНИТЬ",
  "buildRuntimeSettings.all": "ВСЁ",
  "buildRuntimeSettings.logs": "ЖУРНАЛЫ",
  "buildRuntimeSettings.openLogWindow": "ОТКРЫТЬ ЖУРНАЛ",
  "buildRuntimeSettings.memory": "ПАМЯТЬ",
  "buildRuntimeSettings.useTheLauncherManaged": "Использовать Java лаунчера",
  "buildRuntimeSettings.scanning": "ПОИСК...",
  "buildRuntimeSettings.autoScan": "АВТОПОИСК",
  "buildRuntimeSettings.autoManagedRuntimeOr":
    "АВТО (Java лаунчера) — или укажите путь к javaw.exe",
  "buildRuntimeSettings.noJavaFound": "JAVA НЕ НАЙДЕНА",
  "buildRuntimeSettings.testingJava": "ПРОВЕРКА JAVA...",
  "buildRuntimeSettings.testJavaSettings": "ПРОВЕРИТЬ НАСТРОЙКИ JAVA",
  "buildRuntimeSettings.checksTheCurrentRam":
    "Проверяет текущие RAM, аргументы и окружение без запуска Minecraft.",
  "buildRuntimeSettings.javaCheckPassed": "ПРОВЕРКА JAVA ПРОЙДЕНА",
  "buildRuntimeSettings.javaCheckFailed": "ПРОВЕРКА JAVA НЕ ПРОЙДЕНА",
  "buildRuntimeSettings.javaReturnedNoDiagnostic": "Java не вернула диагностический вывод.",
  "buildRuntimeSettings.window": "ОКНО",
  "buildRuntimeSettings.fullscreen": "ПОЛНЫЙ ЭКРАН",
  "buildRuntimeSettings.windowed": "ОКОННЫЙ РЕЖИМ",
  "buildRuntimeSettings.width": "ШИРИНА",
  "buildRuntimeSettings.windowWidth": "Ширина окна",
  "buildRuntimeSettings.height": "ВЫСОТА",
  "buildRuntimeSettings.windowHeight": "Высота окна",

  // buildSafetyModals
  "buildSafetyModals.buildTrash": "Корзина сборок",
  "buildSafetyModals.buildTrash2": "КОРЗИНА СБОРОК",
  "buildSafetyModals.deletedBuilds": "Удалённые сборки",
  "buildSafetyModals.filesRemainOnDisk":
    "Файлы остаются на диске до окончательного удаления. Вместе со сборкой будут удалены её резервные копии миров.",
  "buildSafetyModals.trashIsEmpty": "Корзина пуста.",
  "buildSafetyModals.restore": "ВОССТАНОВИТЬ",
  "buildSafetyModals.confirmDelete": "ПОДТВЕРДИТЬ УДАЛЕНИЕ",
  "buildSafetyModals.deleteForever": "УДАЛИТЬ НАВСЕГДА",

  // buildScreenshots
  "buildScreenshots.screenshots": "СКРИНШОТЫ",
  "buildScreenshots.loadingScreenshots": "ЗАГРУЗКА СКРИНШОТОВ…",
  "buildScreenshots.noScreenshotsYet": "СКРИНШОТОВ ПОКА НЕТ",
  "buildScreenshots.theyWillAppearHere":
    "Они появятся здесь, когда Minecraft сохранит их в этой сборке.",
  "buildScreenshots.loadingImage": "ЗАГРУЗКА ИЗОБРАЖЕНИЯ…",
  "buildScreenshots.screenshot": "Скриншот",
  "buildScreenshots.selectScreenshot": "Выберите СКРИНШОТ",
  "buildScreenshots.openFolder": "ОТКРЫТЬ ПАПКУ",
  "buildScreenshots.unknownDate": "ДАТА НЕИЗВЕСТНА",

  // buildStats
  "buildStats.gbMemory": "ГБ памяти",
  "buildStats.disabled": "Отключён",
  "buildStats.gameSession": "Игровой сеанс",
  "buildStats.lastLaunch": "Последний запуск",
  "buildStats.inGame": "В игре",
  "buildStats.closeStatistics": "Закрыть статистику",
  "buildStats.stats": "СТАТИСТИКА",
  "buildStats.statisticsSection": "Раздел статистики",
  "buildStats.verticalTimeline": "Вертикальная хронология",
  "buildStats.vertical": "Вертикально",
  "buildStats.horizontalTimeline": "Горизонтальная хронология",
  "buildStats.horizontal": "Горизонтально",
  "buildStats.someDataCouldNot": "Часть данных не удалось загрузить.",
  "buildStats.eventFilter": "Фильтр событий",
  "buildStats.newestFirst": "Сначала новые",
  "buildStats.oldestFirst": "Сначала старые",
  "buildStats.noEvents": "Нет событий",
  "buildStats.horizontallyScrollingEventTimeline": "Лента событий, прокручивается горизонтально",
  "buildStats.events": { one: "{count} событие", few: "{count} события", many: "{count} событий" },

  // catalogProjectCard
  "catalogProjectCard.download": "Загрузка",
  "catalogProjectCard.resolvingDependencies": "Проверка зависимостей…",
  "catalogProjectCard.openDetails": "Открыть сведения о {title}",
  "catalogProjectCard.downloaded": "ЗАГРУЖЕНО",
  "catalogProjectCard.removing": "УДАЛЕНИЕ…",
  "catalogProjectCard.update": "ОБНОВИТЬ",
  "catalogProjectCard.installing": "УСТАНОВКА…",
  "catalogProjectCard.by": "АВТОР",
  "catalogProjectCard.downloads": {
    one: "{count} ЗАГРУЗКА",
    few: "{count} ЗАГРУЗКИ",
    many: "{count} ЗАГРУЗОК",
  },
  "catalogProjectCard.followers": {
    one: "{count} ПОДПИСЧИК",
    few: "{count} ПОДПИСЧИКА",
    many: "{count} ПОДПИСЧИКОВ",
  },

  // common
  "common.close": "ЗАКРЫТЬ",
  "common.loading": "Загрузка…",
  "common.remove": "УДАЛИТЬ",
  "common.close2": "Закрыть",
  "common.refresh": "ОБНОВИТЬ",
  "common.javaPath": "ПУТЬ К JAVA",
  "common.retry": "Повторить",
  "common.auto": "Авто",
  "common.paused": "ПАУЗА",
  "common.downloading": "ЗАГРУЗКА",
  "common.resume": "ПРОДОЛЖИТЬ",
  "common.pause": "ПАУЗА",
  "common.cancel": "ОТМЕНА",
  "common.install": "УСТАНОВИТЬ",
  "common.working": "РАБОТА…",
  "common.noEventsYet": "Пока нет событий",
  "common.empty": "Пусто",
  "common.buildCaps": "СБОРКА",
  "common.deleteCaps": "УДАЛИТЬ",
  "common.onCaps": "ВКЛ",
  "common.offCaps": "ВЫКЛ",
  "common.modsCaps": "МОДЫ",
  "common.on": "Вкл",
  "common.off": "Выкл",
  "common.enable": "Включить",

  // discordRpc
  "discordRpc.connectToDiscord": "ПОДКЛЮЧЕНИЕ К DISCORD",
  "discordRpc.discordApplicationAndDisplay": "Приложение Discord и режим отображения",
  "discordRpc.discordApplicationId": "ID приложения Discord",
  "discordRpc.whatToShowIn": "ЧТО ПОКАЗЫВАТЬ В ПРОФИЛЕ",
  "discordRpc.displayMode": "Режим отображения",
  "discordRpc.statusText": "ТЕКСТ СТАТУСА",
  "discordRpc.activityNameAndTwo": "Название активности и две строки в профиле",
  "discordRpc.activityName": "НАЗВАНИЕ АКТИВНОСТИ",
  "discordRpc.mainLine": "ОСНОВНАЯ СТРОКА",
  "discordRpc.secondLine": "ДОПОЛНИТЕЛЬНАЯ СТРОКА",
  "discordRpc.statusTemplatePreview": "Предпросмотр шаблона статуса",
  "discordRpc.templatePreview": "ПРЕДПРОСМОТР ШАБЛОНА",
  "discordRpc.000InGame": "0:00 в игре",
  "discordRpc.imagesAndButton": "ИЗОБРАЖЕНИЯ И КНОПКА",
  "discordRpc.largeImageKey": "КЛЮЧ БОЛЬШОГО ИЗОБРАЖЕНИЯ",
  "discordRpc.smallImageKey": "КЛЮЧ МАЛЕНЬКОГО ИЗОБРАЖЕНИЯ",
  "discordRpc.buttonText": "ТЕКСТ КНОПКИ",
  "discordRpc.optional": "Необязательно",
  "discordRpc.buttonLink": "ССЫЛКА КНОПКИ",
  "discordRpc.enterTheNamesOf":
    "Укажите названия изображений, загруженных в Discord Developer Portal → Rich Presence → Art Assets. Кнопка появится, когда вы зададите её текст.",

  // elementToggle
  "elementToggle.hide": "Скрыть",
  "elementToggle.show": "Показать",
  "elementToggle.toggleSettings": "{action} дополнительные настройки {title}",

  // instanceTransferModals
  "instanceTransferModals.buildName": "ИМЯ СБОРКИ",
  "instanceTransferModals.ramSettings": "ПАМЯТЬ",
  "instanceTransferModals.javaArguments": "АРГУМЕНТЫ JAVA",
  "instanceTransferModals.environmentVariables": "ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ",
  "instanceTransferModals.windowSize": "РАЗМЕР ОКНА",
  "instanceTransferModals.shaders": "ШЕЙДЕРЫ",
  "instanceTransferModals.resourcePacks": "НАБОРЫ РЕСУРСОВ",
  "instanceTransferModals.exportBuild": "ЭКСПОРТ СБОРКИ",
  "instanceTransferModals.slbuildStoresTheProject":
    ".SLBUILD сохраняет список проектов. .MRPACK также включает локальные моды, настройки и файлы пользователя через OVERRIDES.",
  "instanceTransferModals.creatingMrpack": "СОЗДАНИЕ .MRPACK…",
  "instanceTransferModals.importBuild": "ИМПОРТ СБОРКИ",
  "instanceTransferModals.newBuild": "НОВАЯ СБОРКА",
  "instanceTransferModals.enterABuildName": "Введите название сборки",
  "instanceTransferModals.filesFromTheMrpack":
    "Файлы .mrpack будут загружены и распакованы в папки сборки.",
  "instanceTransferModals.versionAndLoaderCome":
    "Версия и загрузчик берутся из файла. Проекты Modrinth загрузятся заново.",
  "instanceTransferModals.installed": "Установлено",
  "instanceTransferModals.preparing": "ПОДГОТОВКА",
  "instanceTransferModals.installing": "УСТАНОВКА",
  "instanceTransferModals.extracting": "РАСПАКОВКА",
  "instanceTransferModals.done": "ГОТОВО",
  "instanceTransferModals.buildImportProgress": "Прогресс импорта сборки",
  "instanceTransferModals.stoppingAndCleaningUp": "Останавливаю и очищаю незавершённую сборку…",
  "instanceTransferModals.preparingFiles": "Подготовка файлов…",
  "instanceTransferModals.importing": "ИМПОРТ…",
  "instanceTransferModals.retryFailed": "ПОВТОРИТЬ ОШИБКИ",
  "instanceTransferModals.import": "ИМПОРТИРОВАТЬ",
  "instanceTransferModals.cancelling": "ОТМЕНА…",
  "instanceTransferModals.cancelImport": "ОТМЕНИТЬ ИМПОРТ",
  "instanceTransferModals.couldNotReadThe": "Ошибка чтения файла.",
  "instanceTransferModals.importSummary":
    "Сборка создана. Установлено {installed} / {total} компонентов.",

  // instanceTransfers
  "instanceTransfers.exportedSlbuild": "{name} экспортирована (.slbuild)",
  "instanceTransfers.exportedMrpack": "{name} экспортирована (.mrpack)",
  "instanceTransfers.allBuildComponentsAre": "Все компоненты сборки установлены",
  "instanceTransfers.buildImported": "Сборка {name} импортирована",
  "instanceTransfers.buildCreatedButComponents":
    "Сборка создана, не удалось установить {failedCount} компонентов",
  "instanceTransfers.reinstallCancelledFilesThat":
    "Повторная установка отменена. Уже установленные файлы сохранены.",
  "instanceTransfers.importCancelledYouCan":
    "Импорт отменён. Можно изменить параметры и повторить.",
  "instanceTransfers.buildImportCancelled": "Импорт сборки отменён",

  // instances
  "instances.instanceLibrary": "БИБЛИОТЕКА СБОРОК",
  "instances.buildTrash": "Корзина сборок",
  "instances.trash": "КОРЗИНА",
  "instances.importBuildFromFile": "Импортировать сборку из файла",
  "instances.createBuild": "СОЗДАТЬ СБОРКУ",
  "instances.noBuildsYet": "СБОРОК ПОКА НЕТ",
  "instances.createYourFirstBuild": "Создайте первую сборку, чтобы начать установку.",
  "instances.dropFile": "Отпустите ФАЙЛ",
  "instances.createNewBuild": "НОВАЯ СБОРКА",
  "instances.buildName": "ИМЯ СБОРКИ",
  "instances.myVanillaBuild": "Моя сборка Vanilla",
  "instances.mcVersion": "ВЕРСИЯ MC",
  "instances.selectVersion": "Выберите ВЕРСИЮ",
  "instances.loader": "ЗАГРУЗЧИК",
  "instances.loaderVersion": "ВЕРСИЯ ЗАГРУЗЧИКА",
  "instances.loading": "ЗАГРУЗКА…",
  "instances.buildSettings": "Настройки сборки",
  "instances.buildConfiguration": "НАСТРОЙКА СБОРКИ",
  "instances.worldBackups": "КОПИИ МИРОВ",
  "instances.renameBuild": "ПЕРЕИМЕНОВАТЬ СБОРКУ",
  "instances.saveNewName": "Сохранить новое имя",
  "instances.cancelRename": "Отменить переименование",
  "instances.renameBuild2": "Переименовать сборку",
  "instances.stopTheGameBefore": "Остановите сборку перед переименованием",
  "instances.unpinBuild": "Открепить сборку",
  "instances.pinBuild": "Закрепить сборку",
  "instances.noBuild": "НЕТ СБОРКИ",
  "instances.installHint":
    "Проверить и загрузить файлы Minecraft, загрузчика и Java без запуска игры. Кнопка «Играть» делает это автоматически перед запуском.",
  "instances.folder": "ПАПКА",
  "instances.stats": "СТАТИСТИКА",
  "instances.exportBuild": "Экспортировать сборку",
  "instances.screenshots": "Скриншоты",
  "instances.deleteBuild": "Удалить сборку",
  "instances.retryInstall": "ПОВТОРИТЬ УСТАНОВКУ",
  "instances.retryLaunch": "ПОВТОРИТЬ ЗАПУСК",
  "instances.selectLoaderVersion": "Выберите ВЕРСИЮ {loader}",

  // launcherGuide
  "launcherGuide.skip": "ПРОПУСТИТЬ",
  "launcherGuide.back": "НАЗАД",
  "launcherGuide.done": "ГОТОВО",
  "launcherGuide.next": "ДАЛЬШЕ",

  // launcherPlugins
  "launcherPlugins.botManager": "УПРАВЛЕНИЕ БОТОМ",
  "launcherPlugins.extensions": "РАСШИРЕНИЯ",
  "launcherPlugins.extensionStatus": "Состояние расширений",
  "launcherPlugins.minimizeWindow": "Свернуть окно",
  "launcherPlugins.maximizeOrRestoreWindow": "Развернуть или восстановить окно",
  "launcherPlugins.closeBotManager": "Закрыть окно управления ботом",
  "launcherPlugins.closeExtensions": "Закрыть расширения",
  "launcherPlugins.extensions2": "Расширения",
  "launcherPlugins.opening": "Открываем…",
  "launcherPlugins.openInASeparate": "В отдельном окне",
  "launcherPlugins.checking": "Проверка…",
  "launcherPlugins.installing": "Установка…",
  "launcherPlugins.removing": "Удаление…",
  "launcherPlugins.install": "Установить",
  "launcherPlugins.disable": "Выключить",
  "launcherPlugins.confirmRemoval": "Подтвердить удаление",
  "launcherPlugins.removePackage": "Удалить пакет",
  "launcherPlugins.settingsFor": "Настройки",
  "launcherPlugins.checkingWhetherTheExtension": "Проверяем, установлен ли пакет расширения…",
  "launcherPlugins.installThePackageWith":
    "Установите пакет кнопкой выше, чтобы включить расширение. Настройки можно подготовить заранее.",
  "launcherPlugins.loadingSettings": "Загружаем настройки…",
  "launcherPlugins.settingsAreSavedAutomatically": "Настройки сохраняются автоматически",
  "launcherPlugins.done": "Готово",
  "launcherPlugins.totalCount": "{count} всего",
  "launcherPlugins.enabledCount": "{count} включено",

  // launcherUpdate
  "launcherUpdate.updateInterrupted": "Обновление прервано",
  "launcherUpdate.newVersion": "Новая версия",
  "launcherUpdate.justAMoment": "Ещё мгновение.",
  "launcherUpdate.almostReadyToGo": "И можно продолжать.",
  "launcherUpdate.aLittleBetter": "Немного лучше.",
  "launcherUpdate.withEveryLaunch": "С каждым запуском.",
  "launcherUpdate.yourCurrentVersionIs": "Текущая версия готова к работе.",
  "launcherUpdate.theLauncherWillClose": "Лаунчер закроется и откроется сам.",
  "launcherUpdate.aLauncherUpdateIs": "Доступно обновление лаунчера.",
  "launcherUpdate.updatingTheLauncher": "Обновляем лаунчер.",
  "launcherUpdate.yourBuildsAndSettings": "Ваши сборки и настройки останутся на месте.",
  "launcherUpdate.installingUpdate": "Устанавливаем обновление",
  "launcherUpdate.verifyingFileSignature": "Проверяем подпись файла",
  "launcherUpdate.downloadingUpdate": "Скачиваем обновление",
  "launcherUpdate.restartingAutomatically": "Перезапуск автоматически",
  "launcherUpdate.almostReady": "Почти готово",
  "launcherUpdate.remaining": "Осталось",
  "launcherUpdate.installingUpdate2": "Установка обновления",
  "launcherUpdate.downloadingUpdate2": "Загрузка обновления",
  "launcherUpdate.installing": "Установка",
  "launcherUpdate.verifyingSignature": "Проверка подписи",
  "launcherUpdate.downloadSizeIsUnknown": "Размер загрузки пока неизвестен",
  "launcherUpdate.applyingTheNewVersion": "Применяем новую версию",
  "launcherUpdate.updateNow": "Обновить сейчас",
  "launcherUpdate.later": "Позже",
  "launcherUpdate.tryAgain": "Попробовать ещё раз",
  "launcherUpdate.continueWithoutUpdating": "Продолжить без обновления",
  "launcherUpdate.releaseNotes": "Описание обновления",
  "launcherUpdate.whatsNew": "Что нового",
  "launcherUpdate.updateSteps": "Этапы обновления",
  "launcherUpdate.couldNotUpdate": "Не удалось{br}обновить лаунчер.",
  "launcherUpdate.progressOf": "{downloaded} из {total}",
  "launcherUpdate.autoStart": "Начнём автоматически через {seconds} с",

  // mascot
  "mascot.undoMascotChanges": "ОТКАТИТЬ ИЗМЕНЕНИЯ МАСКОТА",
  "mascot.theMascotsFullBowl": "Полная миска маскота. Перетащите и бросьте, чтобы опрокинуть.",
  "mascot.theMascotsEmptyBowl": "Пустая миска маскота",
  "mascot.pickUpAndThrow": "Возьми и брось миску",
  "mascot.isAsleepClickTo": "{name} спит. Нажмите, чтобы разбудить.",
  "mascot.isCarryingAButton": "{name} несёт кнопку. Нажмите, чтобы вернуть её.",
  "mascot.clickToPetOr": "{name}. Нажмите, чтобы погладить, или перетащите и бросьте.",
  "mascot.clickToWakeUp": "Нажмите, чтобы разбудить",
  "mascot.clickToReturnThe": "Нажмите, чтобы вернуть кнопку",
  "mascot.petOrThrowThe": "Погладь или брось маскота",

  // microsoftAccounts
  "microsoftAccounts.account": "АККАУНТ",
  "microsoftAccounts.microsoftProfileManager": "Управление профилем Microsoft",
  "microsoftAccounts.accounts": "АККАУНТЫ",
  "microsoftAccounts.noMicrosoftAccountsAdded": "Аккаунты Microsoft ещё не добавлены.",
  "microsoftAccounts.signInToLoad": "Войди, чтобы загрузить профиль Minecraft.",
  "microsoftAccounts.active": "АКТИВЕН",
  "microsoftAccounts.removeAccount": "Удалить аккаунт",
  "microsoftAccounts.waitingForSignIn": "Ожидаем входа…",
  "microsoftAccounts.completeLoginInThe": "Заверши вход в окне Microsoft",
  "microsoftAccounts.signingIn": "Вход…",
  "microsoftAccounts.addMicrosoftAccount": "ДОБАВИТЬ АККАУНТ MICROSOFT",
  "microsoftAccounts.noAccountSelected": "АККАУНТ НЕ ВЫБРАН",
  "microsoftAccounts.minecraftProfile": "ПРОФИЛЬ MINECRAFT",
  "microsoftAccounts.loadingProfile": "ЗАГРУЗКА ПРОФИЛЯ…",
  "microsoftAccounts.loadingViewer": "ЗАГРУЗКА ПРОСМОТРА…",
  "microsoftAccounts.localPreview": "ЛОКАЛЬНЫЙ ПРОСМОТР",
  "microsoftAccounts.default": "ПО УМОЛЧАНИЮ",
  "microsoftAccounts.layer2": "СЛОЙ 2",
  "microsoftAccounts.base": "ОСНОВА",
  "microsoftAccounts.noCape": "БЕЗ ПЛАЩА",
  "microsoftAccounts.viewer": "ПРОСМОТР",
  "microsoftAccounts.rotating": "ВРАЩЕНИЕ",
  "microsoftAccounts.previewAnimation": "Анимация просмотра",
  "microsoftAccounts.pauseRotate": "ОСТАНОВИТЬ ВРАЩЕНИЕ",
  "microsoftAccounts.autoRotate": "АВТОВРАЩЕНИЕ",
  "microsoftAccounts.hideLayer2": "СКРЫТЬ СЛОЙ 2",
  "microsoftAccounts.showLayer2": "ПОКАЗАТЬ СЛОЙ 2",
  "microsoftAccounts.zoomOff": "МАСШТАБ ВЫКЛ",
  "microsoftAccounts.zoomOn": "МАСШТАБ ВКЛ",
  "microsoftAccounts.resetView": "СБРОСИТЬ ВИД",
  "microsoftAccounts.skin": "СКИН",
  "microsoftAccounts.skinModel": "Модель скина",
  "microsoftAccounts.pickSkin": "ВЫБРАТЬ СКИН",
  "microsoftAccounts.applying": "ПРИМЕНЕНИЕ…",
  "microsoftAccounts.applySkin": "ПРИМЕНИТЬ СКИН",
  "microsoftAccounts.resetting": "СБРОС…",
  "microsoftAccounts.resetSkin": "СБРОСИТЬ СКИН",
  "microsoftAccounts.capes": "ПЛАЩИ",
  "microsoftAccounts.saving": "СОХРАНЕНИЕ…",
  "microsoftAccounts.applyCape": "ПРИМЕНИТЬ ПЛАЩ",
  "microsoftAccounts.hiding": "СКРЫТИЕ…",
  "microsoftAccounts.hideCape": "СКРЫТЬ ПЛАЩ",

  // minecraftSearch
  "minecraftSearch.blocksAndGroups": "Блоки и группы",
  "minecraftSearch.items": "Предметы",
  "minecraftSearch.catalog": "Каталог",
  "minecraftSearch.blocks": "{blocksCount} блоков",
  "minecraftSearch.group": "Группа",
  "minecraftSearch.block": "Блок",
  "minecraftSearch.item": "Предмет",
  "minecraftSearch.nothingFoundTryA": "Ничего не найдено. Попробуйте название или ID Minecraft.",
  "minecraftSearch.theCatalogIsUnavailable":
    "Каталог пока недоступен. Можно ввести ID Minecraft вручную.",
  "minecraftSearch.selectEnterConfirm": "↑ ↓ выбор · Enter подтвердить",
  "minecraftSearch.ctrlAddRemoveShift": " · Ctrl — добавить/снять · Shift — диапазон",

  // modrinthContent
  "modrinthContent.installingTheModAnd": "Установка мода и обязательных зависимостей…",
  "modrinthContent.modAndRequiredDependencies": "Мод и обязательные зависимости установлены",
  "modrinthContent.uninstallingMod": "Удаляем мод…",
  "modrinthContent.installingResourcePack": "Устанавливаем набор ресурсов…",
  "modrinthContent.resourcePackInstallFinished": "Набор ресурсов установлен",
  "modrinthContent.uninstallingResourcePack": "Удаляем набор ресурсов…",
  "modrinthContent.installingShader": "Устанавливаем шейдер…",
  "modrinthContent.shaderInstallFinished": "Шейдер установлен",
  "modrinthContent.uninstallingShader": "Удаляем шейдер…",
  "modrinthContent.downloadCancelled": "{projectName}: загрузка отменена",
  "modrinthContent.removedFrom": "{title} удалён из {name}",
  "modrinthContent.results": "РЕЗУЛЬТАТОВ",
  "modrinthContent.nothingFound": "НИЧЕГО НЕ НАЙДЕНО",
  "modrinthContent.targetVersion": "ВЕРСИЯ СБОРКИ",
  "modrinthContent.empty": "ПУСТО",

  // modrinthDependencies
  "modrinthDependencies.requiredModDependencies": "Обязательные зависимости мода",
  "modrinthDependencies.requiredDependencies": "ОБЯЗАТЕЛЬНЫЕ ЗАВИСИМОСТИ",
  "modrinthDependencies.modVersion": "Версия мода",
  "modrinthDependencies.chooseABuildTo":
    "Выберите сборку, чтобы увидеть зависимости для её версии Minecraft.",
  "modrinthDependencies.checkingRequiredDependencies": "Проверяем обязательные зависимости…",
  "modrinthDependencies.couldNotCheckDependencies": "Не удалось проверить зависимости",
  "modrinthDependencies.thisModVersionHas": "У этой версии мода нет обязательных зависимостей.",
  "modrinthDependencies.theseInstallAutomaticallyWith":
    "Устанавливаются автоматически вместе с модом.",
  "modrinthDependencies.version": "Версия",
  "modrinthDependencies.transitiveDependency": " · Вложенная зависимость",

  // modrinthProject
  "modrinthProject.by": "АВТОР",
  "modrinthProject.noShortDescriptionWas": "Для этого проекта нет краткого описания.",
  "modrinthProject.projectStatistics": "Статистика проекта",
  "modrinthProject.downloads": "ЗАГРУЗКИ",
  "modrinthProject.followers": "ПОДПИСЧИКИ",
  "modrinthProject.updated": "ОБНОВЛЕНО",
  "modrinthProject.license": "ЛИЦЕНЗИЯ",
  "modrinthProject.loadingProjectDetails": "ЗАГРУЗКА СВЕДЕНИЙ",
  "modrinthProject.aboutThisProject": "О ПРОЕКТЕ",
  "modrinthProject.categories": "КАТЕГОРИИ",
  "modrinthProject.installing": "УСТАНОВКА…",
  "modrinthProject.downloaded": "ЗАГРУЖЕНО",
  "modrinthProject.update": "ОБНОВИТЬ",

  // obsTelemetry
  "obsTelemetry.obsSource": "ИСТОЧНИК ДЛЯ OBS",
  "obsTelemetry.addThisAddressAs": "Добавьте этот адрес как источник «Браузер» в OBS",
  "obsTelemetry.obsPort": "ПОРТ OBS",
  "obsTelemetry.mainOverlayAddress": "АДРЕС ОСНОВНОГО ОВЕРЛЕЯ",
  "obsTelemetry.overlayControls": "УПРАВЛЕНИЕ ОВЕРЛЕЕМ",
  "obsTelemetry.working": "Выполняется…",
  "obsTelemetry.start": "ЗАПУСТИТЬ",
  "obsTelemetry.stop": "ОСТАНОВИТЬ",
  "obsTelemetry.open": "ОТКРЫТЬ",
  "obsTelemetry.copied": "СКОПИРОВАНО",
  "obsTelemetry.copyAddress": "КОПИРОВАТЬ АДРЕС",
  "obsTelemetry.individualWidgets": "ОТДЕЛЬНЫЕ ВИДЖЕТЫ",
  "obsTelemetry.healthArmorCoordinatesAnd":
    "Здоровье, броня, координаты и другие источники · нажмите, чтобы скопировать адрес",
  "obsTelemetry.copied2": "Скопировано",
  "obsTelemetry.dataAndLog": "ДАННЫЕ И ЖУРНАЛ",
  "obsTelemetry.serverStateAndThe": "Состояние сервера и последние данные игрока",
  "obsTelemetry.server": "СЕРВЕР",
  "obsTelemetry.liveData": "ДАННЫЕ В ЭФИРЕ",
  "obsTelemetry.yes": "Да",
  "obsTelemetry.no": "Нет",
  "obsTelemetry.player": "ИГРОК",
  "obsTelemetry.updated": "ОБНОВЛЕНИЕ",
  "obsTelemetry.health": "ЗДОРОВЬЕ",
  "obsTelemetry.armor": "БРОНЯ",
  "obsTelemetry.food": "ЕДА",
  "obsTelemetry.coordinates": "КООРДИНАТЫ",
  "obsTelemetry.inHand": "В РУКЕ",

  // overview
  "overview.activeBuild": "АКТИВНАЯ СБОРКА",
  "overview.totalTimeInGame": "ВСЕГО В ИГРЕ",
  "overview.nickname": "НИК",
  "overview.loggedIn": "ВХОД ВЫПОЛНЕН",
  "overview.noAccountClickTo": "Нет аккаунта — нажмите, чтобы добавить",
  "overview.account": "АККАУНТ",
  "overview.noBuilds": "СБОРОК ПОКА НЕТ",
  "overview.createAMinecraftBuild":
    "Создайте сборку Minecraft, чтобы установить нужные файлы и запустить игру.",
  "overview.openBuilds": "ОТКРЫТЬ СБОРКИ",
  "overview.lastSession": "ПОСЛЕДНИЙ СЕАНС",
  "overview.minecraftFilesDownloadAutomatically":
    "Все файлы Minecraft загрузятся автоматически перед запуском.",
  "overview.mcLoader": "MC / ЗАГРУЗЧИК",
  "overview.lastPlayed": "ПОСЛЕДНИЙ ЗАПУСК",
  "overview.timeInGame": "ВРЕМЯ В ИГРЕ",
  "overview.playLast2": "ИГРАТЬ",
  "overview.createFirstBuild": "Создайте свою{br}первую сборку.",
  "overview.playLastBuild": "Запустите{br}сборку.",

  // placeholderGuide
  "placeholderGuide.couldNotOpenThe":
    "Не удалось открыть справочник плейсхолдеров. Попробуйте ещё раз.",
  "placeholderGuide.openThePlaceholderGuide": "Открыть справочник плейсхолдеров",
  "placeholderGuide.placeholders": "Плейсхолдеры",
  "placeholderGuide.launcher_name": "Название лаунчера.",
  "placeholderGuide.system_ram": "Вся оперативная память компьютера, в GB.",
  "placeholderGuide.system_ram_value": "Память компьютера — только число, без GB.",
  "placeholderGuide.launcher_ram": "Память, выбранная в настройках лаунчера, в GB.",
  "placeholderGuide.launcher_ram_value": "Память из настроек лаунчера — только число.",
  "placeholderGuide.player_name": "Ник игрока: локальный или из аккаунта Microsoft.",
  "placeholderGuide.account_type": "Тип аккаунта: Offline или Microsoft.",
  "placeholderGuide.build_name": "Название этой сборки.",
  "placeholderGuide.build_version": "Версия Minecraft в сборке.",
  "placeholderGuide.build_loader": "Загрузчик сборки: Fabric, Forge, Vanilla и другие.",
  "placeholderGuide.build_loader_version": "Версия загрузчика. Если её нет — знак «—».",
  "placeholderGuide.build_full_loader": "Название загрузчика вместе с его версией.",
  "placeholderGuide.build_ram": "Выделенная сборке оперативная память, в GB.",
  "placeholderGuide.build_ram_value": "Память сборки — только число, без GB.",
  "placeholderGuide.build_playtime": "Сколько времени сыграно в этой сборке.",
  "placeholderGuide.build_last_played": "Когда сборку запускали в последний раз.",
  "placeholderGuide.build_created": "Дата создания сборки.",
  "placeholderGuide.build_status": "Статус установки: например, Ready или Updating.",
  "placeholderGuide.build_state": "Текущее состояние: например, Running во время игры.",
  "placeholderGuide.build_source":
    "Источник сборки: «Официальный» для созданной в лаунчере, «Импортировано» для импортированной.",
  "placeholderGuide.total_playtime": "Время игры во всех сборках вместе.",
  "placeholderGuide.total_builds": "Сколько всего сборок в библиотеке.",
  "placeholderGuide.total_modded_builds": "Сколько сборок используют загрузчик модов.",
  "placeholderGuide.total_vanilla_builds":
    "Сколько сборок с обычным Minecraft, без загрузчика модов.",
  "placeholderGuide.total_allocated_ram": "Сумма выделенной памяти всех сборок, в GB.",
  "placeholderGuide.owner": "Ник владельца бота. Только в сообщении Mineflayer-бота при входе.",
  "placeholderGuide.ownerLabel": "Владелец бота",
  "placeholderGuide.bot": "Ник подключённого бота. Только в сообщении Mineflayer-бота при входе.",
  "placeholderGuide.botLabel": "Ник бота",
  "placeholderGuide.server": "Адрес сервера. Только в сообщении Mineflayer-бота при входе.",
  "placeholderGuide.serverLabel": "Сервер бота",

  // pluginCard
  "pluginCard.checking": "Проверка…",
  "pluginCard.installing": "Установка…",
  "pluginCard.availableToInstall": "Доступно для установки",

  // proxy
  "proxy.connectThroughAProxy": "ПОДКЛЮЧЕНИЕ ЧЕРЕЗ ПРОКСИ",
  "proxy.addressCredentialsAndConnection": "Адрес, учётные данные и проверка соединения",
  "proxy.proxyAddress": "АДРЕС ПРОКСИ",
  "proxy.hideProxyDetails": "Скрыть данные прокси",
  "proxy.showProxyDetails": "Показать данные прокси",
  "proxy.testing": "Проверка…",
  "proxy.testConnection": "Проверить соединение",
  "proxy.connectionEstablished": "Соединение установлено",
  "proxy.connectionFailed": "Ошибка подключения",
  "proxy.directConnection": "ПРЯМОЕ СОЕДИНЕНИЕ",
  "proxy.domainsAndNetworksTo": "Домены и сети, которые нужно открывать без прокси",
  "proxy.proxyExceptions": "ИСКЛЮЧЕНИЯ ДЛЯ ПРОКСИ",
  "proxy.separateAddressesWithCommas":
    "Разделяйте адреса запятыми или переносами строк. Домен включает поддомены; также можно указать IP-адрес или диапазон CIDR.",
  "proxy.supportedSchemes":
    "Поддерживаются {http}, {https} и {socks}. Если нужны логин и пароль, укажите их в адресе прокси.",

  // settings
  "ram.exceedsUsableMemory":
    "Выбрано больше доступных системе {usable} ГБ. Это может вызвать зависания и нестабильную работу системы.",
  "ram.warningSignTitle": "Стоп, перебор с RAM!",
  "ram.warningSignRisk": "Возможны зависания системы",
  "ram.warningSignAction": "Оставьте память системе",
  "ram.warningSignMaximum": "Вся RAM отдана игре!",
  "ram.warningSignReduce": "Уменьшите выделение памяти",
  "settings.launcherSettings": "НАСТРОЙКИ ЛАУНЧЕРА",
  "settings.appearance": "ОФОРМЛЕНИЕ",
  "settings.customDesignActiveEdit":
    "Свой дизайн активен · изменить в студии оформления (Ctrl+Shift+A)",
  "settings.editDesignInAppearance": "Изменить дизайн в студии оформления (Ctrl+Shift+A)",
  "settings.downloadSource": "ИСТОЧНИК ЗАГРУЗКИ",
  "settings.autoDownloadJava": "АВТОЗАГРУЗКА JAVA",
  "settings.language": "ЯЗЫК",
  "settings.launcherUpdates": "ОБНОВЛЕНИЯ ЛАУНЧЕРА",
  "settings.version": "Версия",
  "settings.newVersionsAreChecked":
    "Новые версии проверяются при запуске и ставятся без установщика Windows.",
  "settings.checking": "ПРОВЕРКА…",
  "settings.checkNow": "ПРОВЕРИТЬ",
  "settings.preferences": "ПРЕДПОЧТЕНИЯ",
  "settings.optimizedJavaArguments": "ОПТИМИЗАЦИЯ JAVA",
  "settings.launchWithG1gcSettings":
    "Запуск с настройками G1GC и фиксированной памятью. Выключи для обычного запуска.",
  "settings.wheelTabSwitching": "ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК КОЛЕСОМ",
  "settings.switchTabsWithThe": "Переключение вкладок движением колеса мыши.",
  "settings.launcherMascot": "МАСКОТ ЛАУНЧЕРА",
  "settings.theMascotWalksAround":
    "Маскот гуляет по меню. Нажмите стрелку, чтобы настроить его характер и возможности.",
  "settings.mascotName": "ИМЯ МАСКОТА",
  "settings.mascotName2": "Имя маскота",
  "settings.showMascotName": "ПОКАЗЫВАТЬ ИМЯ МАСКОТА",
  "settings.showTheMascotsName": "Показывать имя маскота в плашке при наведении.",
  "settings.rageMode": "РЕЖИМ ЯРОСТИ",
  "settings.hardThrowsBuildUp": "Сильные броски копят предупреждения и могут вызвать ярость.",
  "settings.waterBowl": "МИСКА С ВОДОЙ",
  "settings.showABowlThe": "Показывать миску: маскот сможет пить, а миску можно взять и бросить.",
  "settings.autonomousMovement": "СВОБОДНОЕ ПЕРЕДВИЖЕНИЕ",
  "settings.allowTheMascotTo": "Разрешить маскоту самостоятельно гулять по лаунчеру.",
  "settings.playWithControls": "ИГРАТЬ С ЭЛЕМЕНТАМИ",
  "settings.jumpOntoButtonsFields": "Прыгать на кнопки, поля и ползунки в спокойном режиме.",
  "settings.carryUiElements": "ПЕРЕНОСИТЬ ЭЛЕМЕНТЫ",
  "settings.pickUpAndCarry": "Брать элементы интерфейса в руки и уносить их.",
  "settings.scrollLists": "ЛИСТАТЬ СПИСКИ",
  "settings.walkUpToLists": "Подходить к спискам и самостоятельно листать их.",
  "settings.showSnapshots": "ПОКАЗЫВАТЬ СНАПШОТЫ",
  "settings.showSnapshotVersionsIn": "Показывать снапшоты в списке доступных версий.",
  "settings.showPreReleases": "ПОКАЗЫВАТЬ ПРЕДРЕЛИЗЫ",
  "settings.showPreReleaseAnd": "Показывать предварительные версии и кандидаты на выпуск.",
  "settings.advancedSettings": "ДОПОЛНИТЕЛЬНЫЕ НАСТРОЙКИ",
  "settings.enablesBuildSettingsAnd": "Включает настройку сборок и внешний вид карточек.",
  "settings.extensions": "РАСШИРЕНИЯ",
  "settings.manage": "УПРАВЛЯТЬ",

  // updateProgress
  "updateProgress.mb": "МБ",
  "updateProgress.mbS": "МБ/с",
  "updateProgress.underASecond": "меньше секунды",
  "updateProgress.theUpdateSignatureCheck":
    "Подпись обновления не прошла проверку. Файл не установлен.",
  "updateProgress.theUpdateServerDid":
    "Сервер обновлений не ответил вовремя. Проверьте подключение и попробуйте ещё раз.",
  "updateProgress.cantReachTheUpdate":
    "Нет связи с сервером обновлений. Проверьте подключение или прокси.",
  "updateProgress.theUpdateServerReturned": "Сервер обновлений вернул ошибку. Попробуйте позже.",
  "updateProgress.unknownUpdateError": "Неизвестная ошибка обновления.",
  "updateProgress.seconds": "~{seconds} с",
  "updateProgress.minutes": "~{minutes} мин",

  // worldBackups
  "worldBackups.savingWorlds": "Сохраняем миры…",
  "worldBackups.restoringWorlds": "Восстанавливаем миры…",
  "worldBackups.deletingBackup": "Удаляем копию…",
  "worldBackups.refreshing": "Обновляем…",
  "worldBackups.whichWorldsShouldBe": "Какие миры восстановить?",
  "worldBackups.deleteThisBackup": "Удалить эту копию?",
  "worldBackups.selectedWorldsWillReplace":
    "Выбранные миры заменят текущие в игре. Перед заменой сохраним их прежние версии.",
  "worldBackups.clearSelection": "Снять выбор",
  "worldBackups.selectAll": "Выбрать все",
  "worldBackups.replaceInGame": "Заменить в игре",
  "worldBackups.restoreToGame": "Вернуть в игру",
  "worldBackups.onlyThisBackupWill": "Удалится только эта резервная копия. Миры в игре останутся.",
  "worldBackups.cancel": "Отмена",
  "worldBackups.deleteBackup": "Удалить копию",
  "worldBackups.restore": "Восстановить",
  "worldBackups.worldBackups": "Резервные копии",
  "worldBackups.refreshWorldsAndBackups": "Обновить миры и копии",
  "worldBackups.refresh": "Обновить",
  "worldBackups.closeWorldBackups": "Закрыть резервные копии",
  "worldBackups.closeTheGameTo": "Закройте игру, чтобы создать копию или восстановить миры.",
  "worldBackups.worldsToBackUp": "Миры для копии",
  "worldBackups.loadingWorlds": "Загружаем миры…",
  "worldBackups.yourWorldsWillAppear": "Здесь появятся ваши миры",
  "worldBackups.createAWorldIn": "Создайте мир в этой сборке и вернитесь, чтобы сохранить его.",
  "worldBackups.backupName": "Название копии",
  "worldBackups.optional": "необязательно",
  "worldBackups.forExampleBeforeUpdating": "Например, перед обновлением модов",
  "worldBackups.saving": "Сохраняем…",
  "worldBackups.createBackup": "Создать копию",
  "worldBackups.savedBackups": "Сохранённые копии",
  "worldBackups.backupType": "Тип копий",
  "worldBackups.all": "Все",
  "worldBackups.mine": "Мои",
  "worldBackups.automatic": "Автоматические",
  "worldBackups.loadingBackups": "Загружаем копии…",
  "worldBackups.noBackupsOfThis": "Таких копий пока нет",
  "worldBackups.noSavedBackupsYet": "Пока нет сохранённых копий",
  "worldBackups.theyWillAppearAfter": "Они появятся после восстановления миров.",
  "worldBackups.backUpYourWorlds": "Сохраните нужные миры, чтобы вернуться к ним позже.",
  "worldBackups.worldBackup": "Копия миров",
  "worldBackups.restored": "Восстановлена",
  "worldBackups.backupContents": "Состав копии",
  "worldBackups.worldsInBackup": "Миры в копии",
  "worldBackups.beforeRestore": "Перед восстановлением",
  "worldBackups.couldNotRefreshThe": "Не удалось обновить список",
  "worldBackups.backupCreatedWithWorlds": "Копия создана. Сохранено миров: {worldCount}.",
  "worldBackups.andMore": " и ещё {value}",
  "worldBackups.restoredToGame": "Восстановлено в игру: {worlds}{extra}. {note}",
  "worldBackups.backupDeletedGameWorlds": "Копия удалена. Миры в игре сохранены.",
  "worldBackups.restoredNoteSafety": "Предыдущие версии сохранены в страховочной копии.",
  "worldBackups.restoredNoteAvailable": "Миры снова доступны в сборке.",
  "worldBackups.unknownDate": "Дата неизвестна",
  "worldBackups.worlds": { one: "{count} мир", few: "{count} мира", many: "{count} миров" },
  "worldBackups.selectedOf": "Выбрано {selected} из {total}",

  // worldPreview
  "worldPreview.no": "Нет",
  "worldPreview.preview": "превью",

  // duration
  "duration.hoursMinutes": "{hours} ч {minutes} мин",
  "duration.hours": "{hours} ч",
  "duration.minutes": "{minutes} мин",
  "duration.seconds": "{seconds} сек",
  "duration.minutesSeconds": "{minutes} мин {seconds} сек",

  // playtime
  "playtime.neverPlayed": "Ещё не запускалась",
  "playtime.today": "Сегодня",
  "playtime.yesterday": "Вчера",
  "playtime.daysAgo": {
    one: "{count} день назад",
    few: "{count} дня назад",
    many: "{count} дней назад",
  },
  "playtime.noPlaytime": "Время игры не записано",
  "playtime.hoursOnRecord": "{hours} ч в игре",

  // buildActivityCalendar.weekday
  "buildActivityCalendar.weekday.mon": "ПН",
  "buildActivityCalendar.weekday.tue": "ВТ",
  "buildActivityCalendar.weekday.wed": "СР",
  "buildActivityCalendar.weekday.thu": "ЧТ",
  "buildActivityCalendar.weekday.fri": "ПТ",
  "buildActivityCalendar.weekday.sat": "СБ",
  "buildActivityCalendar.weekday.sun": "ВС",

  // buildActivityCalendar.level
  "buildActivityCalendar.level.0": "Нет записей",
  "buildActivityCalendar.level.1": "До 30 мин",
  "buildActivityCalendar.level.2": "30–60 мин",
  "buildActivityCalendar.level.3": "1–3 ч",
  "buildActivityCalendar.level.4": "> 3 ч",

  // buildStats.kind
  "buildStats.kind.created": "Создание",
  "buildStats.kind.mod": "Мод",
  "buildStats.kind.pack": "Ресурс-пак",
  "buildStats.kind.shader": "Шейдер",
  "buildStats.kind.launched": "Игра",

  // buildStats.filter
  "buildStats.filter.all": "Все события",
  "buildStats.filter.launched": "Игра",
  "buildStats.filter.mod": "Моды",
  "buildStats.filter.resources": "Ресурсы",

  // buildStats.tab
  "buildStats.tab.timeline": "Хронология",
  "buildStats.tab.heatmap": "Тепловая карта",
  "buildStats.tab.constellation": "Созвездие",

  // microsoftAccounts.motion
  "microsoftAccounts.motion.STILL": "СТОИТ",
  "microsoftAccounts.motion.IDLE": "ОЖИДАНИЕ",
  "microsoftAccounts.motion.WALK": "ШАГ",
  "microsoftAccounts.motion.RUN": "БЕГ",
  "microsoftAccounts.motion.WAVE": "ПРИВЕТ",

  // microsoftAccounts.skin
  "microsoftAccounts.skin.CLASSIC": "КЛАССИКА",
  "microsoftAccounts.skin.SLIM": "ТОНКАЯ",

  // modrinthDependencies.status
  "modrinthDependencies.status.download": "Будет скачан",
  "modrinthDependencies.status.installed": "Уже установлен",
  "modrinthDependencies.status.enable": "Будет включён",

  // modrinthProject.kind
  "modrinthProject.kind.mods": "МОД",
  "modrinthProject.kind.resourcepacks": "НАБОР РЕСУРСОВ",
  "modrinthProject.kind.shaders": "ШЕЙДЕР",

  // settings.choice
  "settings.choice.light": "СВЕТ",
  "settings.choice.dark": "ТЬМА",
  "settings.choice.void": "БЕЗДНА",
  "settings.choice.studio": "СТУДИЯ",
  "settings.choice.official": "ОФИЦ.",
  "settings.choice.auto": "АВТО",
  "settings.choice.mirror": "ЗЕРКАЛО",
  "settings.choice.ru": "RU",
  "settings.choice.en": "EN",

  // discordRpc.mode
  "discordRpc.mode.minecraft": "Minecraft",
  "discordRpc.mode.launcher": "Лаунчер",
  "discordRpc.mode.combined": "Игра и лаунчер",

  // bot.crop
  "bot.crop.auto": "Любые из инвентаря / все зрелые",
  "bot.crop.wheat": "Пшеница",
  "bot.crop.beetroot": "Свёкла",
  "bot.crop.carrot": "Морковь",
  "bot.crop.potato": "Картофель",
  "bot.crop.pumpkin": "Тыква",
  "bot.crop.melon": "Арбуз",
  "bot.crop.nether_wart": "Нарост Незера",

  // bot.action.mine
  "bot.action.mine.label": "Добыть блоки",
  "bot.action.mine.note": "Руды, камень и другие блоки",
  "bot.action.mine.short": "Добыть",

  // bot.action.forest
  "bot.action.forest.label": "Заготовить дерево",
  "bot.action.forest.note": "Срубить и подобрать брёвна",
  "bot.action.forest.short": "Дерево",

  // bot.action.till
  "bot.action.till.label": "Вспахать землю",
  "bot.action.till.note": "Подготовить грядки рядом с водой",
  "bot.action.till.short": "Вспахать",

  // bot.action.plant
  "bot.action.plant.label": "Посадить семена",
  "bot.action.plant.note": "Засадить пустые грядки",
  "bot.action.plant.short": "Посадить",

  // bot.action.harvest
  "bot.action.harvest.label": "Собрать урожай",
  "bot.action.harvest.note": "Только зрелые растения, с пересадкой",
  "bot.action.harvest.short": "Урожай",

  // bot.action.farm
  "bot.action.farm.label": "Обработать огород",
  "bot.action.farm.note": "Собрать, вспахать и посадить за один проход",
  "bot.action.farm.short": "Огород",

  // bot.action.craft
  "bot.action.craft.label": "Скрафтить",
  "bot.action.craft.note": "Ингредиенты и инструменты",
  "bot.action.craft.short": "Крафт",

  // bot.action.smelt
  "bot.action.smelt.label": "Переплавить",
  "bot.action.smelt.note": "Металлы, еда и материалы",
  "bot.action.smelt.short": "Переплавка",

  // bot.action.return
  "bot.action.return.label": "Вернуться к старту",
  "bot.action.return.note": "К месту запуска сценария",
  "bot.action.return.short": "Вернуться",

  // bot.action.collect
  "bot.action.collect.label": "Подобрать предметы",
  "bot.action.collect.note": "Собрать дроп поблизости",
  "bot.action.collect.short": "Подобрать",

  // bot.action.deposit
  "bot.action.deposit.label": "Сложить в сундуки",
  "bot.action.deposit.note": "Выгрузить на настроенный склад",
  "bot.action.deposit.short": "В сундуки",

  // bot.workspace
  "bot.workspace.scenario": "Сценарий",
  "bot.workspace.inventory": "Инвентарь",
  "bot.workspace.production": "Рабочие блоки",
  "bot.workspace.settings": "Настройки",
  "bot.workspace.control": "Журнал и чат",

  // bot.settingsSection
  "bot.settingsSection.connection": "Подключение",
  "bot.settingsSection.behavior": "Движение",
  "bot.settingsSection.survival": "Выживание",
  "bot.settingsSection.combat": "Бой и предметы",
  "bot.settingsSection.gathering": "Добыча и склад",
  "bot.settingsSection.commands": "Команды",

  // bot.movementPreset.safe
  "bot.movementPreset.safe.label": "ОСТОРОЖНЫЙ",
  "bot.movementPreset.safe.description": "Без изменения мира",

  // bot.movementPreset.balanced
  "bot.movementPreset.balanced.label": "СБАЛАНСИРОВАННЫЙ",
  "bot.movementPreset.balanced.description": "Обычное движение",

  // bot.movementPreset.explorer
  "bot.movementPreset.explorer.label": "ИССЛЕДОВАТЕЛЬ",
  "bot.movementPreset.explorer.description": "Быстро, с разрушением блоков",

  // bot.combatPreset
  "bot.combatPreset.novice": "НОВИЧОК",
  "bot.combatPreset.regular": "ОБЫЧНЫЙ",
  "bot.combatPreset.expert": "ЭКСПЕРТ",
  "bot.combatPreset.aggressive": "АГРЕССИВНЫЙ",

  // bot.gathering.mode
  "bot.gathering.mode.mine": "Блоки и руды",
  "bot.gathering.mode.forest": "Лес",
  "bot.gathering.mode.quarry": "Область",
  "bot.gathering.mode.collect": "Дроп",
  "bot.gathering.mode.tunnel": "Туннель",
  "bot.gathering.mode.till": "Вспашка",
  "bot.gathering.mode.plant": "Посадка",
  "bot.gathering.mode.harvest": "Урожай",
  "bot.gathering.mode.farm": "Огород",

  // bot.gathering.phase
  "bot.gathering.phase.idle": "Готов к работе",
  "bot.gathering.phase.scan": "Ищет блоки",
  "bot.gathering.phase.move": "Подходит к блоку",
  "bot.gathering.phase.equip": "Выбирает инструмент",
  "bot.gathering.phase.dig": "Добывает",
  "bot.gathering.phase.farming": "Работает на грядках",
  "bot.gathering.phase.pickup": "Подбирает добычу",
  "bot.gathering.phase.deposit": "Выгружает",
  "bot.gathering.phase.deliver": "Несёт добычу к вам",
  "bot.gathering.phase.return": "Возвращается",
  "bot.gathering.phase.paused": "На паузе",

  // bot.inventory.slot
  "bot.inventory.slot.helmet": "Шлем",
  "bot.inventory.slot.chestplate": "Нагрудник",
  "bot.inventory.slot.leggings": "Поножи",
  "bot.inventory.slot.boots": "Ботинки",
  "bot.inventory.slot.offhand": "Вторая рука",

  // bot.production.station
  "bot.production.station.crafting_table": "Верстак",
  "bot.production.station.furnace": "Печь",
  "bot.production.station.blast_furnace": "Плавильная печь",
  "bot.production.station.smoker": "Коптильня",
  "bot.production.station.stonecutter": "Камнерез",
  "bot.production.station.anvil": "Наковальня",
  "bot.production.station.chipped_anvil": "Повреждённая наковальня",
  "bot.production.station.damaged_anvil": "Разбитая наковальня",
  "bot.production.station.enchanting_table": "Стол зачарований",
  "bot.production.station.brewing_stand": "Зельеварка",
  "bot.production.station.smithing_table": "Кузнечный стол",
  "bot.production.station.grindstone": "Точило",
  "bot.production.station.loom": "Ткацкий станок",
  "bot.production.station.cartography_table": "Стол картографа",
  "bot.production.station.crafter": "Сборщик",
  "bot.production.station.chest": "Сундук",
  "bot.production.station.barrel": "Бочка",
  "bot.production.station.hopper": "Воронка",
  "bot.production.station.dispenser": "Раздатчик",
  "bot.production.station.dropper": "Выбрасыватель",

  // bot.production.slotHelp
  "bot.production.slotHelp.crafting_table":
    "0 — результат; 1–9 — сетка 3×3. Для автоматического крафта используйте форму выше.",
  "bot.production.slotHelp.furnace": "0 — сырьё; 1 — топливо; 2 — результат.",
  "bot.production.slotHelp.blast_furnace": "0 — сырьё; 1 — топливо; 2 — результат.",
  "bot.production.slotHelp.smoker": "0 — еда; 1 — топливо; 2 — результат.",
  "bot.production.slotHelp.anvil":
    "0 — предмет; 1 — материал или книга; 2 — результат. Для ремонта и объединения нужен опыт.",
  "bot.production.slotHelp.chipped_anvil": "0 — предмет; 1 — материал или книга; 2 — результат.",
  "bot.production.slotHelp.damaged_anvil": "0 — предмет; 1 — материал или книга; 2 — результат.",
  "bot.production.slotHelp.stonecutter":
    "0 — материал; 1 — результат. После загрузки выберите номер рецепта от 0.",
  "bot.production.slotHelp.enchanting_table":
    "0 — предмет; 1 — лазурит. Варианты зачарования: 0, 1, 2. Нужен опыт.",
  "bot.production.slotHelp.brewing_stand":
    "0–2 — бутылочки; 3 — ингредиент; 4 — огненный порошок. Дождитесь окончания варки.",
  "bot.production.slotHelp.smithing_table":
    "В новых версиях: 0 — шаблон; 1 — предмет; 2 — материал; 3 — результат. В старых версиях — два входа и результат.",
  "bot.production.slotHelp.grindstone": "0–1 — предметы; 2 — результат.",
  "bot.production.slotHelp.loom":
    "0 — флаг; 1 — краситель; 2 — узор; 3 — результат. Выберите номер узора от 0.",
  "bot.production.slotHelp.cartography_table":
    "0 — карта; 1 — бумага, карта или стекло; 2 — результат.",
  "bot.production.slotHelp.crafter": "0–8 — сетка сборщика. Для запуска нужен сигнал редстоуна.",

  // units
  "units.bytes": "{value} Б",
  "units.kilobytes": "{value} КБ",
  "units.megabytes": "{value} МБ",
  "units.gigabytes": "{value} ГБ",
  "units.terabytes": "{value} ТБ",
  "units.blocksShort": "{value} бл.",

  // environmentVariables
  "environmentVariables.invalidName": "Укажите имя переменной без знака = и символа NUL.",
  "environmentVariables.valueHasNul": "Значение переменной {name} содержит NUL.",
  "environmentVariables.duplicate":
    "Переменная {name} уже добавлена (регистр букв не учитывается).",

  // launcherUpdate.step
  "launcherUpdate.step.download": "Загрузка",
  "launcherUpdate.step.verify": "Проверка",
  "launcherUpdate.step.restart": "Перезапуск",

  // toast
  "toast.buildExported": "Сборка экспортирована",
  "toast.buildImported": "Сборка импортирована",
  "toast.couldntOpenAppearanceStudio": "Не удалось открыть студию оформления",
  "toast.couldntOpenFolder": "Не удалось открыть папку",
  "toast.couldntSaveRam": "Не удалось сохранить RAM",
  "toast.couldntSaveMascotSetting": "Не удалось сохранить настройку маскота",
  "toast.couldntSaveMascotSettings": "Не удалось сохранить настройки маскота",
  "toast.couldntSaveNetwork": "Не удалось сохранить сеть",
  "toast.couldntSavePlugins": "Не удалось сохранить расширения",
  "toast.couldntSaveSetting": "Не удалось сохранить настройку",
  "toast.deleteFailed": "Не удалось удалить",
  "toast.downloadCancelled": "Загрузка отменена",
  "toast.exportFailed": "Ошибка экспорта",
  "toast.forcedStop": "Принудительная остановка",
  "toast.importCancelled": "Импорт отменён",
  "toast.importComplete": "Импорт завершён",
  "toast.importFailed": "Ошибка импорта",
  "toast.importIncomplete": "Импорт не завершён",
  "toast.installFailed": "Ошибка установки",
  "toast.stopFailed": "Не удалось остановить",
  "toast.uninstallFailed": "Не удалось удалить",
  "toast.upToDate": "Обновлений нет",
  "toast.updateCheckFailed": "Не удалось проверить обновления",
  "toast.modInstalled": "Мод установлен",
  "toast.modInstallFailed": "Не удалось установить мод",
  "toast.modRemoved": "Мод удалён",
  "toast.resourcePackInstalled": "Набор ресурсов установлен",
  "toast.resourcePackInstallFailed": "Не удалось установить набор ресурсов",
  "toast.resourcePackRemoved": "Набор ресурсов удалён",
  "toast.shaderInstalled": "Шейдер установлен",
  "toast.shaderInstallFailed": "Не удалось установить шейдер",
  "toast.shaderRemoved": "Шейдер удалён",
  "toast.notifications": "Уведомления",
  "toast.dismiss": "Закрыть",

  // dialog
  "dialog.buildTask": "Задача сборки",
  "dialog.exportModrinthPack": "Экспорт пакета Modrinth",
  "dialog.importBuild": "Импорт сборки",

  // toast.default
  "toast.default.info": "ГОТОВО",
  "toast.default.warning": "ВНИМАНИЕ",
  "toast.default.error": "ОШИБКА",

  // tabs
  "tabs.overview": "ГЛАВНАЯ",
  "tabs.instances": "СБОРКИ",
  "tabs.mods": "MODRINTH",
  "tabs.resourcepacks": "НАБОРЫ",
  "tabs.shaders": "ШЕЙДЕРЫ",
  "tabs.settings": "НАСТРОЙКИ",

  // plugins.discordRpc
  "plugins.discordRpc.tag": "Статус в Discord",
  "plugins.discordRpc.description":
    "Показывает сборку, версию Minecraft и время игры в вашем профиле Discord.",

  // plugins.mineflayerBot
  "plugins.mineflayerBot.tag": "Компаньон в Minecraft",
  "plugins.mineflayerBot.description":
    "Собирайте сценарии добычи, крафта и переплавки. Бот выполнит действия по порядку.",

  // plugins.blueMap
  "plugins.blueMap.tag": "Карта мира",
  "plugins.blueMap.description":
    "Создаёт интерактивную карту мира и открывает её в браузере или отдельном окне.",

  // plugins.obsTelemetry
  "plugins.obsTelemetry.tag": "Оверлей для стрима",
  "plugins.obsTelemetry.description":
    "Передаёт здоровье, броню, еду и координаты игрока в оверлей OBS.",

  // plugins.proxy
  "plugins.proxy.tag": "Сеть и загрузки",
  "plugins.proxy.description": "Загружает файлы лаунчера через HTTP, HTTPS или SOCKS5-прокси.",

  // pluginStatus
  "pluginStatus.on": "Включено",
  "pluginStatus.off": "Выключено",
  "pluginStatus.removing": "Удаление…",
  "pluginStatus.needsAppId": "Укажите Application ID",
  "pluginStatus.needsServer": "Укажите сервер",
  "pluginStatus.needsAccount": "Выберите аккаунт",
  "pluginStatus.needsUrl": "Укажите адрес",
  "pluginStatus.needsPackage": "Настройте пакет",
  "pluginStatus.needsPort": "Укажите порт",

  // modrinthContent.mods
  "modrinthContent.mods.searchLabel": "ПОИСК МОДОВ",
  "modrinthContent.mods.searchPlaceholder": "Искать совместимые моды…",
  "modrinthContent.mods.catalogLabel": "НАЙТИ / УСТАНОВИТЬ",
  "modrinthContent.mods.noTargetTitle": "НЕТ СБОРОК С МОДАМИ",
  "modrinthContent.mods.noTargetText":
    "Создайте сборку Fabric, Quilt или NeoForge на вкладке «Сборки».",
  "modrinthContent.mods.loadingTitle": "ЗАГРУЗКА МОДОВ",
  "modrinthContent.mods.loadingText": "Загружаем моды с Modrinth.",
  "modrinthContent.mods.emptyText": "Попробуйте другой запрос или другую сборку.",
  "modrinthContent.mods.loadingMoreText": "Загружаем ещё моды…",
  "modrinthContent.mods.targetSectionLabel": "ТЕКУЩАЯ СБОРКА",
  "modrinthContent.mods.targetDropdownLabel": "СБОРКА С МОДАМИ",
  "modrinthContent.mods.targetPlaceholder": "Выберите СБОРКУ",
  "modrinthContent.mods.detailLabel": "ЗАГРУЗЧИК",
  "modrinthContent.mods.installedLabel": "УСТАНОВЛЕННЫЕ МОДЫ",
  "modrinthContent.mods.installedLoadingText": "Читаем установленные моды…",
  "modrinthContent.mods.installedEmptyText": "В этой сборке пока нет модов.",
  "modrinthContent.mods.deleteTitle": "Удалить мод",
  "modrinthContent.mods.fallbackCategory": "Мод",

  // modrinthContent.resourcepacks
  "modrinthContent.resourcepacks.searchLabel": "ПОИСК НАБОРОВ",
  "modrinthContent.resourcepacks.searchPlaceholder": "Искать наборы ресурсов…",
  "modrinthContent.resourcepacks.catalogLabel": "НАБОРЫ РЕСУРСОВ",
  "modrinthContent.resourcepacks.noTargetTitle": "НЕТ СБОРОК",
  "modrinthContent.resourcepacks.noTargetText":
    "Создайте сборку на вкладке «Сборки», чтобы устанавливать наборы ресурсов.",
  "modrinthContent.resourcepacks.loadingTitle": "ЗАГРУЗКА НАБОРОВ",
  "modrinthContent.resourcepacks.loadingText": "Загружаем наборы ресурсов.",
  "modrinthContent.resourcepacks.emptyText": "Попробуйте другой запрос или версию Minecraft.",
  "modrinthContent.resourcepacks.loadingMoreText": "Загружаем ещё наборы…",
  "modrinthContent.resourcepacks.targetSectionLabel": "АКТИВНАЯ СБОРКА",
  "modrinthContent.resourcepacks.targetDropdownLabel": "ЦЕЛЕВАЯ СБОРКА",
  "modrinthContent.resourcepacks.targetPlaceholder": "Выберите СБОРКУ",
  "modrinthContent.resourcepacks.detailLabel": "ПАПКА",
  "modrinthContent.resourcepacks.installedLabel": "УСТАНОВЛЕННЫЕ НАБОРЫ",
  "modrinthContent.resourcepacks.installedLoadingText": "Читаем установленные наборы…",
  "modrinthContent.resourcepacks.installedEmptyText": "В этой сборке пока нет наборов ресурсов.",
  "modrinthContent.resourcepacks.deleteTitle": "Удалить набор ресурсов",
  "modrinthContent.resourcepacks.fallbackCategory": "Набор ресурсов",

  // modrinthContent.shaders
  "modrinthContent.shaders.searchLabel": "ПОИСК ШЕЙДЕРОВ",
  "modrinthContent.shaders.searchPlaceholder": "Искать шейдеры…",
  "modrinthContent.shaders.catalogLabel": "ШЕЙДЕРЫ",
  "modrinthContent.shaders.noTargetTitle": "НЕТ СБОРОК",
  "modrinthContent.shaders.noTargetText":
    "Создайте сборку на вкладке «Сборки», чтобы устанавливать шейдеры.",
  "modrinthContent.shaders.loadingTitle": "ЗАГРУЗКА ШЕЙДЕРОВ",
  "modrinthContent.shaders.loadingText": "Загружаем шейдеры.",
  "modrinthContent.shaders.emptyText": "Попробуйте другой запрос или версию Minecraft.",
  "modrinthContent.shaders.loadingMoreText": "Загружаем ещё шейдеры…",
  "modrinthContent.shaders.targetSectionLabel": "АКТИВНАЯ СБОРКА",
  "modrinthContent.shaders.targetDropdownLabel": "ЦЕЛЕВАЯ СБОРКА",
  "modrinthContent.shaders.targetPlaceholder": "Выберите СБОРКУ",
  "modrinthContent.shaders.detailLabel": "ПАПКА",
  "modrinthContent.shaders.installedLabel": "УСТАНОВЛЕННЫЕ ШЕЙДЕРЫ",
  "modrinthContent.shaders.installedLoadingText": "Читаем установленные шейдеры…",
  "modrinthContent.shaders.installedEmptyText": "В этой сборке пока нет шейдеров.",
  "modrinthContent.shaders.deleteTitle": "Удалить шейдер",
  "modrinthContent.shaders.fallbackCategory": "Шейдер",

  // guide.navigation
  "guide.navigation.eyebrow": "НАВИГАЦИЯ / ОСНОВЫ",
  "guide.navigation.title": "ВСЕ РАЗДЕЛЫ — СЛЕВА",
  "guide.navigation.description":
    "Здесь находятся все разделы лаунчера. Переключайся кликом или колесом мыши; активная вкладка всегда подсвечена.",

  // guide.overviewHome
  "guide.overviewHome.eyebrow": "ГЛАВНАЯ / СТАРТ",
  "guide.overviewHome.title": "БЫСТРЫЙ СТАРТ",
  "guide.overviewHome.description":
    "Главная показывает последнюю выбранную сборку, время игры и кнопку «Играть». Если сборок пока нет, отсюда можно сразу перейти к их созданию.",

  // guide.nickname
  "guide.nickname.eyebrow": "ГЛАВНАЯ / НИК",
  "guide.nickname.title": "НИК ДЛЯ ОФЛАЙН-РЕЖИМА",
  "guide.nickname.description":
    "Нажмите на ник, чтобы изменить его. В офлайн-режиме Minecraft запустится под этим именем; значение сразу обновится в карточке игрока слева.",

  // guide.account
  "guide.account.eyebrow": "ГЛАВНАЯ / АККАУНТ",
  "guide.account.title": "OFFLINE ИЛИ MICROSOFT",
  "guide.account.description":
    "В поле «Аккаунт» выберите способ входа. OFFLINE использует указанный ник, а MICROSOFT откроет менеджер аккаунтов для официального входа.",

  // guide.buildLibrary
  "guide.buildLibrary.eyebrow": "СБОРКИ / БИБЛИОТЕКА",
  "guide.buildLibrary.title": "Ваши СБОРКИ",
  "guide.buildLibrary.description":
    "Каждая карточка — отдельный экземпляр Minecraft со своей версией, загрузчиком, модами, настройками и временем игры. Нажмите карточку, чтобы выбрать её.",

  // guide.buildCreateImport
  "guide.buildCreateImport.eyebrow": "СБОРКИ / ДОБАВЛЕНИЕ",
  "guide.buildCreateImport.title": "СОЗДАТЬ ИЛИ ИМПОРТИРОВАТЬ",
  "guide.buildCreateImport.description":
    "«Создать сборку» открывает форму новой сборки. Кнопка со стрелкой импортирует готовый архив или mrpack-файл.",

  // guide.buildEditor
  "guide.buildEditor.eyebrow": "СБОРКИ / НАСТРОЙКА",
  "guide.buildEditor.title": "ВЕРСИЯ, ЗАГРУЗЧИК И ПРОФИЛЬ",
  "guide.buildEditor.description":
    "Здесь задаются имя, версия Minecraft и загрузчик новой сборки либо показываются параметры выбранной. Fabric, Quilt, Forge и NeoForge позволяют ставить моды.",

  // guide.buildActions
  "guide.buildActions.eyebrow": "СБОРКИ / ДЕЙСТВИЯ",
  "guide.buildActions.title": "ЗАПУСК И УПРАВЛЕНИЕ",
  "guide.buildActions.description":
    "«Играть» запускает сборку, «Установить» заранее скачивает файлы, «Папка» открывает её каталог, «Статистика» показывает время игры. Справа — экспорт, скриншоты, оформление и удаление.",

  // guide.modsSearch
  "guide.modsSearch.eyebrow": "MODRINTH / ПОИСК",
  "guide.modsSearch.title": "Найдите НУЖНЫЙ МОД",
  "guide.modsSearch.description":
    "Поиск работает по каталогу Modrinth и учитывает версию выбранной сборки. Вводи название мода или ключевые слова.",

  // guide.modsCatalog
  "guide.modsCatalog.eyebrow": "MODRINTH / КАТАЛОГ",
  "guide.modsCatalog.title": "КАРТОЧКИ МОДОВ",
  "guide.modsCatalog.description":
    "Откройте карточку для подробностей или нажмите «Установить». Лаунчер подберёт совместимый файл и зависимости; установленные моды можно обновлять и удалять.",

  // guide.modsTarget
  "guide.modsTarget.eyebrow": "MODRINTH / ЦЕЛЬ",
  "guide.modsTarget.title": "Выберите СБОРКУ",
  "guide.modsTarget.description":
    "«Сборка с модами» определяет, куда будет установлен мод. Здесь показываются только совместимые сборки с загрузчиком модов.",

  // guide.modsInstalled
  "guide.modsInstalled.eyebrow": "MODRINTH / УСТАНОВЛЕНО",
  "guide.modsInstalled.title": "СПИСОК МОДОВ СБОРКИ",
  "guide.modsInstalled.description":
    "В нижней части панели видны уже установленные моды выбранной сборки. Здесь же их можно быстро удалить.",

  // guide.packsSearch
  "guide.packsSearch.eyebrow": "НАБОРЫ / ПОИСК",
  "guide.packsSearch.title": "ПОИСК НАБОРОВ РЕСУРСОВ",
  "guide.packsSearch.description":
    "Ищи текстуры и визуальные наборы на Modrinth. Каталог автоматически ориентируется на версию выбранной сборки.",

  // guide.packsCatalog
  "guide.packsCatalog.eyebrow": "НАБОРЫ / КАТАЛОГ",
  "guide.packsCatalog.title": "УСТАНОВКА В ОДИН КЛИК",
  "guide.packsCatalog.description":
    "Карточка показывает автора, описание и популярность набора. «Установить» добавляет его в папку resourcepacks выбранной сборки.",

  // guide.packsTarget
  "guide.packsTarget.eyebrow": "НАБОРЫ / ЦЕЛЬ",
  "guide.packsTarget.title": "КУДА СТАВИТЬ НАБОР",
  "guide.packsTarget.description":
    "Перед установкой проверьте «Целевую сборку». Наборы ресурсов не зависят от загрузчика, поэтому подойдёт любая сборка нужной версии.",

  // guide.packsInstalled
  "guide.packsInstalled.eyebrow": "НАБОРЫ / УСТАНОВЛЕНО",
  "guide.packsInstalled.title": "УПРАВЛЕНИЕ НАБОРАМИ",
  "guide.packsInstalled.description":
    "Здесь перечислены наборы ресурсов выбранной сборки. Удаление убирает файл из её папки, не затрагивая другие сборки.",

  // guide.shadersSearch
  "guide.shadersSearch.eyebrow": "ШЕЙДЕРЫ / ПОИСК",
  "guide.shadersSearch.title": "Найдите ШЕЙДЕРПАК",
  "guide.shadersSearch.description":
    "Поиск открывает каталог шейдеров Modrinth. Можно искать по названию, стилю освещения или нужной производительности.",

  // guide.shadersCatalog
  "guide.shadersCatalog.eyebrow": "ШЕЙДЕРЫ / КАТАЛОГ",
  "guide.shadersCatalog.title": "СКАЧИВАНИЕ ШЕЙДЕРОВ",
  "guide.shadersCatalog.description":
    "«Установить» скачивает совместимую версию в папку shaderpacks. Откройте карточку, чтобы прочитать полное описание перед установкой.",

  // guide.shadersTarget
  "guide.shadersTarget.eyebrow": "ШЕЙДЕРЫ / СОВМЕСТИМОСТЬ",
  "guide.shadersTarget.title": "Проверьте IRIS",
  "guide.shadersTarget.description":
    "В «Целевой сборке» выберите нужную сборку. Для Fabric лаунчер показывает наличие Iris: без Iris или аналога Minecraft не сможет включить шейдер.",

  // guide.shadersInstalled
  "guide.shadersInstalled.eyebrow": "ШЕЙДЕРЫ / УСТАНОВЛЕНО",
  "guide.shadersInstalled.title": "СПИСОК ШЕЙДЕРПАКОВ",
  "guide.shadersInstalled.description":
    "Ниже видны скачанные шейдерпаки выбранной сборки. Ненужный пакет можно удалить прямо из этого списка.",

  // guide.settingsRam
  "guide.settingsRam.eyebrow": "НАСТРОЙКИ / ПАМЯТЬ",
  "guide.settingsRam.title": "СКОЛЬКО ПАМЯТИ ДАТЬ MINECRAFT",
  "guide.settingsRam.description":
    "Ползунок задаёт память по умолчанию для игры. Обычной сборке хватает 4–6 GB; тяжёлым модпакам нужно больше, но оставляй память и системе.",

  // guide.settingsAppearance
  "guide.settingsAppearance.eyebrow": "НАСТРОЙКИ / ОФОРМЛЕНИЕ",
  "guide.settingsAppearance.title": "ТЕМА ЛАУНЧЕРА",
  "guide.settingsAppearance.description":
    "«Свет», «Тьма» и «Бездна» мгновенно меняют тему. С дополнительными настройками «Студия» открывает редактор и подсвечивается, когда применён собственный дизайн.",

  // guide.settingsSource
  "guide.settingsSource.eyebrow": "НАСТРОЙКИ / СЕТЬ",
  "guide.settingsSource.title": "ИСТОЧНИК ЗАГРУЗКИ",
  "guide.settingsSource.description":
    "«Офиц.» скачивает с серверов Mojang, «Зеркало» — с зеркала, а «Авто» выбирает оптимальный маршрут и при необходимости переключается сам.",

  // guide.settingsAutoJava
  "guide.settingsAutoJava.eyebrow": "НАСТРОЙКИ / JAVA",
  "guide.settingsAutoJava.title": "АВТОЗАГРУЗКА JAVA",
  "guide.settingsAutoJava.description":
    "Когда опция включена, лаунчер сам скачает подходящую Java для версии Minecraft. Выключайте, только если хотите управлять Java вручную.",

  // guide.settingsLanguage
  "guide.settingsLanguage.eyebrow": "НАСТРОЙКИ / ЯЗЫК",
  "guide.settingsLanguage.title": "ЯЗЫК ИНТЕРФЕЙСА",
  "guide.settingsLanguage.description":
    "Здесь выбирается язык лаунчера. Интерфейс переключается сразу, а выбор сохраняется после перезапуска.",

  // guide.settingsPreferences
  "guide.settingsPreferences.eyebrow": "НАСТРОЙКИ / ПРЕДПОЧТЕНИЯ",
  "guide.settingsPreferences.title": "ПОВЕДЕНИЕ ЛАУНЧЕРА",
  "guide.settingsPreferences.description":
    "В блоке «Предпочтения» находятся переключатели запуска, навигации, версий и дополнительных возможностей. Сейчас разберём каждый из них.",

  // guide.settingsOptimized
  "guide.settingsOptimized.eyebrow": "ПРЕДПОЧТЕНИЯ / JAVA",
  "guide.settingsOptimized.title": "ОПТИМИЗАЦИЯ JAVA",
  "guide.settingsOptimized.description":
    "Добавляет проверенный набор аргументов G1GC и фиксированный размер кучи для более стабильной работы. Выключи, если используешь собственные аргументы Java.",

  // guide.settingsWheel
  "guide.settingsWheel.eyebrow": "ПРЕДПОЧТЕНИЯ / НАВИГАЦИЯ",
  "guide.settingsWheel.title": "ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК КОЛЕСОМ",
  "guide.settingsWheel.description":
    "Разрешает переключать основные вкладки колесом мыши. Внутри списков колесо по-прежнему прокручивает содержимое, а не меняет раздел.",

  // guide.settingsMascot
  "guide.settingsMascot.eyebrow": "ПРЕДПОЧТЕНИЯ / МАСКОТ",
  "guide.settingsMascot.title": "МАСКОТ ЛАУНЧЕРА",
  "guide.settingsMascot.description":
    "Включает интерактивного маскота. Стрелка раскрывает имя, движение, реакции, перенос элементов и другие отдельные способности.",

  // guide.settingsSnapshots
  "guide.settingsSnapshots.eyebrow": "ПРЕДПОЧТЕНИЯ / ВЕРСИИ",
  "guide.settingsSnapshots.title": "ПОКАЗЫВАТЬ СНАПШОТЫ",
  "guide.settingsSnapshots.description":
    "Добавляет экспериментальные снапшоты Minecraft в список версий при создании сборки. Они могут быть нестабильными и несовместимыми с модами.",

  // guide.settingsPrereleases
  "guide.settingsPrereleases.eyebrow": "ПРЕДПОЧТЕНИЯ / ВЕРСИИ",
  "guide.settingsPrereleases.title": "ПОКАЗЫВАТЬ ПРЕДРЕЛИЗЫ",
  "guide.settingsPrereleases.description":
    "Показывает предрелизы и релиз-кандидаты — почти готовые версии для раннего тестирования.",

  // guide.settingsAdvanced
  "guide.settingsAdvanced.eyebrow": "ПРЕДПОЧТЕНИЯ / ДОПОЛНИТЕЛЬНО",
  "guide.settingsAdvanced.title": "ДОПОЛНИТЕЛЬНЫЕ НАСТРОЙКИ",
  "guide.settingsAdvanced.description":
    "Открывает оформление карточек сборок, студию оформления и менеджер расширений. Это режим для глубокой настройки лаунчера.",

  // guide.guideReplay
  "guide.guideReplay.eyebrow": "ПОДСКАЗКИ / ГОТОВО",
  "guide.guideReplay.title": "ТУР МОЖНО ПОВТОРИТЬ",
  "guide.guideReplay.description":
    "Кнопка «Обзор» в верхней панели всегда запускает эти подсказки заново. Автоматический показ после завершения больше не будет мешать.",

  // obsTelemetry.overlay
  "obsTelemetry.overlay.all": "Весь оверлей",
  "obsTelemetry.overlay.settings": "Настройки оверлея",
  "obsTelemetry.overlay.health": "Здоровье",
  "obsTelemetry.overlay.food": "Еда",
  "obsTelemetry.overlay.xp": "Опыт",
  "obsTelemetry.overlay.armor": "Броня",
  "obsTelemetry.overlay.helmet": "Шлем",
  "obsTelemetry.overlay.chestplate": "Нагрудник",
  "obsTelemetry.overlay.leggings": "Поножи",
  "obsTelemetry.overlay.boots": "Ботинки",
  "obsTelemetry.overlay.coords": "Координаты",
  "obsTelemetry.overlay.items": "Предметы",
  "obsTelemetry.overlay.mainHand": "Основная рука",
  "obsTelemetry.overlay.offhand": "Вторая рука",
  "obsTelemetry.overlay.dimension": "Измерение",

  // bot.catalog
  "bot.catalog.blockTypes": {
    one: "{count} вид блоков",
    few: "{count} вида блоков",
    many: "{count} видов блоков",
  },
  "bot.catalog.allOres": "все руды",
  "bot.catalog.allLogs": "все стволы",

  // bot.catalog.group
  "bot.catalog.group.ores": "Все руды",
  "bot.catalog.group.logs": "Стволы деревьев",
  "bot.catalog.group.wood": "Древесина",
  "bot.catalog.group.leaves": "Листва",
  "bot.catalog.group.coal": "Уголь",
  "bot.catalog.group.iron": "Железо",
  "bot.catalog.group.copper": "Медь",
  "bot.catalog.group.gold": "Золото",
  "bot.catalog.group.redstone": "Редстоун",
  "bot.catalog.group.lapis": "Лазурит",
  "bot.catalog.group.diamond": "Алмазы",
  "bot.catalog.group.emerald": "Изумруды",
  "bot.catalog.group.quartz": "Кварц",

  // bot.storageFilter.valuable
  "bot.storageFilter.valuable.name": "Ценные ресурсы",
  "bot.storageFilter.valuable.description": "Алмазы, изумруды, золото, незерит и редкие предметы",

  // bot.storageFilter.bulk
  "bot.storageFilter.bulk.name": "Массовые блоки и мусор",
  "bot.storageFilter.bulk.description": "Камень, земля, песок, гравий и другие массовые материалы",

  // bot.storageFilter.food
  "bot.storageFilter.food.name": "Еда",
  "bot.storageFilter.food.description": "Продукты и готовая еда",

  // bot.storageFilter.all
  "bot.storageFilter.all.name": "Всё остальное",
  "bot.storageFilter.all.description": "Добыча, для которой нет отдельной группы",

  // bot.storageFilter.wood
  "bot.storageFilter.wood.name": "Всё деревянное",
  "bot.storageFilter.wood.description": "Древесина: брёвна, доски, листва и деревянные изделия",

  // bot.storageFilter.logs
  "bot.storageFilter.logs.name": "Брёвна и стволы",
  "bot.storageFilter.logs.description": "Все породы, включая обтёсанные стволы",

  // bot.storageFilter.leaves
  "bot.storageFilter.leaves.name": "Листва и саженцы",
  "bot.storageFilter.leaves.description": "Все породы деревьев",

  // bot.storageFilter.ores
  "bot.storageFilter.ores.name": "Руды и минералы",
  "bot.storageFilter.ores.description": "Рудные блоки, сырьё, слитки и добытые минералы",

  // bot.storageFilter.stone
  "bot.storageFilter.stone.name": "Камень и породы",
  "bot.storageFilter.stone.description": "Камень, булыжник, глубинный сланец и другие породы",

  // bot.storageFilter.coal
  "bot.storageFilter.coal.name": "Уголь",
  "bot.storageFilter.coal.description": "Уголь, угольные руды и блоки",

  // bot.storageFilter.iron
  "bot.storageFilter.iron.name": "Железо",
  "bot.storageFilter.iron.description": "Руды, сырое железо, слитки и блоки",

  // bot.storageFilter.copper
  "bot.storageFilter.copper.name": "Медь",
  "bot.storageFilter.copper.description": "Руды, сырая медь, слитки и блоки",

  // bot.storageFilter.gold
  "bot.storageFilter.gold.name": "Золото",
  "bot.storageFilter.gold.description": "Руды, сырое золото, слитки и блоки",

  // bot.storageFilter.diamond
  "bot.storageFilter.diamond.name": "Алмазы",
  "bot.storageFilter.diamond.description": "Алмазы, алмазные руды и блоки",

  // bot.storageFilter.emerald
  "bot.storageFilter.emerald.name": "Изумруды",
  "bot.storageFilter.emerald.description": "Изумруды, изумрудные руды и блоки",

  // bot.storageFilter.redstone
  "bot.storageFilter.redstone.name": "Редстоун",
  "bot.storageFilter.redstone.description": "Красная пыль, редстоуновые руды и блоки",

  // bot.storageFilter.lapis
  "bot.storageFilter.lapis.name": "Лазурит",
  "bot.storageFilter.lapis.description": "Лазурит, лазуритовые руды и блоки",

  // bot.storageFilter.quartz
  "bot.storageFilter.quartz.name": "Кварц",
  "bot.storageFilter.quartz.description": "Кварц, кварцевые руды и блоки",

  // bot.storageFilter.netherite
  "bot.storageFilter.netherite.name": "Незерит",
  "bot.storageFilter.netherite.description": "Древние обломки, лом, слитки и блоки",

  // bot.item
  "bot.item.iron": "Железо",
  "bot.item.coal": "Уголь",
  "bot.item.gold": "Золото",
  "bot.item.copper": "Медь",
  "bot.item.diamond": "Алмазы",
  "bot.item.emerald": "Изумруды",
  "bot.item.redstone": "Редстоун",
  "bot.item.lapis": "Лазурит",
  "bot.item.stone": "Камень",
  "bot.item.cobblestone": "Булыжник",
  "bot.item.dirt": "Земля",
  "bot.item.sand": "Песок",
  "bot.item.stick": "Палки",
  "bot.item.raw_iron": "Рудное железо",
  "bot.item.iron_ingot": "Железный слиток",
  "bot.item.iron_pickaxe": "Железная кирка",
  "bot.item.iron_axe": "Железный топор",
  "bot.item.iron_sword": "Железный меч",
  "bot.item.iron_shovel": "Железная лопата",
  "bot.item.wooden_spear": "Деревянное копьё",
  "bot.item.stone_spear": "Каменное копьё",
  "bot.item.iron_spear": "Железное копьё",
  "bot.item.golden_spear": "Золотое копьё",
  "bot.item.diamond_spear": "Алмазное копьё",
  "bot.item.netherite_spear": "Незеритовое копьё",
  "bot.item.crafting_table": "Верстак",
  "bot.item.oak_planks": "Дубовые доски",
  "bot.item.spruce_planks": "Еловые доски",
  "bot.item.birch_planks": "Берёзовые доски",

  // bot.preset.new_farm
  "bot.preset.new_farm.label": "Новый огород",
  "bot.preset.new_farm.description":
    "Заготовить дерево, сделать мотыгу, вспахать и засадить грядки.",
  "bot.preset.new_farm.requires":
    "Запускайте рядом с водой. Нужны семена или овощи для посадки; древесину и мотыгу бот подготовит сам.",

  // bot.preset.farm
  "bot.preset.farm.label": "Уход за огородом",
  "bot.preset.farm.description":
    "Собрать зрелое, пересадить и заполнить пустые грядки за один проход.",
  "bot.preset.farm.requires": "Мотыга и семена у бота; для новой вспашки нужна вода рядом.",

  // bot.preset.harvest
  "bot.preset.harvest.label": "Сбор урожая",
  "bot.preset.harvest.description": "Собрать все зрелые культуры в 8 блоках и пересадить их.",
  "bot.preset.harvest.requires":
    "Зрелые растения рядом; семена для пересадки из инвентаря и урожая.",

  // bot.preset.wheat
  "bot.preset.wheat.label": "Посев пшеницы",
  "bot.preset.wheat.description": "Подготовить грядки и посадить семена пшеницы.",
  "bot.preset.wheat.requires":
    "Запускайте рядом с водой. Нужны семена или овощи для посадки; древесину и мотыгу бот подготовит сам.",

  // bot.preset.carrots
  "bot.preset.carrots.label": "Морковные грядки",
  "bot.preset.carrots.description": "Вспахать землю и посадить морковь из инвентаря.",
  "bot.preset.carrots.requires":
    "Запускайте рядом с водой. Нужны семена или овощи для посадки; древесину и мотыгу бот подготовит сам.",

  // bot.preset.potatoes
  "bot.preset.potatoes.label": "Посадка картофеля",
  "bot.preset.potatoes.description": "Сделать мотыгу, подготовить землю и посадить картофель.",
  "bot.preset.potatoes.requires":
    "Запускайте рядом с водой. Нужны семена или овощи для посадки; древесину и мотыгу бот подготовит сам.",

  // bot.preset.beetroot
  "bot.preset.beetroot.label": "Свекольные грядки",
  "bot.preset.beetroot.description": "Вспахать и засеять свободную землю семенами свёклы.",
  "bot.preset.beetroot.requires":
    "Запускайте рядом с водой. Нужны семена или овощи для посадки; древесину и мотыгу бот подготовит сам.",

  // bot.preset.pumpkins
  "bot.preset.pumpkins.label": "Тыквенная бахча",
  "bot.preset.pumpkins.description": "Посадить тыквы, сохранив рядом место для будущих плодов.",
  "bot.preset.pumpkins.requires":
    "Запускайте рядом с водой. Нужны семена или овощи для посадки; древесину и мотыгу бот подготовит сам.",

  // bot.preset.melons
  "bot.preset.melons.label": "Арбузная бахча",
  "bot.preset.melons.description": "Подготовить и засадить грядки семенами арбуза.",
  "bot.preset.melons.requires":
    "Запускайте рядом с водой. Нужны семена или овощи для посадки; древесину и мотыгу бот подготовит сам.",

  // bot.preset.nether_wart
  "bot.preset.nether_wart.label": "Нарост Незера",
  "bot.preset.nether_wart.description": "Засадить свободный песок душ в радиусе 8 блоков.",
  "bot.preset.nether_wart.requires": "Нарост Незера в инвентаре и подготовленный песок душ рядом.",

  // bot.preset.coal
  "bot.preset.coal.label": "Запас угля",
  "bot.preset.coal.description": "Добыть 32 блока угольной руды и вернуться к старту.",
  "bot.preset.coal.requires": "Деревянная кирка или лучше; загруженная руда в радиусе 32 блоков.",

  // bot.preset.iron_ingots
  "bot.preset.iron_ingots.label": "32 слитка железа",
  "bot.preset.iron_ingots.description": "Добыть уголь и железо, вернуться и переплавить сырьё.",
  "bot.preset.iron_ingots.requires":
    "Каменная кирка или лучше. Печь у места старта; верстак рядом или древесина для его изготовления.",

  // bot.preset.copper_ingots
  "bot.preset.copper_ingots.label": "32 слитка меди",
  "bot.preset.copper_ingots.description":
    "Заготовить топливо и медь, переплавить 32 единицы сырья.",
  "bot.preset.copper_ingots.requires":
    "Каменная кирка или лучше. Печь у места старта; верстак рядом или древесина для его изготовления.",

  // bot.preset.gold_ingots
  "bot.preset.gold_ingots.label": "32 слитка золота",
  "bot.preset.gold_ingots.description": "Добыть уголь и золотую руду, затем переплавить золото.",
  "bot.preset.gold_ingots.requires":
    "Железная кирка или лучше. Печь у места старта; верстак рядом или древесина для его изготовления.",

  // bot.preset.diamonds
  "bot.preset.diamonds.label": "Алмазная вылазка",
  "bot.preset.diamonds.description": "Добыть 8 блоков алмазной руды и вернуться на базу.",
  "bot.preset.diamonds.requires": "Железная кирка или лучше; алмазная руда в загруженных чанках.",

  // bot.preset.building_stone
  "bot.preset.building_stone.label": "Камень для стройки",
  "bot.preset.building_stone.description":
    "Добыть 128 блоков камня и принести полученный булыжник к старту.",
  "bot.preset.building_stone.requires": "Кирка с запасом прочности и свободное место в инвентаре.",

  // bot.preset.starter
  "bot.preset.starter.label": "Деревянный старт",
  "bot.preset.starter.description":
    "Заготовить дерево, сделать верстак и пять деревянных инструментов.",
  "bot.preset.starter.requires": "Деревья в радиусе 16 блоков; верстак бот сделает сам.",

  // bot.preset.stone_tools
  "bot.preset.stone_tools.label": "Каменные инструменты",
  "bot.preset.stone_tools.description":
    "Сделать деревянную кирку, добыть камень и собрать пять инструментов.",
  "bot.preset.stone_tools.requires":
    "Деревья и обычный камень поблизости; кирку бот сначала скрафтит сам.",

  // bot.preset.iron
  "bot.preset.iron.label": "Железные инструменты",
  "bot.preset.iron.description":
    "Добыть топливо, железо и дерево; сделать кирку, топор, меч и лопату.",
  "bot.preset.iron.requires":
    "Каменная кирка или лучше. Печь у места старта; верстак рядом или древесина для его изготовления.",

  // bot.preset.iron_armor
  "bot.preset.iron_armor.label": "Полная железная броня",
  "bot.preset.iron_armor.description": "Добыть и переплавить железо, скрафтить четыре части брони.",
  "bot.preset.iron_armor.requires":
    "Каменная кирка или лучше. Печь у места старта; верстак рядом или древесина для его изготовления.",

  // bot.preset.farmer_gear
  "bot.preset.farmer_gear.label": "Набор фермера",
  "bot.preset.farmer_gear.description":
    "Заготовить ресурсы, сделать железную мотыгу и пустое ведро.",
  "bot.preset.farmer_gear.requires":
    "Каменная кирка или лучше. Печь у места старта; верстак рядом или древесина для его изготовления.",

  // bot.preset.wood
  "bot.preset.wood.label": "Дерево → палки",
  "bot.preset.wood.description": "Срубить 4 бревна и скрафтить 16 палок.",
  "bot.preset.wood.requires": "Деревья в радиусе 16 блоков.",

  // bot.preset.torches
  "bot.preset.torches.label": "64 факела",
  "bot.preset.torches.description": "Заготовить дерево и уголь, вернуться и сделать факелы.",
  "bot.preset.torches.requires": "Кирка для угля; деревья и угольная руда поблизости.",

  // bot.preset.chests
  "bot.preset.chests.label": "8 сундуков",
  "bot.preset.chests.description": "Заготовить 20 брёвен и сделать сундуки для будущего склада.",
  "bot.preset.chests.requires": "Деревья поблизости; сундуки останутся в инвентаре бота.",

  // bot.preset.glass
  "bot.preset.glass.label": "32 блока стекла",
  "bot.preset.glass.description": "Добыть уголь и песок, вернуться и переплавить стекло.",
  "bot.preset.glass.requires":
    "Кирка для угля; песок рядом. Печь у места старта; верстак рядом или древесина для его изготовления.",

  // bot.preset.stone_bricks
  "bot.preset.stone_bricks.label": "32 каменных кирпича",
  "bot.preset.stone_bricks.description":
    "Добыть камень и уголь, обжечь булыжник и скрафтить кирпичи.",
  "bot.preset.stone_bricks.requires":
    "Обычная кирка без «Шёлкового касания». Печь у места старта; верстак рядом или древесина для его изготовления.",

  // bot.preset.furnaces
  "bot.preset.furnaces.label": "4 печи",
  "bot.preset.furnaces.description": "Заготовить дерево и камень, сделать четыре обычные печи.",
  "bot.preset.furnaces.requires": "Кирка без «Шёлкового касания»; деревья и камень поблизости.",

  // bot.preset.bread
  "bot.preset.bread.label": "8 хлеба",
  "bot.preset.bread.description":
    "Заготовить дерево, собрать и пересадить 24 зрелые пшеницы, испечь хлеб.",
  "bot.preset.bread.requires":
    "Не менее 24 зрелых растений пшеницы в радиусе 8 блоков; семена для пересадки.",

  // bot.preset.baked_potatoes
  "bot.preset.baked_potatoes.label": "16 печёных картофелин",
  "bot.preset.baked_potatoes.description":
    "Добыть уголь, собрать и пересадить картофель, затем приготовить его.",
  "bot.preset.baked_potatoes.requires":
    "Кирка для угля, 16 зрелых растений картофеля рядом и печь или коптильня у старта.",

  // bot.preset.harvest_storage
  "bot.preset.harvest_storage.label": "Урожай на склад",
  "bot.preset.harvest_storage.description":
    "Собрать и пересадить зрелые культуры, вернуться и выгрузить добычу.",
  "bot.preset.harvest_storage.requires":
    "Настроенные группы сундуков и подходящие фильтры для урожая.",

  // bot.preset.cleanup
  "bot.preset.cleanup.label": "Уборка территории",
  "bot.preset.cleanup.description": "Подобрать дроп в радиусе 16 блоков и сложить его на склад.",
  "bot.preset.cleanup.requires": "Настроенный склад с подходящими фильтрами и свободным местом.",

  // bot.presetGroup
  "bot.presetGroup.farm": "Огород",
  "bot.presetGroup.mining": "Ресурсы",
  "bot.presetGroup.gear": "Снаряжение",
  "bot.presetGroup.craft": "Крафт и стройка",
  "bot.presetGroup.food": "Еда",
  "bot.presetGroup.storage": "Склад",
  "bot.presetGroup.all": "Все",

  // bot.workflowName
  "bot.workflowName.wood": "Дерево{amount}",
  "bot.workflowName.till": "Вспашка грядок",
  "bot.workflowName.plant": "Посадка семян",
  "bot.workflowName.harvest": "Сбор урожая",
  "bot.workflowName.farm": "Обработка огорода",
  "bot.workflowName.mine": "Добыча: {item}{amount}",
  "bot.workflowName.mineFallback": "блоки",
  "bot.workflowName.craftFallback": "Крафт",
  "bot.workflowName.smelt": "Переплавка: {item}{amount}",
  "bot.workflowName.smeltFallback": "материалы",
  "bot.workflowName.collect": "Сбор предметов",
  "bot.workflowName.deposit": "На склад",
  "bot.workflowName.return": "Возвращение",
  "bot.workflowName.new": "Новый сценарий",

  // placeholderGuide.group
  "placeholderGuide.group.build": "Сборка",
  "placeholderGuide.group.player": "Игрок",
  "placeholderGuide.group.launcher": "Лаунчер",
  "placeholderGuide.group.library": "Библиотека",
  "placeholderGuide.group.bot": "Mineflayer-бот",

  // placeholderValue
  "placeholderValue.empty": "Пустая",
  "placeholderValue.fabric": "Fabric",
  "placeholderValue.forge": "Forge",
  "placeholderValue.microsoft": "Microsoft",
  "placeholderValue.neoforge": "NeoForge",
  "placeholderValue.offline": "Без аккаунта",
  "placeholderValue.official": "Официальный",
  "placeholderValue.imported": "Импортировано",
  "placeholderValue.quilt": "Quilt",
  "placeholderValue.ready": "Готова",
  "placeholderValue.running": "Запущена",
  "placeholderValue.updating": "Обновляется",
  "placeholderValue.vanilla": "Vanilla",
  "placeholderValue.unknown": "Неизвестно",

  // buildCard
  "buildCard.cardAppearance": "ОФОРМЛЕНИЕ КАРТОЧКИ",
  "buildCard.reset": "СБРОСИТЬ",
  "buildCard.save": "СОХРАНИТЬ",
  "buildCard.layout": "Расположение",
  "buildCard.height": "Высота",
  "buildCard.vertical": "По вертикали",
  "buildCard.top": "Сверху",
  "buildCard.center": "По центру",
  "buildCard.bottom": "Снизу",
  "buildCard.grid": "Сетка",
  "buildCard.onEdit": "Вкл · правка",
  "buildCard.offLock": "Выкл · замок",
  "buildCard.positions": "Позиции",
  "buildCard.resetPositions": "СБРОСИТЬ ПОЗИЦИИ",
  "buildCard.sizes": "Размеры",
  "buildCard.resetSizes": "СБРОСИТЬ РАЗМЕРЫ",
  "buildCard.turnOnTheGrid":
    "Включите сетку и выберите любой текст, тег или пин. Перетаскивайте, чтобы переместить, или тяните правый нижний угол, чтобы изменить размер. Позиции привязываются к ячейкам {gridSize}px. Пин виден на закреплённых сборках.",
  "buildCard.turnItOffTo": "Выключи сетку, чтобы продолжить рисование.",

  // buildCardDrawingCanvas
  "buildCardDrawingCanvas.buildCardDrawingCanvas": "Холст для рисования на карточке",
  "buildCardDrawingCanvas.brushColor": "Цвет кисти",
  "buildCardDrawingCanvas.brushSize": "Размер кисти",
  "buildCardDrawingCanvas.undo": "Отменить",
  "buildCardDrawingCanvas.clear": "Очистить",

  // buildCardEditorBackground
  "buildCardEditorBackground.fitWholeImage": "ВСЯ КАРТИНКА",
  "buildCardEditorBackground.fillCard": "ЗАПОЛНИТЬ КАРТОЧКУ",
  "buildCardEditorBackground.fit": "Вписать",
  "buildCardEditorBackground.imageFit": "ВПИСЫВАНИЕ",
  "buildCardEditorBackground.opacity": "Прозрачность",
  "buildCardEditorBackground.background": "Фон",
  "buildCardEditorBackground.type": "Тип",
  "buildCardEditorBackground.color": "Цвет",
  "buildCardEditorBackground.image": "Картинка",
  "buildCardEditorBackground.draw": "Рисунок",
  "buildCardEditorBackground.source": "Источник",
  "buildCardEditorBackground.changeImage": "СМЕНИТЬ КАРТИНКУ",
  "buildCardEditorBackground.uploadImage": "ЗАГРУЗИТЬ КАРТИНКУ",
  "buildCardEditorBackground.clearImage": "УБРАТЬ КАРТИНКУ",
  "buildCardEditorBackground.canvas": "Холст",
  "buildCardEditorBackground.drawDirectlyOnThe":
    "Рисуй прямо на холсте карточки. Цвет и размер кисти выбираются слева.",

  // buildCardEditorBadge
  "buildCardEditorBadge.badge": "Значок",
  "buildCardEditorBadge.visible": "Видимость",
  "buildCardEditorBadge.always": "Всегда",
  "buildCardEditorBadge.text": "Текст",
  "buildCardEditorBadge.bgColor": "Цвет фона",
  "buildCardEditorBadge.textColor": "Цвет текста",

  // buildCardEditorContent
  "buildCardEditorContent.tag": "Тег",
  "buildCardEditorContent.text": "Текст",
  "buildCardEditorContent.tagPlaceholder": "Плейсхолдер тега",
  "buildCardEditorContent.textPlaceholder": "Плейсхолдер текста",
  "buildCardEditorContent.deleteTag": "Удалить тег",
  "buildCardEditorContent.size": "Размер",
  "buildCardEditorContent.border": "Рамка",
  "buildCardEditorContent.stroke": "Обводка",
  "buildCardEditorContent.fill": "Заливка",
  "buildCardEditorContent.fill2": "Заливка %",
  "buildCardEditorContent.text2": "Текст %",
  "buildCardEditorContent.content": "Содержимое",
  "buildCardEditorContent.mode": "Режим",
  "buildCardEditorContent.plainText": "Простой текст",
  "buildCardEditorContent.tags": "Теги",
  "buildCardEditorContent.align": "Выравнивание",
  "buildCardEditorContent.left": "Слева",
  "buildCardEditorContent.center": "По центру",
  "buildCardEditorContent.right": "Справа",
  "buildCardEditorContent.textOutline": "ОБВОДКА ТЕКСТА",
  "buildCardEditorContent.drawAStrokeAround":
    "Рисует обводку вокруг плейсхолдеров в простом тексте.",
  "buildCardEditorContent.addATagTo":
    "Добавьте тег, чтобы показать плейсхолдеры сборки в области содержимого карточки.",
  "buildCardEditorContent.addTag": "Добавить тег",

  // buildCardResizeHandle
  "buildCardResizeHandle.resizeElement": "Изменить размер элемента",
  "buildCardResizeHandle.dragToResizeArrow":
    "Тяните, чтобы изменить размер · стрелки — точная подстройка",

  // buildCardSettingsPopup
  "buildCardSettingsPopup.newBuildSettings": "НАСТРОЙКИ НОВОЙ СБОРКИ",
  "buildCardSettingsPopup.buildSettings": "НАСТРОЙКИ СБОРКИ",
  "buildCardSettingsPopup.buildSettingsSections": "Разделы настроек сборки",
  "buildCardSettingsPopup.card": "КАРТОЧКА",
  "buildCardSettingsPopup.reset": "СБРОСИТЬ",
  "buildCardSettingsPopup.save": "СОХРАНИТЬ",

  // buildPlaceholderCaseControl
  "buildPlaceholderCaseControl.placeholderOutputCase": "Регистр значения плейсхолдера",
  "buildPlaceholderCaseControl.forceTheResolvedPlaceholder":
    "Всегда выводить значение заглавными буквами",
  "buildPlaceholderCaseControl.keepTheResolvedPlaceholder": "Выводить значение как есть",
  "buildPlaceholderCaseControl.uppercase": "ЗАГЛАВНЫЕ",
  "buildPlaceholderCaseControl.asValue": "КАК ЕСТЬ",
  "buildPlaceholderCaseControl.mixedCase": "СМЕШАННЫЙ РЕГИСТР",

  // colorPicker
  "colorPicker.saturationBrightnessUseArrow":
    "Насыщенность {saturationPercent}%, яркость {brightnessPercent}%. Стрелки меняют значение.",
  "colorPicker.pickColorFromScreen": "Взять цвет с экрана",
  "colorPicker.selectedColor": "Выбранный цвет {previewColor}",
  "colorPicker.hue": "Оттенок",

  // inlineDropdown
  "inlineDropdown.noIris": "БЕЗ IRIS",

  // installProgress
  "installProgress.buildTask": "ЗАДАЧА СБОРКИ",
  "installProgress.minimize": "Свернуть",
  "installProgress.currentStep": "ТЕКУЩИЙ ШАГ",
  "installProgress.waitingForBuildTask": "ОЖИДАНИЕ ЗАДАЧИ",

  // launcherGuideScenes
  "launcherGuideScenes.name": "ИМЯ",
  "launcherGuideScenes.movement": "ДВИЖЕНИЕ",

  // minecraftSkinPreview
  "minecraftSkinPreview.noSkinData": "НЕТ ДАННЫХ СКИНА",

  // numberStepperArrows
  "numberStepperArrows.increaseValue": "Увеличить",
  "numberStepperArrows.decreaseValue": "Уменьшить",
} as const satisfies Record<string, string | RussianPlural>;

export type RussianMessages = typeof ru;
