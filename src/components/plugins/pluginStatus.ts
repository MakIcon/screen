const STATUS_LABELS: Record<string, string> = {
  ON: "Включено",
  OFF: "Выключено",
  REMOVING: "Удаление…",
  "NEEDS APP ID": "Укажите Application ID",
  "NEEDS SERVER": "Укажите сервер",
  "NEEDS ACCOUNT": "Выберите аккаунт",
  "NEEDS URL": "Укажите адрес",
  "NEEDS PACKAGE": "Настройте пакет",
  "NEEDS PORT": "Укажите порт",
};

export function pluginStatusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}
