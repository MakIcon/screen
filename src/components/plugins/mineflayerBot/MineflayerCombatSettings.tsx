import { useEffect, useState } from "react";
import type { MineflayerCombatSettings } from "../../../types";
import { CustomNumberInput } from "../../inputs/CustomNumberInput";
import { ElementSlider } from "../../inputs/ElementSlider";
import { ElementToggle } from "../../inputs/ElementToggle";
import { InlineDropdown } from "../../inputs/InlineDropdown";
import { DEFAULT_MINEFLAYER_COMBAT_SETTINGS } from "../pluginSettings";

type Props = {
  settings: MineflayerCombatSettings;
  onChange: (settings: MineflayerCombatSettings) => void;
  commandPrefix: string;
};

const PRESETS: Array<{ label: string; patch: Partial<MineflayerCombatSettings> }> = [
  {
    label: "НОВИЧОК",
    patch: {
      meleeSkill: 35,
      reactionMs: 1000,
      cps: 5,
      strafe: "off",
      criticals: "off",
      sprintTap: "off",
      shield: false,
      shieldBreak: false,
      smoothAimSpeed: 50,
      bowAccuracy: 35,
      bowPredict: false,
      bowIntervalMs: 3000,
    },
  },
  {
    label: "ОБЫЧНЫЙ",
    patch: {
      meleeSkill: 80,
      reactionMs: 250,
      cps: 12,
      strafe: "intelligent",
      criticals: "hop",
      sprintTap: "wtap",
      shield: true,
      shieldBreak: true,
      smoothAimSpeed: 100,
      bowAccuracy: 90,
      bowPredict: true,
      bowIntervalMs: 1500,
    },
  },
  {
    label: "ЭКСПЕРТ",
    patch: {
      meleeSkill: 100,
      reactionMs: 0,
      smoothAimSpeed: 175,
      cps: 20,
      strafe: "intelligent",
      criticals: "shorthop",
      sprintTap: "wtap",
      shield: true,
      shieldBreak: true,
      bowAccuracy: 100,
      bowPredict: true,
      bowIntervalMs: 1200,
    },
  },
];

