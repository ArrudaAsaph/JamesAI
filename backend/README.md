# Autenticação Google com PostgreSQL

## Iniciar

Dentro de `backend`:

```bash
# O .env já configurado deve ser preservado.
# Em uma instalação nova: copie .env.example para .env e preencha os valores.
docker-compose up -d --wait db
npm run dev
```

Se sua instalação usa o plugin Compose, o comando equivalente é `docker compose up -d --wait db`.
O PostgreSQL roda no Docker, publicado somente em `localhost:5433`, com volume persistente.
O backend roda no host. `DATABASE_URL` deve corresponder a `POSTGRES_USER`, `POSTGRES_PASSWORD`,
`POSTGRES_DB` e `POSTGRES_PORT` do `.env`. Ao alterar a senha de um banco já criado,
é necessário atualizar também o usuário no PostgreSQL; mudar o `.env` não altera o volume existente.
As tabelas `users` e `sessions` são criadas na inicialização do backend.

Configure o cliente Google OAuth como **Aplicativo da Web** e cadastre exatamente
`http://localhost:3000/auth/google` como URI de redirecionamento autorizada.
Preencha `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` e
`SESSION_SECRET` (mínimo de 32 caracteres aleatórios). Gere um segredo com:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

## Testar no navegador

1. Abra `http://localhost:3000/auth/google` e entre com sua conta Google.
2. Abra `http://localhost:3000/auth/me` no mesmo navegador: retorna `200` e seu usuário.
3. Abra `/auth/me` em uma janela anônima sem login: retorna `401`.
4. Reinicie o backend e consulte `/auth/me` novamente: a sessão permanece válida enquanto não expirar.

O login cria ou atualiza o usuário pelo `googleId`. `id` agora é o UUID interno;
o identificador retornado pelo Google fica em `googleId`. O perfil inclui `name`, `email`,
`picture`, `createdAt`, `updatedAt` e `lastLogin`.
A sessão guarda apenas o ID interno; o usuário é consultado no banco em cada requisição.
Excluir o usuário impede o acesso pela sessão existente.

O cookie `charles.sid` é HttpOnly, SameSite=Lax e tem validade de 24 horas.
Mantenha o mesmo `SESSION_SECRET` para validar os cookies após reiniciar o backend.
Sessões em memória da versão anterior exigem um novo login.
O fluxo usa state e PKCE e exige e-mail verificado pelo Google.

## Estrutura

- `models/user.model.ts`: classe `User` e validação dos dados.
- `interfaces/`: contratos de configuração, usuário e callbacks.
- `repositories/user.repository.ts`: consultas e atualização do usuário por Google ID.
- `database/database.ts`: pool PostgreSQL e criação das tabelas.
- `database/session.store.ts`: sessões persistidas com `connect-pg-simple`.
- `services/auth.service.ts`: estratégia Google, persistência e recuperação do usuário.
- `controllers/auth.controller.ts`: callback de login e consulta do usuário atual.
- `middlewares/auth.middleware.ts`: exige sessão autenticada e retorna `401` sem login.
- `routes/auth.router.ts`: `/auth/google` e `/auth/me`.
- `config/environment.ts`: validação das variáveis de ambiente.
- `app.ts` e `server.ts`: montagem, inicialização e encerramento das conexões.

Para proteger outras rotas, use `AuthMiddleware.requireAuthentication` após os middlewares
de sessão e Passport, preservando o contexto com `.bind(authMiddleware)`.

## Comandos

```bash
npm run build
npm start
npm test
docker-compose ps
docker-compose stop db
```

Os testes usam o PostgreSQL do `.env`, criam um banco temporário `charles_test_*` e removem
apenas esse banco ao terminar. O usuário de testes precisa da permissão CREATEDB.
O login Google é simulado; persistência, middleware e sessões usam PostgreSQL real.
O volume do Compose mantém os dados ao parar ou recriar o container. `down -v` apaga o volume.

