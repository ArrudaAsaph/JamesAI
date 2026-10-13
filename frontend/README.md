# Charles — frontend

Next.js App Router, TypeScript e Tailwind CSS. Interface em português, adaptada para
mobile e desktop a partir da referência de calendário.

## Executar

1. Na pasta `backend`, mantenha o PostgreSQL ativo (`docker-compose up -d --wait db`) e execute `npm run dev`.
2. Nesta pasta, execute:

```bash
npm install
npm run dev
```

Abra **http://localhost:3002**. A porta 3002 evita o conflito com outro projeto local na 3001.
Use `localhost` tanto no frontend quanto no callback OAuth para que o navegador compartilhe
o cookie de sessão durante o login.

O backend deve ter:

```dotenv
FRONTEND_URL=http://localhost:3002
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google
```

O URI cadastrado no Google continua `http://localhost:3000/auth/google`.
O frontend usa `/api/*`, encaminhado pelo Next.js ao backend `http://127.0.0.1:3000`.
Para mudar esse destino, copie `.env.example` para `.env.local`, ajuste `BACKEND_URL`
e reinicie o Next.js. Nenhum segredo OAuth precisa estar no frontend.

## Funcionalidades

- Login Google com retorno automático para o aplicativo.
- Sessão persistida pelo backend; o frontend não armazena tokens em localStorage.
- Calendário iniciado no mês atual, semanas de segunda a domingo, troca de mês/ano e botão Hoje.
- Seleção de dia para filtrar seus eventos, com indicação dos dias que têm compromissos.
- Próximos eventos nos próximos 90 dias, com paginação completa da API e botão para exibir mais cards.
- Detalhes do evento, horário local, local e links de reunião/Google Calendar quando disponíveis.
- Eventos de dia inteiro e que atravessam vários dias.
- Campo de comando por voz: o navegador transcreve a fala em português, o backend interpreta o
  contexto e cria eventos no Google Calendar para comandos completos.
- Tela Minha conta com logout. Sair destrói a sessão e preserva o cadastro e a conexão Google.
- Estados de carregamento, agenda vazia, erro de conexão e solicitação de nova autorização.

## Organização

- `src/app`: página, layout, fontes locais e estilos Tailwind.
- `src/components`: login, dashboard, calendário, cards e detalhes.
- `src/services/api.service.ts`: comunicação com a API e paginação.
- `src/interfaces`: dados e contratos do dashboard.
- `src/lib/calendar.ts`: cálculos de datas e eventos.

`Home`, `Dashboard`, `ApiService` e `CalendarDate` usam classes. Componentes de apresentação
usam funções nomeadas; não há arrow functions no código da aplicação.

## Verificação

```bash
npm run build
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
```

Os testes de navegador usam uma instância isolada na porta 3101 e respostas de API simuladas;
não acessam a conta Google. Os testes do backend validam login, logout, persistência e calendário
com PostgreSQL real e Google simulado. Capturas desktop/mobile ficam em `test-results/`.
