# BYMA Market Data API — Delay20 (guía de integración)

> Fuente: manual oficial de BYMA en Confluence (Tecval), v1.0 del 15/09/2026, y el
> "Manual ingresos - APIs Market Data - General" v1.0 del 24/09/2026.
> Describe la API, la autenticación, los endpoints y las inconsistencias del
> manual que hay que verificar contra la API real (marcadas con ⚠️).

## 1. Qué es

- API REST (solo `GET` para datos) que entrega el **snapshot del día** de BYMA con **20 minutos de delay** respecto del online.
- **No trae históricos**: solo la rueda del día. Para cierres de días anteriores existe otra API de BYMA (EOD, `/eod/v1/...`), que se contrata aparte.
- Base URL (prod): `https://apigw.byma.com.ar`
- Prefijo de todos los endpoints de datos: `/delay20/v1/`

## 2. Acceso y credenciales

1. Se pide acceso al portal y a la API Delay20 desde **BYMA Point**. BYMA manda una invitación desde `apis@byma.com.ar`.
2. Portal de usuarios (Market Data): `https://apiportal.byma.com.ar/signin`
3. En **Mis aplicaciones** está la app que se crea automáticamente. De ahí salen `client_id` y `client_secret` (sección "seguridad OAuth2.0").
4. Si se crea una app nueva, hay que avisar a BYMA por BYMA Point para que le asignen permisos. Opcionalmente se puede restringir a dominios/IPs; **si se restringe por IP, la máquina donde corre el código tiene que estar en la whitelist**.
5. En el portal, cada método muestra parámetros, **scope**, franja horaria y un botón "Probar método" (obtener token → ejecutar). Conviene usarlo para confirmar los puntos marcados como ⚠️ abajo.

## 3. Autenticación (OAuth2, client credentials)

**Obtener token**

```
POST https://apigw.byma.com.ar/oauth/token/
Content-Type: application/x-www-form-urlencoded

scope=<scope>
```

Respuesta (ejemplo del manual, para EOD):

```json
{
  "token_type": "Bearer",
  "access_token": "eyJ...",
  "expires_in": 86400,
  "scope": "eod.read"
}
```

- El token dura **86400 s (24 h)**. Cachearlo y renovarlo antes del vencimiento; no pedir uno por request.
- ⚠️ **Scope de Delay20**: el manual solo muestra `eod.read` (para EOD). Para Delay20 es probable que sea algo como `delay20.read`, pero **hay que confirmarlo en el detalle del método en el portal**.
- ⚠️ **Cómo se mandan client_id/client_secret**: en la captura de Postman el body solo tiene `scope`, así que las credenciales casi seguro van en la pestaña Authorization (HTTP Basic: `base64(client_id:client_secret)`), con `grant_type=client_credentials`. Implementar así:
  1. Primer intento: header `Authorization: Basic <base64(client_id:client_secret)>` y body `grant_type=client_credentials&scope=<scope>`.
  2. Si da 400/401: mandar `client_id`, `client_secret`, `grant_type` y `scope` todos en el body form-urlencoded.

**Usar el token**

```
GET https://apigw.byma.com.ar/delay20/v1/<endpoint>?<params>
Authorization: Bearer <access_token>
```

## 4. Convenciones comunes

### Security_Id
Formato: `SIMBOLO-PLAZO-FORMAOPERATIVA-MERCADO-MONEDA`, p. ej. `AL30-0002-C-CT-ARS`, `TEMD-0001-C-CT-USD`.
(En opciones e índices es solo el símbolo, hasta 10 caracteres: `YPFC4400AB`, `SPMERVAL`.)
En futuros, cauciones y préstamos, el "plazo" del security_id es la fecha de vencimiento en `DDMM` (p. ej. `PESOS-2403-U-CT-ARS` vence el 24/03, `DOJUN23M-3006-D-CT-ARS`).

### Códigos
| Campo | Valores |
|---|---|
| Market | `CT` = PPT (Prioridad Precio-Tiempo, garantizado) · `SB` = SENEBI |
| OperativeForm | `C` contado · `G` mercado gris · `D` futuros de moneda · `J` futuros de índices/títulos · `O` opciones · `U` cauciones · `V` préstamo por venta en descubierto · `L` préstamo por falla de liquidación |
| Currency | `ARS` pesos · `USD` dólar MEP · `EXT` dólar cable (CCL) |
| SettlPeriod | `0000` mercado gris · `0001` contado inmediato (CI) · `0002` 24 hs |

### Categorías (`category`)
`0` Cauciones · `1` Acciones · `3` Títulos Públicos · `5` Obligaciones Negociables · `7` Monedas (futuros) · `12` Bonos de Consolidación · `13` Letras · `14` ON PyME · `17` Letras del Tesoro · `18` Fondos de Inversión · `19` Títulos de Deuda · `20` Cert. de Participación · `22` ADRs · `23` CEDEARs · `27` Acciones PyME · `99` Índices (futuros)