Para produção, configure HTTPS, `NODE_ENV=production`, proxy confiável conforme a infraestrutura,
backup do banco e migrações versionadas para mudanças futuras de esquema.

Referências: [consultas PostgreSQL](https://node-postgres.com/features/queries),
[sessões PostgreSQL](https://github.com/voxpelli/node-connect-pg-simple).

## Eventos do Google Calendar

Endpoint autenticado: `GET /calendar/events`. Consulta o calendário principal do usuário
identificado pela sessão. Não aceita ID de outro usuário.

1. Ative a **Google Calendar API** no mesmo projeto Google Cloud.
2. Reinicie o backend e acesse `/auth/google` novamente, aceitando o acesso ao calendário.
3. No mesmo navegador, abra `http://localhost:3000/calendar/events`.

O fluxo mantém o scope `calendar.events` já configurado e agora solicita acesso offline
com consentimento para receber o refresh token. Este endpoint apenas consulta eventos.
Logins feitos antes desta implementação precisam ser repetidos para salvar os tokens.

Exemplo com período e limite:

```text
http://localhost:3000/calendar/events?timeMin=2026-10-01T00:00:00Z&timeMax=2026-11-01T00:00:00Z&maxResults=20
```

- `timeMin`: data/hora RFC3339 com fuso; padrão é o momento da consulta.
- `timeMax`: fim do período, opcional e posterior a `timeMin`.
- `maxResults`: entre 1 e 2500, padrão 50.
- `pageToken`: use o `nextPageToken` retornado para buscar a próxima página.
  Mantenha os mesmos filtros, incluindo um `timeMin` explícito, ao paginar.

A resposta contém `items` (eventos), `nextPageToken` quando houver outra página e,
quando fornecidos pelo Google, `summary` e `timeZone`. Eventos recorrentes são expandidos
e ordenados por início. Eventos de dia inteiro preservam os campos `start.date`/`end.date`.

Os tokens ficam na tabela `google_tokens`, criptografados com AES-256-GCM usando
`TOKEN_ENCRYPTION_KEY` (64 caracteres hexadecimais). Essa chave foi adicionada ao `.env`
local. Em novas instalações, gere-a com o mesmo comando de 32 bytes usado para o segredo
da sessão. Preserve a chave entre reinicializações e backups para conseguir ler os tokens.
Os tokens não aparecem nas respostas de login, `/auth/me` ou `/calendar/events`.

O backend renova tokens expirados automaticamente. Se o Google revogar o acesso ou não
houver tokens salvos, a API retorna `403` com `code: GOOGLE_RECONNECT_REQUIRED`;
acesse `/auth/google` novamente. Sem sessão, retorna `401`. Filtros inválidos retornam
`400`; falta de permissão ou API desativada, `403`; limite de consultas, `429`; falhas
na comunicação com o Google, `502`.

Classes: `CalendarRouter`, `CalendarController`, `CalendarService`, `GoogleTokenService`,
`GoogleTokenRepository` e `TokenCipherService`. Interfaces em `interfaces/calendar.interface.ts`.

Os testes exercitam consultas, paginação, validação, tokens criptografados, renovação,
acesso revogado e isolamento entre usuários, com respostas do Google simuladas.

Referências: [listar eventos](https://developers.google.com/workspace/calendar/api/v3/reference/events/list)
e [OAuth com acesso offline](https://developers.google.com/identity/protocols/oauth2/web-server#offline).

## Comandos por voz e agenda

O frontend transforma a fala em texto no navegador e envia o comando autenticado para
`POST /commands` com o corpo `{ "text": "agende uma reunião amanhã às 14h" }`.
O backend seleciona o contexto em `src/contexts/calendar-context.md`, solicita uma interpretação
JSON ao OpenRouter e cria o evento no calendário principal somente para a intenção `create` com
nome, data e horário válidos. O evento é criado no fuso `America/Fortaleza` e dura 60 minutos
quando o comando não informar a duração.

Configure `OPENROUTER_API_KEY` e, opcionalmente, `OPENROUTER_MODEL`, `OPENROUTER_API_URL` e
`CONTEXTS_DIRECTORY` no `.env`. O corpo do comando não entra na auditoria; a requisição gera o
evento auditável `command.executed` com usuário, status e identificador da requisição.

O chat entende criação, alteração, remoção e alertas de eventos. Exemplos: “mude a reunião de
amanhã para 15h”, “remova meu dentista na sexta” e “me alerte 30 minutos antes da reunião”.

## Pesquisa na web com Gemini e Google Search

Configure `GEMINI_API_KEY` no `.env` com uma chave criada no Google AI Studio. Opcionalmente,
configure `GEMINI_MODEL` (padrão `gemini-3.8-flash`). Pedidos como “pesquise no Google sobre ...”
seguem diretamente para a Gemini API com a ferramenta Google Search habilitada; essa rota não usa
o OpenRouter. O chat mostra a síntese do Gemini e os links de fontes retornados pelo grounding.
Veja a [documentação oficial de Grounding com Google Search](https://ai.google.dev/gemini-api/docs/google-search).

## Busca no Gmail

Ative a **Gmail API** no projeto Google Cloud. O endpoint autenticado
`GET /emails/search?q=consulta&maxResults=10` devolve assunto, remetente, data e trecho dos e-mails
encontrados. O chat também interpreta pedidos como “busque e-mails da Ana” e apresenta os resultados.

O login agora solicita o escopo `gmail.readonly`. Cada usuário deve entrar novamente pelo
`/auth/google?client=web` e aceitar a nova permissão antes de usar a busca. Consultas de e-mail são
auditadas como `email.search.executed`; valores da busca não entram no log de auditoria.

## Frontend e logout

O aplicativo Next.js está em `../frontend`, disponível em `http://localhost:3002`.
Configure `FRONTEND_URL=http://localhost:3002` no `.env`.

- `GET /auth/google?client=web`: inicia login com retorno ao frontend configurado.
- `GET /auth/google`: mantém o retorno JSON para uso direto da API.
- `POST /auth/logout`: encerra o Passport, destrói a sessão no banco e remove `charles.sid`.
  Envie `X-Requested-With: XMLHttpRequest`. Se houver `Origin`, ela deve corresponder ao
  frontend configurado ou à origem do callback. O cadastro e os tokens Google são preservados.

O Next.js encaminha `/api/*` para este backend e mantém o cookie HttpOnly.
Não é necessário liberar CORS para o frontend local. Em produção, mantenha frontend e callback
sob o mesmo host público (com proxy) para que o cookie seja compartilhado, configure HTTPS e
`FRONTEND_URL`/`GOOGLE_CALLBACK_URL` com os endereços públicos.

## Auditoria

Cada requisição do backend gera um registro em `audit_logs`. O registro inclui `request_id`,
data, usuário autenticado quando existir, evento, método, caminho, nomes dos filtros, status,
duração, IP com hash HMAC, user agent e código de erro. O backend retorna o mesmo identificador
no cabeçalho `X-Request-Id` para correlacionar a resposta com a auditoria.

Os valores de query string, cookies, credenciais, tokens e corpos de requisição nunca são gravados.
Os registros são encadeados por hash HMAC (`previous_hash` + `entry_hash`) e a tabela bloqueia
`UPDATE` e `DELETE` por trigger. A data também faz parte do hash. Para validar toda a cadeia,
execute `npm run audit:verify` dentro de `backend`. Configure e preserve `AUDIT_LOG_KEY` com 64
caracteres hexadecimais; perder ou trocar essa chave impede verificar a integridade histórica.
O verificador também reconhece os dois formatos usados antes da versão atual, para preservar a
verificação de registros já existentes durante a atualização.
