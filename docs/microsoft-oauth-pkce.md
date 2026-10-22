# Microsoft OAuth: проверка совместимости PKCE

Проверка кода от 22 октября 2026 года. Исправлены случайный `state` на каждую попытку, точное сравнение callback и однократное получение ответа. PKCE пока не включён.

Текущий flow:

| Параметр | Значение |
| --- | --- |
| Authorization endpoint | `https://login.live.com/oauth20_authorize.srf` |
| Token endpoint | `https://login.live.com/oauth20_token.srf` |
| Client ID | `00000000402b5328` |
| Redirect URI | `https://login.live.com/oauth20_desktop.srf` |
| Scope | `service::user.auth.xboxlive.com::MBI_SSL` |
| Цепочка после Microsoft | Xbox Live → XSTS → Minecraft Services → профиль Minecraft |

[Документация Microsoft по authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow) рекомендует PKCE и проверку совпадения `state`. Описанные там запросы используют Microsoft identity platform с endpoints `login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize` и `/token`.

Вывод по сопоставлению документации и кода: эта страница не подтверждает поддержку PKCE именно текущей Live/Xbox-регистрацией. Настройки регистрации недоступны в репозитории. Наличие страницы входа после передачи `code_challenge` тоже не доказывает, что сервер проверяет `code_verifier`.

Для отдельного перехода нужно:

1. Подтвердить тип и настройки регистрации, допустимые redirect URI, scopes и поддержку `S256` обоими endpoints. Проверить, нужен ли отдельный client ID.
2. Использовать новый случайный `code_verifier` для каждой попытки и соответствующий `code_challenge`; сохранять проверку `state` и точного callback.
3. В контролируемом входе проверить успешный обмен с верным verifier и обязательный отказ при неверном или отсутствующем verifier. Проверить отмену и повторный callback.
4. Проверить всю Xbox/Minecraft-цепочку, наличие refresh token и его обновление. Проверить совместимость ранее сохранённых аккаунтов до смены endpoints, scopes или client ID.

Полный вход и обмен кодов на токены в рамках этой проверки не выполнялись. Тесты текущего исправления проверяют адрес callback, `state`, неоднозначные параметры, отмену и защиту от повторного использования ответа.