export function MineflayerCombatSettingsEditor({ settings, onChange, commandPrefix }: Props) {
  const [openDropdown, setOpenDropdown] = useState<keyof MineflayerCombatSettings | null>(null);
  useEffect(() => {
    const closeMenu = () => setOpenDropdown(null);
    const escapeMenu = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", escapeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", escapeMenu);
    };
  }, []);
  const update = (patch: Partial<MineflayerCombatSettings>) => onChange({ ...settings, ...patch });
  const choice = <K extends keyof MineflayerCombatSettings>(
    key: K,
    label: string,
    values: Array<[MineflayerCombatSettings[K], string]>,
    disabled = false,
  ) => {
    const unavailable =
      disabled || !settings.enabled || (key === "bowEngine" && !settings.bowEnabled);
    return (
      <fieldset className="mineflayer-bot-choice" key={key} disabled={unavailable}>
        <InlineDropdown
          label={label}
          value={values.find(([value]) => value === settings[key])?.[1] ?? ""}
          options={values.map(([, title]) => title)}
          isOpen={!unavailable && openDropdown === key}
          onToggle={() => setOpenDropdown(openDropdown === key ? null : key)}
          onSelect={(title) => {
            const selected = values.find(([, option]) => option === title);
            if (selected && !unavailable) update({ [key]: selected[0] });
            setOpenDropdown(null);
          }}
        />
      </fieldset>
    );
  };
  const number = (
    key: keyof MineflayerCombatSettings,
    label: string,
    min: number,
    max: number,
    step = 1,
  ) => (
    <label className="mineflayer-bot-field" key={key}>
      <span>{label}</span>
      <CustomNumberInput
        ariaLabel={label}
        background="transparent"
        min={min}
        max={max}
        step={step}
        value={Number(settings[key])}
        onChange={(value) => update({ [key]: value })}
      />
    </label>
  );
  const toggle = (key: keyof MineflayerCombatSettings, label: string, description: string) => (
    <ElementToggle
      key={key}
      size="small"
      title={label}
      note={description}
      enabled={Boolean(settings[key])}
      onToggle={() => update({ [key]: !settings[key] })}
    />
  );
  const skill = (key: "meleeSkill" | "bowAccuracy", label: string) => (
    <ElementSlider
      className="mineflayer-bot-slider"
      label={label}
      min={0}
      max={100}
      step={1}
      value={settings[key]}
      defaultValue={DEFAULT_MINEFLAYER_COMBAT_SETTINGS[key]}
      showDefaultMarker
      valueEditable
      showValueBorder={false}
      valueBackground="transparent"
      tickMode="custom"
      customTicks={[0, 25, 50, 75, 100]}
      disabled={!settings.enabled || (key === "bowAccuracy" && !settings.bowEnabled)}
      onChange={(value) => update({ [key]: value })}
    />
  );

  return (
    <>
      <div className="mineflayer-bot-toggle-grid">
        {toggle("enabled", "ВКЛЮЧИТЬ PVP", "БОЙ ПО КОМАНДЕ ВЛАДЕЛЬЦА")}
      </div>
      <fieldset className="mineflayer-bot-combat-fields" disabled={!settings.enabled}>
        <div className="mineflayer-bot-subhead">
          <span>УРОВЕНЬ БОТА</span>
          <small>МЕЧ И ЛУК</small>
        </div>
        <div className="mineflayer-bot-presets">
          {PRESETS.map((preset) => (
            <button type="button" key={preset.label} onClick={() => update(preset.patch)}>
              {preset.label}
            </button>
          ))}
        </div>
        <div className="mineflayer-bot-grid">
          {choice("style", "ТАКТИКА", [
            ["auto", "Лук вдали, меч вблизи"],
            ["melee", "Только ближний бой"],
            ["ranged", "Только лук"],
            ["crystal", "Кристаллы Края"],
          ])}
          {choice("autoTarget", "ВЫБОР ЦЕЛИ", [
            ["manual", "Только по команде"],
            ["hostile", "Авто: враждебные мобы"],
          ])}
          {number("targetRange", "ДАЛЬНОСТЬ ПОИСКА / ПРЕСЛЕДОВАНИЯ", 4, 128)}
          {number("reactionMs", "РЕАКЦИЯ, МС", 0, 3000)}
        </div>
        <div className="mineflayer-bot-subhead">
          <span>БЛИЖНИЙ БОЙ</span>
          <small>ОРУЖИЕ И ДВИЖЕНИЕ</small>
        </div>
        <div className="mineflayer-bot-grid">
          {choice("engine", "ДВИЖОК БОЯ", [
            ["custom", "Custom PvP — тактики и криты"],
            ["basic", "Mineflayer PvP — базовый бой"],
          ])}
          {choice("weapon", "ОРУЖИЕ", [
            ["sword", "Меч"],
            ["axe", "Топор"],
          ])}
          {skill("meleeSkill", "НАВЫК БЛИЖНЕГО БОЯ")}
          {number("cps", "МАКСИМУМ УДАРОВ В СЕКУНДУ", 1, 20)}
          {number("attackRange", "ДИСТАНЦИЯ УДАРА, БЛОКИ", 1, 3, 0.1)}
          {choice(
            "strafe",
            "СТРЕЙФ",
            [
              ["off", "Выключен"],
              ["intelligent", "Умный"],
              ["circle", "По кругу"],
              ["random", "Случайный"],
            ],
            settings.engine !== "custom",
          )}
          {choice(
            "criticals",
            "КРИТИЧЕСКИЕ УДАРЫ",
            [
              ["off", "Выключены"],
              ["hop", "Прыжок"],
              ["shorthop", "Короткий прыжок"],
            ],
            settings.engine !== "custom",
          )}
          {choice(
            "sprintTap",
            "СБРОС СПРИНТА",
            [
              ["off", "Выключен"],
              ["wtap", "W-tap"],
              ["stap", "S-tap"],
              ["sprintcancel", "Сброс спринта"],
            ],
            settings.engine !== "custom",
          )}
        </div>
        <p className="mineflayer-bot-combat-note">
          Низкий навык добавляет пропуски ударов. Скорость атаки также ограничена перезарядкой
          оружия в вашей версии Minecraft. Стрейфы, криты, сброс спринта и пробивание щита работают
          в Custom PvP.
        </p>
        <div className="mineflayer-bot-toggle-grid">
          {toggle("shield", "ИСПОЛЬЗОВАТЬ ЩИТ", "В ИНВЕНТАРЕ ИЛИ ЛЕВОЙ РУКЕ")}
          {toggle("shieldBreak", "ПРОБИВАТЬ ЩИТ", "ПЕРЕКЛЮЧАТЬСЯ НА ТОПОР")}
          {toggle(
            "bowDefense",
            "РАСПОЗНАВАТЬ ПРИЦЕЛИВАНИЕ ИЗ ЛУКА",
            "ЩИТ В СТОРОНУ СТРЕЛКА И ВХОДЯЩЕЙ СТРЕЛЫ",
          )}
          {toggle("smoothAim", "ПЛАВНОЕ НАВЕДЕНИЕ", "ПОВОРОТ К ЦЕЛИ ПЕРЕД УДАРОМ И ВЫСТРЕЛОМ")}
        </div>
        <fieldset className="mineflayer-bot-combat-fields" disabled={!settings.smoothAim}>
          <ElementSlider
            className="mineflayer-bot-slider"
            label="СКОРОСТЬ НАВЕДЕНИЯ"
            min={10}
            max={300}
            step={1}
            value={settings.smoothAimSpeed}
            defaultValue={DEFAULT_MINEFLAYER_COMBAT_SETTINGS.smoothAimSpeed}
            showDefaultMarker
            valueEditable
            showValueBorder={false}
            valueBackground="transparent"
            tickMode="custom"
            customTicks={[10, 50, 100, 150, 200, 250, 300]}
            disabled={!settings.enabled || !settings.smoothAim}
            onChange={(value) => update({ smoothAimSpeed: value })}
          />
          <p className="mineflayer-bot-combat-note">
            100% — обычная скорость поворота головы. 50% — вдвое медленнее, 200% — вдвое быстрее.
            Применяется к мечу и луку, когда включено плавное наведение.
          </p>
        </fieldset>
        <div className="mineflayer-bot-subhead">
          <span>СТРЕЛЬБА ИЗ ЛУКА</span>
          <small>ПРИЦЕЛ И ТЕМП</small>
        </div>
        <fieldset className="mineflayer-bot-combat-fields" disabled={!settings.bowDefense}>
          <div className="mineflayer-bot-grid">
            {choice("bowDefenseMode", "РАСПОЗНАВАНИЕ ПРИЦЕЛА", [
              ["early", "Раннее распознавание"],
              ["trajectory", "По траектории стрелы"],
            ])}
            {number("bowDefenseCheckMs", "ИНТЕРВАЛ ПРОВЕРКИ, МС", 0, 500, 50)}
            {number("bowDefenseRange", "ДАЛЬНОСТЬ РАСПОЗНАВАНИЯ, БЛОКИ", 4, 128)}
            {number("bowDefenseMargin", "ЗАПАС ЧУВСТВИТЕЛЬНОСТИ, БЛОКИ", 0, 2, 0.05)}
            {number("bowDefenseHoldMs", "УДЕРЖАНИЕ ЩИТА ПОСЛЕ УГРОЗЫ, МС", 100, 2000, 50)}
          </div>
          <div className="mineflayer-bot-toggle-grid">
            {toggle(
              "bowDefenseRequireDraw",
              "ТОЛЬКО ПРИ НАТЯЖЕНИИ ЛУКА",
              "НЕ РЕАГИРОВАТЬ НА ЛУК, ПРОСТО ВЗЯТЫЙ В РУКИ",
            )}
          </div>
          <p className="mineflayer-bot-combat-note">
            Ранний режим замечает направление прицела при натяжении. Режим траектории проверяет
            полёт с разной силой выстрела. Больший запас чувствительности даёт более раннюю защиту.
            Повороты и натяжение проверяются сразу при обновлении игрока сервером.
          </p>
        </fieldset>
        <div className="mineflayer-bot-toggle-grid">
          {toggle("bowEnabled", "ИСПОЛЬЗОВАТЬ ЛУК", "НУЖНЫ ЛУК И СТРЕЛЫ")}
        </div>
        <fieldset className="mineflayer-bot-combat-fields" disabled={!settings.bowEnabled}>
          <div className="mineflayer-bot-grid">
            {choice("bowEngine", "РАСЧЁТ ТРАЕКТОРИИ", [
              ["custom", "Custom PvP"],
              ["hawkeye", "Minecraft HawkEye"],
            ])}
            {skill("bowAccuracy", "ТОЧНОСТЬ ПРИЦЕЛА")}
            {number("bowRange", "ДАЛЬНОСТЬ ЛУКА, БЛОКИ", 4, 120)}
            {number("bowIntervalMs", "ИНТЕРВАЛ ВЫСТРЕЛОВ, МС", 1200, 10000, 100)}
          </div>
          <div className="mineflayer-bot-toggle-grid">
            {toggle("bowPredict", "УПРЕЖДЕНИЕ", "УЧИТЫВАТЬ ДВИЖЕНИЕ ЦЕЛИ")}
            {toggle("bowOffhand", "ЛУК В ЛЕВОЙ РУКЕ", "В ВЕРСИЯХ СО ВТОРОЙ РУКОЙ")}
            {toggle("meleeFallback", "ПЕРЕХОДИТЬ НА МЕЧ", "КОГДА НЕТ ЛУКА ИЛИ СТРЕЛ")}
          </div>
        </fieldset>
        <p className="mineflayer-bot-combat-note">
          Точность задаёт разброс прицела: 100% убирает добавленный разброс. Попадание зависит от
          движения цели и сервера. Автовыбор атакует только враждебных мобов. Командой с ником можно
          вызвать на бой любого игрока, включая владельца.
        </p>
        <div className="mineflayer-bot-subhead">
          <span>AUTO CRYSTAL</span>
          <small>ПОЗИЦИЯ И УРОН</small>
        </div>
        <div className="mineflayer-bot-toggle-grid">
          {toggle(
            "crystalEnabled",
            "ИСПОЛЬЗОВАТЬ КРИСТАЛЛЫ КРАЯ",
            "В АВТОТАКТИКЕ И ПО КОМАНДЕ CRYSTAL",
          )}
        </div>
        <fieldset className="mineflayer-bot-combat-fields" disabled={!settings.crystalEnabled}>
          <div className="mineflayer-bot-toggle-grid">
            {toggle(
              "crystalPlace",
              "СТАВИТЬ КРИСТАЛЛЫ",
              "НА ОБСИДИАН И БЕДРОК В ПРЕДЕЛАХ ДОСЯГАЕМОСТИ",
            )}
            {toggle("crystalBreak", "ВЗРЫВАТЬ КРИСТАЛЛЫ", "С УЧЁТОМ УРОНА И ЦЕПНЫХ ВЗРЫВОВ")}
            {toggle("crystalBuildBase", "СТРОИТЬ ОСНОВУ", "СТАВИТЬ ОБСИДИАН ИЗ ИНВЕНТАРЯ")}
            {toggle("crystalCover", "ЗАЩИТНЫЙ БЛОК", "ПЕРЕД ВЗРЫВОМ УМЕНЬШАТЬ УРОН СЕБЕ")}
            {toggle(
              "crystalFastAim",
              "БЫСТРОЕ НАВЕДЕНИЕ КРИСТАЛЛОВ",
              "ПОВОРАЧИВАТЬСЯ БЕЗ ОЖИДАНИЯ ПЛАВНОЙ АНИМАЦИИ",
            )}
            {toggle(
              "crystalPredict",
              "ПРОГНОЗ ДВИЖЕНИЯ ЦЕЛИ",
              "ПРОВЕРЯТЬ ТЕКУЩУЮ И БУДУЩУЮ ПОЗИЦИЮ",
            )}
            {toggle("crystalProtectOwners", "БЕРЕЧЬ ДРУГИХ ВЛАДЕЛЬЦЕВ", "НЕ ВЗРЫВАТЬ РЯДОМ С НИМИ")}
          </div>
          <div className="mineflayer-bot-grid">
            {choice("crystalPriority", "ВЫБОР ПОЗИЦИИ", [
              ["damage", "Больше урона"],
              ["closest", "Ближе к боту"],
            ])}
            {choice("crystalCoverBlock", "БЛОК ДЛЯ ЗАЩИТЫ", [
              ["auto", "Автоматически"],
              ["obsidian", "Обсидиан"],
              ["planks", "Доски"],
              ["cobblestone", "Булыжник"],
            ])}
            {number("crystalPlaceRange", "ДАЛЬНОСТЬ УСТАНОВКИ, БЛОКИ", 1, 4.5, 0.1)}
            {number("crystalBreakRange", "ДАЛЬНОСТЬ РАЗРУШЕНИЯ, БЛОКИ", 1, 4.5, 0.1)}
            {number("crystalIntervalMs", "ИНТЕРВАЛ ДЕЙСТВИЙ, МС", 100, 5000, 50)}
            {number("crystalMaxCoverBlocks", "МАКСИМУМ БЛОКОВ УКРЫТИЯ", 0, 4)}
            {number("crystalSpawnTimeoutMs", "ОЖИДАНИЕ КРИСТАЛЛА ОТ СЕРВЕРА, МС", 300, 5000, 100)}
            {number("crystalRetries", "ПОПЫТОК УСТАНОВКИ КРИСТАЛЛА", 1, 5)}
            {number("crystalMinDamage", "МИНИМАЛЬНЫЙ УРОН ЦЕЛИ, HP", 0, 100)}
            {number("crystalMaxSelfDamage", "МАКСИМАЛЬНЫЙ УРОН СЕБЕ, HP", 0, 20)}
            {number("crystalMinHealth", "ОСТАВИТЬ ЗДОРОВЬЕ, HP", 1, 20)}
            {number("crystalPredictionTicks", "ПРОГНОЗ НА ТИКОВ ВПЕРЁД", 0, 10)}
          </div>
          <p className="mineflayer-bot-combat-note">
            Нужны кристаллы и свободное место над обсидианом или бедроком. Бот проверяет
            препятствия, занятые позиции и урон до действия, ждёт подтверждения сервера и
            ограничивает повторные попытки. Оценка урона учитывает броню и защитные блоки. 2 HP
            равны одному сердцу.
          </p>
        </fieldset>
      </fieldset>
      <div className="mineflayer-bot-subhead">
        <span>ЭНДЕР-ЖЕМЧУГ</span>
        <small>ПЕРЕМЕЩЕНИЕ</small>
      </div>
      <div className="mineflayer-bot-toggle-grid">
        {toggle("pearlEnabled", "РАЗРЕШИТЬ ПЕРЕМЕЩЕНИЕ ЖЕМЧУГОМ", "РАБОТАЕТ И ПРИ ВЫКЛЮЧЕННОМ PVP")}
      </div>
      <fieldset className="mineflayer-bot-combat-fields" disabled={!settings.pearlEnabled}>
        <div className="mineflayer-bot-toggle-grid">
          {toggle("pearlFollow", "ЖЕМЧУГ ДЛЯ FOLLOW", "СОКРАЩАТЬ ПУТЬ ЗА ИГРОКОМ")}
          {toggle("pearlCome", "ЖЕМЧУГ ДЛЯ COME", "СОКРАЩАТЬ ПУТЬ К ИГРОКУ")}
          {toggle("pearlGoto", "ЖЕМЧУГ ДЛЯ GOTO", "ИСПОЛЬЗОВАТЬ НА ПУТИ К КООРДИНАТАМ")}
          {toggle(
            "pearlChain",
            "ПОВТОРНЫЕ БРОСКИ",
            "ПОСЛЕ ТЕЛЕПОРТАЦИИ РАССЧИТАТЬ СЛЕДУЮЩИЙ УЧАСТОК",
          )}
        </div>
        <div className="mineflayer-bot-grid">
          {number("pearlMinDistance", "МИНИМАЛЬНОЕ СОКРАЩЕНИЕ ПУТИ, БЛОКИ", 4, 64)}
          {number("pearlMaxDistance", "МАКСИМАЛЬНАЯ ДАЛЬНОСТЬ БРОСКА, БЛОКИ", 8, 64)}
          {number("pearlCooldownMs", "ПЕРЕРЫВ МЕЖДУ БРОСКАМИ, МС", 1000, 10000, 100)}
          {number("pearlMinHealth", "МИНИМУМ ЗДОРОВЬЯ ДО БРОСКА, HP", 6, 20)}
          {number("pearlReserve", "ОСТАВИТЬ ЖЕМЧУГА В ЗАПАСЕ", 0, 64)}
        </div>
        <p className="mineflayer-bot-combat-note">
          Расчёт учитывает скорость бота, гравитацию, сопротивление воздуха и столкновения. Бросок
          разрешён только на загруженную твёрдую поверхность с местом для бота. При нехватке
          жемчуга, здоровья или безопасных траекторий бот идёт пешком. После броска ждёт
          телепортации. Жемчуг обычно отнимает 5 HP.
        </p>
      </fieldset>
      <div className="mineflayer-bot-command-list">
        {[
          "attack player",
          "bow player",
          "crystal player",
          "pvp auto",
          "pvp stop",
          "pvp status",
        ].map((command) => (
          <span key={command}>
            {commandPrefix}
            {command}
          </span>
        ))}
      </div>
      <p className="mineflayer-bot-combat-note">
        Вместо player можно указать nearest для ближайшего враждебного моба. Команды движения и{" "}
        {commandPrefix}stop прекращают бой. Настройки применяются при следующем запуске бота.
      </p>
    </>
  );
}
