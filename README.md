# FBF - Football Draft (backend Node.js puro)

Reescrita do backend (antes Java/Quarkus + H2) em **Node.js puro, sem nenhuma dependência npm**.
O front-end (`public/`) é o mesmo, sem alterações. Mesmas rotas, mesmos formatos de JSON, mesma lógica de jogo.

- **Servidor:** `node:http` (gzip, ETag nos estáticos)
- **Banco:** `node:sqlite` (embutido no Node), arquivo único em `data/fbf.sqlite`, modo WAL
- **Login:** Discord OAuth2 (usa o `fetch` nativo)
- Sem `npm install`, sem `node_modules`, sem build.

## Requisitos
Node **>= 22.13** (precisa do módulo `node:sqlite`). Verifique com `node -v`.
Com o Node 22.x o `--no-warnings` esconde o aviso "experimental" do SQLite (o `npm start` já usa isso no systemd).

## Rodar
```bash
cp .env.example .env      # edite com seus dados
node --no-warnings server.js
# abre em http://localhost:8080
```
Na primeira execução o banco é criado e populado (raridades, modelos, times, pacotes, formações, bots...).
As cartas (jogadores) **não vêm no seed** - cadastre pelo painel Admin ou use a importação em lote.

### Variáveis (.env)
| Variável | Para quê |
|---|---|
| `PORT`, `HOST` | porta/endereço (padrão 8080 / 0.0.0.0) |
| `FBF_BASE_URL` | URL pública (https://seu-dominio.com) |
| `FBF_DISCORD_CLIENT_ID` / `_CLIENT_SECRET` / `_CALLBACK_URL` | login Discord (callback: `https://seu-dominio.com/auth/discord/callback`) |
| `FBF_DISCORD_ADMIN_IDS` | IDs Discord (separados por vírgula) que viram admin |
| `FBF_DISCORD_WEBHOOK_URL` / `FBF_DISCORD_ICON_WEBHOOK_URL` | avisos de pedidos Pix e de cartas Icon |
| `FBF_DEV_LOGIN` | `true` libera login sem Discord (**só para testes, nunca em produção**) |
| `FBF_INITIAL_COINS` | moedas de boas-vindas |
| `FBF_DB_PATH`, `FBF_UPLOAD_DIR` | onde ficam o banco e os uploads |

## Produção (VPS)
1. Copie o projeto para `/opt/fbf`, crie o usuário `fbf` e dê permissão em `data/` e `uploads/`.
2. `cp deploy/fbf.service /etc/systemd/system/ && systemctl enable --now fbf`
3. nginx na frente: veja `deploy/nginx.conf` (+ certbot para HTTPS). Com HTTPS, os cookies saem com `Secure` automaticamente quando `FBF_BASE_URL` começa com `https`.
4. Backup: copie `data/fbf.sqlite` (com o app rodando use `sqlite3 data/fbf.sqlite ".backup bkp.sqlite"`) e a pasta `uploads/`.

Consumo esperado: dezenas de MB de RAM (a versão Java passava de 300 MB) e subida em menos de 1 s.

## Migrar os dados do sistema antigo (H2)
Com o app Java **parado**:
```bash
java -cp ~/.m2/repository/com/h2database/h2/<versao>/h2-<versao>.jar org.h2.tools.Script \
     -url jdbc:h2:file:./data/fbf -user sa -password sa -script dump.sql
node tools/migrate-h2.js dump.sql --db data/fbf.sqlite --replace
```
O importador lê o dump SQL do H2, ignora colunas/tabelas que não existem mais e roda tudo numa transação (se falhar, nada é gravado).
> Testado com um dump sintético no formato do H2 2.x; faça um backup e confira usuários/cartas depois da importação.

## Testes
`npm test` sobe o servidor com banco temporário e exercita ~130 verificações (login, admin, pacotes, draft, partidas, online com 2 usuários, mercado, loja, Draft Run, carta pessoal, Pix + upload).

## Diferenças em relação à versão Java
- Erro de saldo insuficiente na loja agora devolve 400 (antes 500).
- Uploads (`/uploads/...`) agora são realmente servidos; comprovantes são salvos com a extensão correta (antes `.bin`) e só aceitam imagem/PDF.
- O sorteio de habilidades por carta usa o mesmo gerador do `java.util.Random` (portado), então cada carta mantém as habilidades de antes.
- `/api/health` agora informa `"backend": "node"`.

## Estrutura
```
server.js        entrada (boot, jobs, shutdown)
src/             config, db, http, sessões, lógica de jogo e serviços
src/routes/      rotas (public, collection, draft, draftrun, online, shopx, admin)
public/          front-end (inalterado)
seed/            dados iniciais (jsonl)
tools/           migração H2 -> SQLite
deploy/          systemd + nginx
```
