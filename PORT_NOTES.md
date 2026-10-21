# Port FBF Quarkus -> Node puro (node:http + node:sqlite)

## Feito
- package.json
- src/dao/row.js (Row + toLong/toInt/toDouble)
- src/dao/db.js (Db: q/one/scalar/count/exists/exec/insert/raw/tx + translate SQL PG->SQLite)
- src/service/json.js (parse/parseArray/longList/escape/decodeMap/encode)

## Decisoes
- Row class espelha dao/Row.java (metodos str/strOr/i/iOr/l/lOrNull/iOrNull/d/bool/boolOr)
- db.translate: to_char(now(),...)->strftime localtime; now()->strftime; FOR UPDATE removido; ILIKE->LIKE
- Economy.applyCoins: NAO usar connection; usar Db dentro de Db.tx
- JSON de saida = objetos JS + JSON.stringify (ordem de insercao preservada)
- frontend api() prepende /api; /auth/* e /uploads/* na raiz; index via template
- datas TEXT 'YYYY-MM-DD HH:MM:SS'; colunas snake_case

## TODO (ler Java e portar)
- schema.sql -> db/schema.sql SQLite (BIGSERIAL->INTEGER PK AUTOINCREMENT; defaults de data->app)
- service: settings, economy, pricing, fbfconfig(.env), sessionService, currentUser, hydrate, playerRepo, cardLogic, gameEngine, packs, draftRun, shop, selfcard, cashshop, discord, schemaInitializer, dataSeeder
- api: catalog, collection, draft, draftrun, match, online, packs, selfcard, cashshop, shop, me, system, home, admin
- auth: authResource (Discord OAuth2 + dev-login)
- router (node:http) mapeando rotas; static files; multipart (upload) proprio; cookies
- scripts: init-db, seed; copiar public-import/*.jsonl, frontend js/css/img, index.html
- .env.example a partir de application.properties
- zip SEM node_modules em outputs + present_files_tool