### Campos de snapshot (comunes a equity, fixed_income, futures, options, repos, loans)
| Campo JSON | Tipo | Significado |
|---|---|---|
| `security_id` | str | ver arriba |
| `symbol` | str | ticker |
| `category` / `categoryDesc` | int / str | categoría |
| `leader` | int | 1 = panel líder (solo equity) |
| `market`, `operativeForm`, `currency`, `settlPeriod` | str | códigos de arriba |
| `settlDate` | str | vencimiento `YYYYMMDD` (futuros, opciones, cauciones, préstamos; en renta fija suele venir vacío) |
| `trades` | int | cantidad de operaciones |
| `trade_volume` | float | nominales / contratos operados |
| `trade_amount` | float | monto operado |
| `trading_session_low_price` / `trading_session_high_price` | float | mínimo / máximo |
| `trade` | float | último precio |
| `opening_price` | float | apertura |
| `vwap_price` | float | VWAP |
| `imbalance` | float | **variación % vs cierre anterior** (no es un imbalance de libro) |
| `previous_close` | float | cierre anterior |
| `closing_price` | float | cierre (0 o null hasta que cierra la rueda) |
| `open_interest` | float | interés abierto (solo futuros) |
| `broadcast_time` | int | hora de la última novedad en formato `HMMSS`/`HHMMSS` sin ceros a la izquierda (`92507` = 09:25:07, `140057` = 14:00:57) |
| `best_purchase_price` / `purchase_amount` | float | mejor bid y su cantidad |
| `best_selling_price` / `selling_amount` | float | mejor offer y su cantidad |
| `Date` | str | `YYYY-MM-DD` — **ojo: con D mayúscula** |

Respuestas envueltas en `{"result": [ ... ]}`.

**Valores 0 = sin dato.** `trade = 0`, `best_selling_price = 0`, etc. significan que no hubo operación/punta, no precio cero. Convertirlos a `None`/`NaN` antes de calcular nada.

## 5. Endpoints

> Nombres de parámetros en la query string: en minúsculas (`group`, `subgroup`, `market`, `operativeform`, `currency`, `settlperiod`, `page`), como en los ejemplos del manual.

### 5.1 Renta variable — `GET /delay20/v1/equity.raw/`
| Param | Valores | Req. |
|---|---|---|
| `group` | `ACCIONES`, `CEDEARS`, `FONDOSINVERSION`, `ADRS`, `ACCIONES PYMES` | sí |
| `subgroup` | `GENERAL`, `LIDER` (solo acciones) | no |
| `operativeform` | `CONTADO`, `GRIS` | sí |
| `currency` | `ARS`, `USD`, `EXT` | no |
| `settlperiod` | `0000`, `0001`, `0002` | no |
| `page` | entero, arranca en 0 | ⚠️ ver paginación |

Ejemplo: `/delay20/v1/equity.raw/?currency=&group=CEDEARS&operativeform=CONTADO&settlperiod=0001&subgroup=LIDER&page=0`

⚠️ El path es `equity.raw/` (con `.raw` y barra final) según el ejemplo; la captura de EOD usa `/eod/v1/equity`. Si `equity.raw/` da 404, probar `/delay20/v1/equity`.

### 5.2 Renta fija — `GET /delay20/v1/fixed_income`
| Param | Valores | Req. |
|---|---|---|
| `group` | `TITULOSPUBLICOS`, `LETRASTESORO`, `TITULOSDEUDA`, `CERTPARTICIPACION`, `OBLIGACIONESNEGOC`, `ONPYMES` (⚠️ el manual también menciona Bonos de Consolidación y Letras sin dar el valor del parámetro) | sí (en la práctica) |
| `market` | `PPT`, `SENEBI` | sí |
| `operativeform` | `CONTADO`, `GRIS` | sí |
| `currency` | `ARS`, `USD`, `EXT` | no |
| `settlperiod` | `0000`, `0001`, `0002` | no |

Ejemplo: `/delay20/v1/fixed_income?group=TITULOSPUBLICOS&market=PPT&operativeform=CONTADO&currency=ARS&settlperiod=0002`

⚠️ El manual no dice la convención de precio (por 100 VN o por 1 VN). Validar con un bono conocido (p. ej. AL30/GD30) contra otra fuente antes de calcular TIR/paridad.

### 5.3 Futuros — `GET /delay20/v1/futures`
| Param | Valores | Req. |
|---|---|---|
| `group` / `operativeform` ⚠️ | `FUTMONEDAS`, `FUTINDyTIT` | sí |

