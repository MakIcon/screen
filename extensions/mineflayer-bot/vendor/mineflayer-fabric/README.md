# mineflayer-fabric

Клиентская часть сетевого протокола **Fabric** для Mineflayer и
`minecraft-protocol` — по форме аналог `minecraft-protocol-forge`.

Одна строка `attachFabric(bot)` — и бот:

- заходит на **Fabric-серверы всех поколений Fabric API: от 1.14 до 26.x**,
  включая серверы 1.21.4+, которые выкидывают обычный Mineflayer с
  «This server requires Fabric Loader and Fabric API installed on your client!»;
- получает синхронизацию реестров и **сам подстраивает данные Mineflayer**:
  модовые блоки, предметы, сущности, эффекты, звуки получают заглушки,
  перенумерованные ванильные ID исправляются, модовые меню открываются как окна;
- на **обычных серверах любых версий (1.8 – 26.1)** — vanilla, Paper, Spigot,
  BungeeCord/Velocity — ведёт себя как чистый Mineflayer и не объявляет
  Fabric-каналов (античиты не видят «модового клиента»).

Версия определяется автоматически, как в Mineflayer. Папка сервера, `.jar` и
доступ к `mods` не нужны. **Это сетевой клиент Fabric, а не загрузчик Java-модов**:
логику модов бот не исполняет (см. «Границы»).

В 0.2.1 геометрия заглушек сохраняется при загрузке плагинов навигации и
повторном создании `prismarine-block`. Отключение и ошибки восстанавливают
исходные таблицы; незавершённые адаптеры и меню старого соединения отбрасываются.

## Поддержка

| Версия Minecraft | Fabric API делает | Что делает библиотека |
|---|---|---|
| 1.8 – 1.13.2 | (Fabric нет) | Молчит; обычный Mineflayer, включая каналы `REGISTER`/`MC\|Brand` |
| 1.14 – 1.16.5 | Login-запрос early registration; в PLAY — реестры в NBT (`fabric:registry/sync`) | Отвечает на запрос, разбирает NBT, адаптирует данные |
| 1.17 – 1.19.4 | Как выше; если клиент объявил канал — `fabric:registry/sync/direct` частями | Объявляет канал в login, собирает части до пустого терминатора |
| 1.20.1 | Только `fabric:registry/sync/direct` в PLAY | То же; подтверждение не требуется |
| 1.20.2 – 1.21.3 | Фаза configuration: `minecraft:register`, ping `0xFAB71C`, `sync/direct`, `c:version`, `c:register` | Регистрация до pong, сборка, ACK `fabric:registry/sync/complete` |
| 1.21.4 – 1.21.10 | + байт атрибутов реестра; **кик клиентов без Fabric** | Формат определяется автоматически; бот проходит |
| 1.21.11 – 26.x | `fabric:registry/sync` одним сообщением, большие — через `fabric:split` (есть с ветки 1.21.8) | Сборка `fabric:split` в configuration и PLAY |

Поведение выбирается по фазе протокола (login / configuration / play), а не по
таблице версий, поэтому промежуточные и будущие версии с тем же обменом тоже
работают. Повторная configuration (переход между серверами через Velocity)
сбрасывает реестры и возвращает ванильные данные Mineflayer.

## Быстрый запуск

Нужен Node.js 22 или новее.

```powershell
cd D:\JBProjects\WBS\mineflayer-fabric
npm ci
$env:MC_HOST = "localhost"
$env:MC_PORT = "25565"
$env:MC_USERNAME = "FABRIC_BOT"
npm run example
```

Для лицензионного сервера: `$env:MC_AUTH = "microsoft"`. Явная версия:
`$env:MC_VERSION = "1.20.1"`. Пример печатает этапы, отчёт об адаптации и
сохраняет `registry-dump.json`.

## Подключение к боту

```powershell
npm install mineflayer minecraft-protocol "D:/JBProjects/WBS/mineflayer-fabric"
```

```js
const mineflayer = require('mineflayer')
const { attachFabric } = require('mineflayer-fabric')

const bot = mineflayer.createBot({
  host: 'localhost', port: 25565, username: 'BOT', auth: 'offline', version: false
})
// Сразу после createBot — до login/spawn (нужно для login-запроса Fabric 1.14–1.20.1).
const fabric = attachFabric(bot)
fabric.on('warning', warning => console.warn(warning.code, warning.message))
bot.on('spawn', () => console.log(fabric.detected ? 'Fabric, эпоха ' + fabric.era : 'обычный сервер'))
```

Также: `createFabricBot(botOptions, fabricOptions)` или
`bot.loadPlugin(fabricPlugin(fabricOptions))` (плагин подключается позже,
поэтому для серверов 1.14–1.20.1 предпочтительнее первые два варианта).

Без Mineflayer:

```js
const { createFabricClient } = require('mineflayer-fabric')
const client = createFabricClient({ host: 'localhost', username: 'PROBE', auth: 'offline', version: false })
client.fabric.on('synced', () => console.log(client.fabric.snapshot()))
```

Аналог Forge API: `fabricHandshake(client, options)` сразу после
`minecraft-protocol.createClient(options)`.

## Модовый контент в Mineflayer

Синхронизация реестров передаёт **имена и числовые ID**. По умолчанию
(`registryValidation: 'adapt'`) библиотека строит для бота собственные таблицы:

- модовые предметы, сущности, эффекты, зачарования (до 1.21), звуки, частицы —
  заглушки с полным именем (`bot.registry.itemsByName['create:wrench']`) и
  `modded: true`;
- ванильные записи с другим ID на сервере перенумеровываются по серверу;
- блоки: состояния ванильных блоков считаются точно; состояния модовых блоков
  неизвестны, поэтому всё начиная с первого такого блока считается твёрдым
  блоком `fabric:unknown_block` (бот не провалится сквозь модовый пол);
- модовое меню (`open_window` с ID из `minecraft:menu`) открывается как обычное
  окно с числом слотов из пришедшего содержимого. Обычный Mineflayer на нём
  выдаёт ошибку `Cannot read properties of null` и окно не открывает.

Общие объекты `minecraft-data` не изменяются: несколько ботов в одном процессе
на разных серверах не мешают друг другу.

Точные данные модовых блоков можно описать в `modData`:

```js
attachFabric(bot, {
  modData: {
    blocks: {
      'examplemod:machine': {
        states: [{ name: 'facing', type: 'enum', num_values: 4, values: ['north', 'south', 'west', 'east'] }],
        hardness: 3.5
      },
      'examplemod:cable': { stateCount: 64, boundingBox: 'empty', transparent: true }
    },
    items: { 'examplemod:wrench': { stackSize: 1 } }
  }
})
```

Описанные блоки получают точные диапазоны состояний и свойства
(`block.getProperties()`); точное сопоставление продолжается до первого
неописанного блока. См. `examples/mod-data.js`.

Режимы `registryValidation`: `'adapt'` (по умолчанию), `'strict'` (или старое
`'vanilla'`) — отказ с `FABRIC_REGISTRY_INCOMPATIBLE` при модовом контенте,
`'none'` — данные Mineflayer не трогаются.

## Настройки

| Настройка | По умолчанию | Назначение |
|---|---|---|
| `registryValidation` | `'adapt'` | См. выше (только для бота) |
| `modData` | `{}` | Описания модовых `blocks`, `items`, `entities`, `effects`, `sounds`… |
| `unknownBlock` | твёрдый куб | Поля блока-заглушки для неизвестных состояний |
| `announce` | `'auto'` | `'auto'` — объявлять Fabric только Fabric-серверу; `'always'` — всегда |
| `earlyRegistration` | `true` | Отвечать на login-запрос Fabric API 1.14–1.20.1 |
| `brand` | `mineflayer-fabric` | Brand в configuration-фазе Fabric-сервера |
| `timeout` | `30000` | Срок обмена с обнаруженным Fabric-сервером, мс; `0` — выключить |
| `maxPayloadBytes` | `16777216` | Предел входящего/собранного payload |
| `maxRegistryEntries` | `1000000` | Суммарный предел записей реестров |
| `onRegistry(sync, fabric)` | — | Свой валидатор/адаптер; выполняется до ACK |
| `handlers.configuration` / `handlers.play` | `{}` | `channel: (Buffer, fabric) => void/Promise` |
| `handleConfigurationPing` | авто | До `inject_allowed` ping configuration-фазы отвечает библиотека |

## API и события