Ejemplo del manual: `/delay20/v1/futures?operativeform=FUTMONEDAS`
⚠️ La tabla dice que el parámetro es `group` pero el ejemplo usa `operativeform`; un ejemplo de input además dice `FUTMONEDA` (sin S). Probar `operativeform=FUTMONEDAS` primero.

### 5.4 Opciones — `GET /delay20/v1/options`
| Param | Valores | Req. |
|---|---|---|
| `operativeform` (doc: `group`) ⚠️ | `OPCIONES` | sí |
| `currency` | `ARS`, `USD`, `EXT` | sí |

Ejemplo: `/delay20/v1/options?currency=ARS&operativeform=OPCIONES`

### 5.5 Cauciones — `GET /delay20/v1/collateralized_repos`
| Param | Valores | Req. |
|---|---|---|
| `group` | `CAUCIONES` | sí |
| `currency` | `ARS`, `USD` (⚠️ aparece en el ejemplo de input, no en la tabla) | ? |

Ejemplo: `/delay20/v1/collateralized_repos?group=CAUCIONES`
En cauciones, los campos de precio (`trade`, `vwap_price`, bids/offers) son **tasas** (TNA %), no precios. `settlDate` es el vencimiento de la caución.

### 5.6 Préstamos — `GET /delay20/v1/loans`
| Param | Valores | Req. |
|---|---|---|
| `operativeform` (doc: `group`) ⚠️ | `PRESTAMOSV` (venta en descubierto), `PRESTAMOSL` (falla de liquidación) | sí |
| `currency` | `ARS`, `USD`, `EXT` | sí |

Ejemplo: `/delay20/v1/loans?currency=ARS&operativeform=PRESTAMOSV`

### 5.7 Índices — `GET /delay20/v1/indices`
Sin parámetros. Devuelve `security_id`, `trading_session_low_price`, `trading_session_high_price`, `trade`, `imbalance` (var. %), `previous_close`, `closing_price` (null durante la rueda), `Date`.
IDs vistos: `SPMERVAL`, `SPBYCAP`, `SPBYMAIG`, `SPBYMAIG10/15/20/25/30/40/50/55/60`, `SPBYUEAP`.

### 5.8 Totales negociados — `GET /delay20/v1/turnover`
Sin parámetros. Devuelve `security_id` (nombre del total, texto libre con espacios: `"Total General"`, `"CT"`, `"Total Contado"`, `"Titulos Públicos"`, `"Acciones"`, `"Cedears"`, `"BONOS"`, `"Oblig. Negociables"`, `"OPTION"`, `"REPOS"`, `"REPOS-PESOS"`, `"REPOS-DÓLAR"`, `"REPOS-DOLARPESOS"`, `"Futuros"`, etc.), `trades`, `trade_volume`, `trade_amount`.
Ojo: los nombres pueden traer typos y tildes (`"Titulos Publlicos SB"` en el ejemplo); no hardcodear matches exactos sin normalizar.

### 5.9 Intradiario (trades del día) — `GET /delay20/v1/intraday`
| Param | Valores | Req. |
|---|---|---|
| `instrument` | símbolo (`BYMA`) o security_id (`BYMA-0002-C-CT-ARS`) | sí |

Campos: `Numeric_Trade_ID`, `Transact_Time` (`HHMMSSmmm`, p. ej. `115719367` = 11:57:19.367), `security_id`, `Agressor_Side` (así, con una sola g; 1/2 = lado agresor, ⚠️ el manual no dice cuál es compra y cuál venta), `trade` (precio), `trade_volume`, `trade_amount`, `Date`, `action` (`false` = concertada, `true` = **anulada** → filtrar o restar).
⚠️ El manual tiene invertidas las descripciones de `trade_volume` y `trade_amount`; según el ejemplo (`trade=460`, `trade_volume=1000`, `trade_amount=460000`), volume = nominales y amount = monto, igual que en el resto de la API.
Si se consulta por símbolo, devuelve trades de todos los plazos (0001 y 0002 mezclados).

## 6. Códigos HTTP
`200` OK · `400` request inválida (param mal) · `401` falta/venció el token · `403` sin permiso para esa API/método (o scope incorrecto, o IP fuera de whitelist) · `404` URI mal formada · `405` método no permitido (solo GET) · `500` error del servidor (ver body).

Manejo sugerido: en `401` renovar token y reintentar una vez; en `5xx` reintentar con backoff; en `403` no reintentar y loguear (es un problema de permisos/scope).

## 7. Paginación ⚠️
El único ejemplo con paginación es equity (`page=0`). El manual no dice el tamaño de página ni cómo se indica la última página. Implementar: iterar `page=0,1,2,...` hasta que `result` venga vacío (o tenga menos filas que la primera página), con tope de seguridad. Probar si fixed_income también acepta `page`.