Свойства соединения (`bot.fabric`): `detected` (сервер показал Fabric),
`era` (`'play'` для 1.14–1.20.1, `'configuration'` для 1.20.2+), `synced`,
`registry`, `serverChannels`, `adaptation` (отчёт), `protocolVersion`.
Методы: `send(channel, Buffer)`, `snapshot()`, `dispose()`.

```js
const menu = bot.fabric.registry.registries.get('minecraft:menu')
const id = menu?.entries.get('creativecore:container')
```

События: `registered(channels, phase)`, `registry(sync)`, `adapted(report)`,
`synced(sync)`, `ready({ detected, synced, era })` (переход в PLAY, ещё не
`spawn`), `configuration`, `channels`, `unhandledPayload`, `warning`,
`failure(error)`. Ошибка рукопожатия также приходит клиенту/боту в `error`.

Коды предупреждений: `FABRIC_MOD_CONTENT`, `FABRIC_BLOCK_STATES_UNKNOWN`,
`FABRIC_MENU_DROPPED`, `FABRIC_REGISTRY_DECODE_FAILED` (битые данные в PLAY —
соединение сохраняется). Коды ошибок: `FABRIC_TIMEOUT`,
`FABRIC_REGISTRY_INCOMPATIBLE`, `FABRIC_COMMON_VERSION`, `FABRIC_INVALID_PACKET`,
`FABRIC_HANDLER_ERROR`, `FABRIC_BAD_OPTIONS`.

Собственные каналы модов: `handlers` (пример `examples/custom-channel.js`).
Объявляются только встроенные каналы и каналы с обработчиками; большие
сообщения через `fabric:split` собираются и тоже передаются обработчикам.

## Границы

Это честный список того, чего библиотека **не** делает:

- Не исполняет моды. GUI, команды, механики и собственные сетевые протоколы
  модов требуют адаптеров (`handlers`). Конфигурационные задачи модов, ждущие
  ответа клиента (свои рукопожатия библиотек модов), не подделываются — при
  зависании `FABRIC_TIMEOUT` перечислит каналы мода, которые ждут ответа.
- Пакеты с модовыми данными внутри ванильных структур `minecraft-protocol` не
  разберёт: модовые компоненты предметов (1.20.5+), модовые сериализаторы
  метаданных сущностей, модовые частицы, аргументы команд. Такой пакет приходит
  ошибкой в `bot.on('error')` и пропускается; соединение не рвётся.
- Число состояний модовых блоков с сервера не передаётся — либо `modData`,
  либо заглушка. Если модовых состояний так много, что меняется ширина
  глобальной палитры, секции чанков с прямой палитрой (>256 разных состояний)
  читаются неверно.
- Forge/NeoForge — это `minecraft-protocol-forge`. Legacy Fabric (1.8–1.13) и
  собственный протокол Quilt не реализованы (Quilt-сервер с совместимостью
  Fabric API должен принять Fabric-клиента, но это не проверялось).

## Проверка

```powershell
npm test
npm run check
$env:MC_HOST = "localhost"; $env:MC_PORT = "25565"; npm run diagnose   # свой сервер
```

95 тестов: реальный TCP и кодеки `minecraft-protocol`/Mineflayer. Эмулятор
Fabric-сервера воспроизводит обмен каждой эпохи по исходникам Fabric API
(1.16.5, 1.19.4, 1.20.1, 1.20.4, 1.21.1, 1.21.4, 1.21.8, 1.21.11, 26.1) до
`spawn` бота и открытия модового меню; плюс все 28 версий 1.8.8–26.1 на обычном
сервере.

Проверено и на **настоящих серверах Fabric 1.20.1, 1.21.4 и 26.1.2** с Fabric
API, CreativeCore и Macaw's Windows: бот заходит (обычный Mineflayer на 1.21.4 и
26.1.2 кикается), модовые блоки и предметы видны, ошибок нет. Эта проверка нашла
реальную особенность Fabric API 1.20.5–1.21.10, которую эмулятор не
воспроизводил, — она исправлена. Подробности в [docs/TESTING.md](docs/TESTING.md),
исследование протокола в [docs/PROTOCOL.md](docs/PROTOCOL.md).

Лицензия: Apache-2.0. Сторонний проект, не официальный продукт FabricMC/PrismarineJS.