## 8. Cliente de referencia (Python)

```python
import base64, os, time
import requests

BASE_URL = "https://apigw.byma.com.ar"

class BymaDelay20:
    def __init__(self, client_id=None, client_secret=None, scope=None, timeout=15):
        self.client_id = client_id or os.environ["BYMA_CLIENT_ID"]
        self.client_secret = client_secret or os.environ["BYMA_CLIENT_SECRET"]
        self.scope = scope or os.environ.get("BYMA_SCOPE", "delay20.read")  # confirmar en el portal
        self.timeout = timeout
        self.s = requests.Session()
        self._token, self._exp = None, 0.0

    def _fetch_token(self):
        url = f"{BASE_URL}/oauth/token/"
        basic = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        r = self.s.post(url, timeout=self.timeout,
                        headers={"Authorization": f"Basic {basic}"},
                        data={"grant_type": "client_credentials", "scope": self.scope})
        if r.status_code in (400, 401):  # fallback: credenciales en el body
            r = self.s.post(url, timeout=self.timeout, data={
                "grant_type": "client_credentials", "scope": self.scope,
                "client_id": self.client_id, "client_secret": self.client_secret})
        r.raise_for_status()
        j = r.json()
        self._token = j["access_token"]
        self._exp = time.time() + int(j.get("expires_in", 86400)) - 300  # margen 5 min

    def _get(self, path, params=None, _retry=True):
        if not self._token or time.time() >= self._exp:
            self._fetch_token()
        r = self.s.get(f"{BASE_URL}/delay20/v1/{path}", params=params, timeout=self.timeout,
                       headers={"Authorization": f"Bearer {self._token}"})
        if r.status_code == 401 and _retry:
            self._token = None
            return self._get(path, params, _retry=False)
        r.raise_for_status()
        return r.json().get("result", [])

    def _paged(self, path, params, max_pages=50):
        out = []
        for p in range(max_pages):
            rows = self._get(path, {**params, "page": p})
            if not rows:
                break
            out.extend(rows)
        return out

    # --- endpoints ---
    def equity(self, group, operativeform="CONTADO", subgroup=None, currency=None, settlperiod=None):
        params = {k: v for k, v in dict(group=group, operativeform=operativeform, subgroup=subgroup,
                                        currency=currency, settlperiod=settlperiod).items() if v}
        return self._paged("equity.raw/", params)

    def fixed_income(self, group, market="PPT", operativeform="CONTADO", currency=None, settlperiod=None):
        params = {k: v for k, v in dict(group=group, market=market, operativeform=operativeform,
                                        currency=currency, settlperiod=settlperiod).items() if v}
        return self._get("fixed_income", params)

    def futures(self, group="FUTMONEDAS"):
        return self._get("futures", {"operativeform": group})

    def options(self, currency="ARS"):
        return self._get("options", {"operativeform": "OPCIONES", "currency": currency})

    def repos(self):
        return self._get("collateralized_repos", {"group": "CAUCIONES"})

    def loans(self, kind="PRESTAMOSV", currency="ARS"):
        return self._get("loans", {"operativeform": kind, "currency": currency})

    def indices(self):
        return self._get("indices")

    def turnover(self):
        return self._get("turnover")

    def intraday(self, instrument):
        return self._get("intraday", {"instrument": instrument})
```

Normalización recomendada al pasar a DataFrame:
- reemplazar `0` por `NaN` en campos de precio/puntas (`trade`, `opening_price`, `vwap_price`, `closing_price`, `best_*_price`, low/high);
- parsear `broadcast_time` con `f"{t:06d}"` → `HH:MM:SS`, y `Transact_Time` con `f"{t:09d}"` → `HH:MM:SS.mmm`;
- parsear `settlDate` (`YYYYMMDD`) y `Date` (`YYYY-MM-DD`);
- en intraday, descartar o neutralizar filas con `action == True`.

## 9. Checklist de verificación en el portal (antes de dar por cerrada la integración)
- [ ] Scope exacto para Delay20.
- [ ] Forma de enviar client_id/secret al `/oauth/token/` (Basic vs body).
- [ ] Path de equity: `equity.raw/` vs `equity`.
- [ ] Nombre del parámetro en futures/options/loans: `operativeform` vs `group`.
- [ ] Paginación: tamaño de página y si aplica a otros endpoints además de equity.
- [ ] Convención de precio en renta fija (por 100 VN o por 1 VN).
- [ ] Significado de `Agressor_Side` 1 y 2.
- [ ] Franja horaria habilitada de cada método (el portal la informa).
- [ ] Credenciales en variables de entorno / `.env` (en `.gitignore`), nunca en el código.
