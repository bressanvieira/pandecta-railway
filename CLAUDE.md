# Pandecta AI — CLAUDE.md

SaaS de inteligência jurídica para advogados brasileiros. Gera petições, contestações, recursos, contratos e notificações via IA (Claude). Especializado em Direito do Consumidor, Civil, Trabalhista, Família, Imobiliário e Previdenciário.

**Identidade:** "A Pandecta" — artigo feminino, sempre.

---

## Stack

- **Frontend:** SPA vanilla JS/CSS/HTML em `public/index.html` (~295k bytes)
- **Backend:** Node.js + Express em `server.js` (~95k bytes)
- **Banco:** SQLite via `better-sqlite3` — `data/pandecta.db`
- **IA geração:** `claude-sonnet-4-6` — 16k tokens, temp 0.3 (SSE stream)
- **IA assistente:** `claude-haiku-4-5-20251001` — 1024 tokens, temp 0.4 (SSE stream)
- **RAG:** keyword matching com normalização de acentos — sem embeddings
- **Deploy:** Railway (Hobby ~$7/mês) — `pandecta.com.br`
- **Repo:** `bressanvieira/pandecta-railway`
- **Deps:** `express`, `@anthropic-ai/sdk`, `better-sqlite3`, `bcryptjs`, `jsonwebtoken`, `mammoth`

---

## Banco de dados (6 tabelas SQLite)

| Tabela | Isolado por user_id? |
|--------|---------------------|
| `users` | — (é o dono) |
| `lawyers` | ✅ |
| `office` | ✅ |
| `history` | ✅ |
| `acervo` | ✅ (`OR user_id IS NULL` para docs legados) |
| `templates` | ✅ |

---

## Regras críticas

### Auth
- JWT payload usa **`userId`** — sempre `req.user.userId`, **nunca** `req.user.id`
- bcryptjs para senhas | roles: `user` / `admin`
- **Trial desativado temporariamente** — bloco de expiração comentado no server.js. Reativar quando lançar planos pagos. Apenas `account_status='blocked'` bloqueia acesso.
- **Validade do token (24/08/2026, decisão do Maurício)**: sessão é **1 dia por padrão** — em `/api/auth/login`
  e `/api/cadastro`. Só vira **7 dias** se a pessoa marcar "Manter-me conectado" no login (`manterConectado:true`
  no body, checkbox `#inp-remember` em `index.html`). Cadastro nunca oferece 7 dias — auto-login pós-cadastro é
  sempre de 1 dia. Motivo: são advogados lidando com dados de clientes; ele não quer alguém reclamando "acessaram
  minha conta sem senha". Não mexer nisso sem confirmar com ele — é uma decisão de produto, não só técnica.
- **`JWT_SECRET`**: confirmado que existe uma variável de ambiente própria na Railway (não é o fallback
  `'pandecta-dev-secret-trocar-em-producao'` do código). Se algum dia essa var sumir do Railway, todos os
  tokens passam a ser forjáveis por qualquer um que leia o `server.js` — checar isso é o primeiro passo em
  qualquer investigação de acesso indevido.

### Edição do index.html
- **Nunca usar `open(..., 'w')`** em Python — trunca o arquivo. Usar leitura binária + verificar `endswith(b'</html>\n')`
- **Edit tool trunca** index.html em template literals JS — preferir Python para edições grandes
- Sempre verificar integridade após salvar

### Git
- **Nunca operar git pelo sandbox Linux — isso inclui `git status`, não só add/commit/push.** O index.lock
  criado pelo sandbox não é visível/removível pelo Windows (e vice-versa) e trava o repo até alguém apagar
  o arquivo manualmente. Aconteceu de verdade em 15/09/2026: um `git status` rodado do sandbox só pra
  conferir os arquivos gravados deixou um `.git/index.lock` de 0 bytes travado, e o próximo `git push` do
  Maurício no PowerShell falhou com "Unable to create .git/index.lock: File exists" até ele apagar o
  arquivo manualmente (`Remove-Item .git\index.lock`). Pra conferir estado de arquivos no repo do sandbox,
  usar `ls`/`wc -c`/`md5sum`/`node --check` — nunca nenhum comando `git`.
- Sempre usar PowerShell para `git add / commit / push`
- Workflow: sandbox edita arquivos montados → PowerShell faz o commit

### Sidebar
- A sidebar é reconstruída via `mkSidebar(active)` a cada `go(screen)` — não persistir estado nela
- Para selecionar elemento da sidebar no tour: `.screen.active .sb-item.active`

### Acervo
- `buscarContextoUsuario(userId, pergunta, topN=8)` — normaliza acentos, palavras ≥ 2 chars
- Docs legados sem user_id: usar `OR user_id IS NULL` na query
- Rota `POST /api/acervo/reindexar` corrige user_id NULL em docs antigos

### Office
- `GET /api/office` cria registro vazio com `INSERT OR IGNORE` se não existir para o user

### Wizard
- **Dois wizards no index.html**: o OLD chat-based (~linha 181k) e o novo **WizardEngine** (~linha 192k). Sempre editar o WizardEngine.
- `WizardEngine._screens()` reconstrói a lista de telas dinamicamente a cada chamada — variáveis usadas em ternários devem ser declaradas no escopo correto antes do uso
- `_csel()` → `setTimeout(next, 270)` → `_screens()` → `_render()` — ReferenceErrors silenciosos quebram o avanço

### Guardrails (server.js)
- `INJECTION_PATTERNS` + `sanitizeForInjection(text)` — detecta prompt injection em 4 camadas:
  1. Upload no Acervo (antes de salvar chunks no banco)
  2. Montagem do `acervoCtx` em `/api/gerar` (sanitiza + wrapping explícito)
  3. `SYSTEM_PROMPT_V4` — cláusula anti-injection no sistema
  4. Contexto do Assistente (`/api/assistente`)
- Retorna `injection_detected: true` no response do `/api/acervo` se detectado

### Visualizador de documento pós-geração
- Durante streaming: tema dark (fundo `var(--bg)`, texto claro)
- Após geração: JS adiciona classe `doc-ready` ao `#doc-scroll` → CSS muda fundo para `#E8EAF0` (cinza claro), `.doc-paper` vira papel branco com shadow e padding de impressão
- `voltarWizard()` remove a classe `doc-ready`
- Rodapé: botões com ícones + badge "Verificado pela Pandecta" (escudo verde)

---

## Áreas jurídicas — status de especialização

| Área | LEGAL_CONTEXTS | AREA_RULES | Wizard |
|------|---------------|------------|--------|
| Consumidor | ✅ Completo | ✅ | ✅ |
| Civil | ✅ Completo | ✅ | ✅ |
| Trabalhista | ✅ Completo (CLT + Reforma + Súmulas TST) | ✅ | ✅ |
| Família | ✅ Completo (guarda/alimentos/divórcio/LMP/inventário) | ✅ | ✅ |
| Imobiliário | ✅ Lei 8.245/91 | ✅ | ✅ |
| Previdenciário | ✅ Lei 8.213/91 + BPC/LOAS + EC 103/2019 | ✅ | ✅ |

**Arquitetura:** `const contexto = LEGAL_CONTEXTS[area] || LEGAL_CONTEXTS.consumidor`
**AREA_RULES:** objeto paralelo injetado no `userPrompt` como `\n\nREGRAS PROCESSUAIS:\n${areaRules}`

---

## Workflow de deploy

```powershell
cd C:\Users\usuario\pandecta-railway
git add .
git commit -m "feat/fix: descrição"
git push
# Railway faz deploy automático
```

---

## Funcionalidades implementadas

- Auth (bcrypt + JWT + signup)
- Multitenancy completo (todas as tabelas isoladas por user_id)
- **Construtor wizard** (WizardEngine): tipo → área → partes → fatos → responsável → modelo de estilo
- **Sistema de Modelos (Plano A)**: `.docx` → mammoth extrai texto → Claude usa como referência de estilo + **Style Profile**: Haiku analisa o doc e extrai JSON com regras de estilo (max_linhas_paragrafo, tom, uso_negrito etc.) injetadas obrigatoriamente no prompt de geração. UI mostra tags douradas no card do modelo com as regras detectadas e botão "Analisar agora"
- **Template Word visual (Plano B)**: export Word usa o .docx do modelo como template real — preserva `<w:sectPr>` (logo, cabeçalho, rodapé, tamanho de página) e injeta o conteúdo gerado no `<w:body>`. Markdown processado: bold, italic, headings H1/H2, HR, bullets, blockquotes
- **Visualizador durante streaming**: papel creme `#F5F0E8` sobre canvas dark `#0D0F1A` — mesmo look do pós-geração, só o canvas muda (dark → cinza claro `#E8EAF0` ao finalizar)
- **Histórico** com edição, cópia e exportação Word
- **Acervo** (PDF/DOCX/TXT) com RAG por keyword
- **Assistente** multi-turn com contexto do acervo
- **Equipe** (CRUD advogados)
- **Configurações** (dados escritório + logo)
- **Tour guiado** (spotlight + popup boas-vindas com "não mostrar novamente")
- **Landing page** pandecta.com.br + páginas legais (Termos, PP, LGPD)
- **Admin panel**
- **Dashboard home**: saudação, hero card, resumo (KPIs reais), painel único "Peças recentes" (até 5), dica Pandecta condicional (só aparece com acervo vazio). Redesenhado 24/08 — ver "Dashboard e histórico — distill" abaixo
- **Sino de notificações** sempre visível para admin/pioneer; badge só aparece com mensagens novas
- **validate.js** — validador pré-deploy: checa sintaxe JS dos `<script>` inline e IDs/funções obrigatórios
- **Guardrails anti-injection** em 4 camadas (ver seção Guardrails acima)
- **Visualizador de documento** tipo papel pós-geração (canvas cinza + papel branco flutuante)
- **Seção Guardrails** na landing page (entre Áreas e Preços) — layout dois-colunas, card "Proteção ativa" com dot verde pulsando
- **Executive Command Center** em `/command-center` (admin) — dashboard executivo vivo alimentado por `command-center-data.json` (ver seção própria)

### Bugs corrigidos
- `\${_sbTrialBlock()}` escapado em template literal impedia renderização da barra de trial
- `trial_expires_at` NULL para usuários antigos: server.js computa `created_at + 7 dias` como fallback e persiste no banco
- Tour crashava após step 2: `const el` era block-scoped dentro de `if(step.selector){}` — corrigido para `let el = null` no escopo externo
- `isPrev_f` undeclared no bloco fatos do WizardEngine causava ReferenceError silencioso impedindo avanço do wizard
- Seção guardrails na landing invisível: elementos com classe `reveal` sem `watch()` registrado — corrigido adicionando `watch('.guardrail-left','reveal')` e `watch('.guardrail-right','reveal')`
- **Export Word caía sempre no fallback HTML**: `exportarWord()` lia `engine.data` (ConversationEngine — sempre vazio) em vez de `wizard.data` (WizardEngine — onde `modelo_id` é salvo). Fix: `_edata = wizard?.data || engine.data`
- **`textoParaWXML` sem markdown**: `**negrito**`, `---`, `## Título` apareciam como texto literal no Word. Reescrita com suporte completo a bold, italic, headings H1/H2, HR, bullets, blockquotes
- **`exportarWordComTemplate` fallback quebrado**: `lastIndexOf('<w:p>')` nunca casava (XML usa `<w:p ` com atributos). Substituído por estratégia que extrai `<w:sectPr>` (headers/footers/página) e substitui todo o `<w:body>`

---

## Executive Command Center — Documento Vivo

Visão executiva completa da Pandecta, disponível em **`pandecta.com.br/command-center`** (só perfil admin).

- **Fonte de verdade:** `command-center-data.json` (raiz do repo, versionado no git)
- **Página:** `public/command-center.html` — 100% data-driven, renderiza o JSON (dashboard, KPIs, domínios, roadmap kanban, mindmap Mermaid gerado automaticamente, changelog)
- **API:** `GET /api/command-center` (requireAuth + requireAdmin) — lê o JSON do disco a cada request
- **Deploy:** editar o JSON → commit/push via PowerShell → Railway atualiza

### Protocolo de manutenção (OBRIGATÓRIO em toda sessão)
1. **Nunca recriar do zero** — apenas atualizar o `command-center-data.json` quando Maurício trouxer informação nova
2. Encaixar novas iniciativas no domínio correto (estrategia/produto/marketing/comercial/operacoes/tecnologia/financeiro)
3. A cada atualização: incrementar `meta.versao`, atualizar `meta.atualizado_em` e **adicionar entrada no `meta.changelog`** (nunca apagar entradas antigas — é o histórico)
4. Atualizar `dashboard` (avançou/riscos/oportunidades/3 prioridades da semana) quando o contexto mudar
5. Atualizar `protocolo_vendas.abordados_esta_semana` quando Maurício reportar abordagens; resetar para 0 e atualizar `semana_referencia` a cada nova semana
6. O mindmap Mermaid é gerado automaticamente pelo HTML a partir do JSON — não precisa editar
7. Status válidos: `concluido`, `em_andamento`, `proximo`, `futuro`, `bloqueado`, `pausado`, `aguardando`, `continuo` | Prioridades: `alta`, `media`, `baixa`

---

## Papel de Mentor — Instruções Permanentes

Claude atua como **mentor ativo** de Maurício, não como assistente passivo. Instrução permanente — vale para todas as conversas.

### Regras de comportamento
1. **Quando Maurício desviar do foco** (produto, ideias novas, features, LinkedIn) → trazer de volta: *"Quantos advogados você abordou essa semana?"*
2. **Não validar automaticamente** qualquer desvio — mesmo que faça sentido técnico
3. **Quando perceber hesitação em vendas** → lembrar o porquê: filhos (janela de 4 e 9 anos), independência aos 60
4. **Quando ele disser "estou pensando em..."** antes de uma ação de vendas → *"Ótimo. Quando você manda a primeira mensagem?"*
5. **Ser direto sem ser cruel** — ele já sabe o que precisa fazer; o papel é espelho, não juiz

### Padrões sabotadores conhecidos
- Refugia-se no produto quando deveria estar em vendas
- Sente que está sendo intrusivo ao abordar advogados — é medo de rejeição disfarçado de empatia
- Espera pela "hora certa" — o produto está pronto (Fabiano protocolou em juízo)
- Perde foco por ideias novas ou features não pedidas por clientes

### Âncora motivacional (usar quando necessário)
51 anos. Filha com 14 (janela de 4 anos). Filho com 9 (janela de 9 anos). Meta: independência financeira antes dos 60. A Pandecta AI é o motor disso. Cada semana sem pipeline ativo é uma semana perdida dessa janela.

### Protocolo mínimo semanal de vendas
- 5 mensagens para novos advogados por semana (mínimo não negociável)
- Follow-up em 24h para quem respondeu
- Pergunta obrigatória toda sexta: *"Quantos advogados abordei essa semana?"*

Documento completo no Obsidian: `🎯 Plano Mestre/11 - Protocolo Anti-Eu.md`

---

## Pessoas

- **Maurício** — fundador, dev, PO. Atibaia – SP. `mauriciovbressan@gmail.com`
- **Fabiano** — beta tester principal. 30+ anos, 3 escritórios (Imobiliário ~50% + Consumidor + Contratos). Convite enviado 24/06/2026. Retorno positivo 03/07/2026 — usou 100% da peça, protocolou em juízo. Não conhece o Sistema de Modelos ainda (mostrar). **25/08:** sumiu logo após retornar de férias — Maurício já mandou mensagem de check-in sem cobrança, resposta pendente. **16/09:** está atuando por intermédio de Heloísa, advogada do escritório dele — é ela quem de fato está testando a Pandecta agora (ver abaixo).
- **Victor** — outro contato próximo (detalhe de papel/histórico ainda não registrado aqui). **25/08:** mesmo padrão do Fabiano — sumiu ao voltar de férias. Maurício já mandou check-in, resposta pendente. Hipótese dele (intuição forte, **não confirmada**): o tempo livre deu espaço pra conversar com alguém que ofereceu construir algo parecido (ex.: amigo diretor de TI do Fabiano).
- **Kiko** — validou System Prompt v4 (22/05/2026)
- **Consultora técnica jurídica** *(nome pendente)* — validação pelo olhar jurídico. **16/09:** possível sobreposição com Heloísa (abaixo) — mesma origem (indicação do Fabiano), ainda não confirmado se é a mesma pessoa.
- **Heloísa** — advogada do escritório do Fabiano, 2º beta na prática. Indicada por Fabiano; é quem está de fato testando a Pandecta agora em nome do escritório dele (provavelmente a mesma advogada do bug do upload de modelo .docx registrado em 14/09 — nome só confirmado em 16/09). Deu feedback real de produto: pediu integração com a AASP (aasp.org.br) para consulta de prazos/andamento processual em SP — ver seção datada abaixo.

---

## Instagram — Estratégia e posts (@pandecta.ai)

**Decisão de canal (28/08/2026):** Instagram confirmado como canal pago principal, não LinkedIn — decisão
por dois motivos, não só preferência. (1) Conflito de imagem: Maurício trabalha em outra empresa e não pode
aparecer em vídeo pessoal no LinkedIn. (2) Custo: CPC no Meta (~€0,50–2,50) é até 10x mais barato que LinkedIn
(~€5–15), e o corte de mercado geral é Meta pra oferta de ticket baixo (<€5k de contrato) — os planos da
Pandecta (R$79–379/mês) estão bem dentro dessa faixa; LinkedIn compensa mais pra ticket alto/enterprise com
múltiplos aprovadores, que não é o caso aqui. **Ressalva:** a afirmação de que "tem muito advogado no Insta
que compra, não só curte" vem de agências vendendo esse serviço (interesse próprio, não prova) — vale testar
com verba baixa medindo cadastro real, não curtida, antes de escalar.

**Decisão de conteúdo (28/08/2026):** Maurício vai aparecer em vídeo, gravando ele mesmo — já fez isso antes
(perfil de NFT) e gosta de gravar. Vantagem de mercado que ele identificou: como não é advogado, a narrativa
não pode ser "feito por advogado, pra advogados" (linha da Torix) — é "trago 30 anos de engenharia; o advogado
tem que ser o advogado" (validação jurídica real via Kiko e Fabiano, não afirmação vazia). Base de pesquisa:
não existe estudo controlado provando que founder-led marketing funciona (maioria do conteúdo sobre o tema é
anedota de agência/blog) — mas psicologia de credibilidade de fonte e reconhecimento facial é achado real e
antigo, e o dado de alcance do LinkedIn (perfil pessoal favorecido pelo algoritmo) é mensurável, só que não
se aplica aqui pelo motivo (1) acima.

**Auditoria do perfil atual (28/08/2026) — motivo pra reformar antes do primeiro vídeo:** só 2 seguidores, 3
posts, zero vídeo. E o problema real: os 3 posts ainda usam o sistema visual **antigo** (navy escuro + dourado,
logo velha) — exatamente o padrão que o produto abandonou no redesign de 23-24/08 (hoje: grafite + papel
branco + dourado usado com parcimônia). Postar vídeo novo em cima desse grid antigo criaria dissonância de
marca. Bio atual usa emoji como marcador (🇧🇷📚🚀) — viola a recusa permanente #3 do `DESIGN.md` ("sem emoji
como sistema de ícone").

**Plano de reforma do perfil (antes do 1º vídeo):**
- Avatar: `icone-ink.webp` (marca em tinta escura) sobre fundo branco sólido — não usar variante dourada
  transparente (risco de legibilidade em avatar pequeno) nem navy (abandonado).
- Nome: `Pandecta AI`
- Bio (sem emoji, dentro do limite de 150 caracteres) — duas opções prontas:
  1. "Da tecnologia ao Direito: peças fundamentadas, no estilo do seu escritório, prontas para revisão profissional." (110c)
  2. "Petições e contratos fundamentados por IA, no estilo do seu escritório — prontos para revisão profissional." (107c)
- Link: manter `pandecta.com.br`
- Posts antigos (20 Vagas / carrossel produto / logo): **arquivar, não apagar** — some do grid público sem
  perder o histórico, e o grid recomeça limpo no sistema visual novo.
- Arquivos de posts antigos em `brand/` e `pandecta-post2-slide*.png` (mantidos como registro histórico).

**Status:** Maurício ainda vai executar a reforma do perfil manualmente (Claude não tem acesso de escrita ao
Instagram). Depois disso, pronto pra começar a cadência de vídeo.

---

## Concorrentes mapeados

- **ChatADV** — mapeado 25/08 (sessão de diagnóstico comercial). 200 mil usuários alegados, convênios com OAB, WhatsApp, 19M jurisprudências indexadas. Não combina rastreio de prazo/andamento com geração de peça por IA (mesma lacuna dos outros três abaixo).
- **Judex** — mapeado 25/08, mesma sessão. Detalhe ainda não aprofundado.
- **Jurídico AI** — mapeado 25/08, mesma sessão. Detalhe ainda não aprofundado. Não combina rastreio de prazo/andamento com geração de peça por IA.
- **Jus IA / Jusbrasil** — mapeado 25/08, mesma sessão. Detalhe ainda não aprofundado.
- **Leitura consolidada (25/08):** nenhum concorrente direto mapeado até agora combina duas coisas ao mesmo tempo — rastreio de prazo/andamento processual **e** geração de peça por IA no estilo do escritório. A Torix tem o rastreio mas não tem IA na redação; os quatro acima (quando têm IA) não têm o rastreio. Essa lacuna motivou a Prioridade 1 do roadmap de produto (ver Próximos passos).
- **Exordial AI** (exordial.ai) — similar, baseado em Goiânia. Têm: jurisprudência em chat, contratos, petição em lote, transcrição de áudio, editor de documento separado (/editor). Pouquíssima tração no Instagram (40 curtidas no maior post). Usam guardrails como marketing.
- **Enter AI** (getenter.ai) — mapeado anteriormente
- **Torix** (torix.com.br) — mapeado 24/08, a pedido de Maurício ("achei o site... está muito semelhante ao nosso"). Análise: é adjacente, não concorrente direto. Núcleo do produto é **gestão de escritório** (prazos, intimações do DJEN por CNJ, agenda/Kanban, financeiro, portal do cliente white-label) — não redação de peça por IA. O gerador de documentos deles é "por algoritmo, sem IA" (preenchimento de campo em procuração/contrato de honorários/templates). IA entra só em dois pontos pontuais: ATA por IA (transcreve audiência/reunião em ata estruturada) e resumo em linguagem simples pro portal do cliente. Zero sobreposição com o núcleo da Pandecta (fatos do caso → peça redigida no estilo do escritório). Semelhança é de categoria/tom ("feito por advogado, pra advogados"), não de produto. Dados de mercado relevantes: já cobrando, por escritório (não por usuário), mais barato que os planos da Pandecta e sem limite de usuário mesmo no tier de entrada de equipe — Solo R$49,99 · Escritório R$99,99 (ilimitado, 3 OABs) · Banca R$149 (ilimitado); trial de 14 dias sem cartão. Visual: tema escuro navy (`#0d1830`) — o look que a Pandecta acabou de abandonar na migração pra claro. Não indexado no Google nem achado em busca por nome — site muito pequeno/recente, sem presença em rede social encontrada.

---

## Obsidian

- **Vault:** `C:\Users\usuario\Documents\Obsidian Vault`
- **Projeto Jurídica AI:** `🗂️ Projetos\⚖️ Jurídica AI\`
- **Validações:** `📋 Validações de Advogados\`
- **Notas principais mantidas em sincronia com este CLAUDE.md e o `command-center-data.json`:**
  `⚖️ Pandecta.md` (hub — status, log de decisões, concorrentes), `Pandecta — CONTEXTO.md` (onboarding
  rápido pra novos chats), `Pandecta — Roadmap & Tarefas.md` (progresso/sprints)

### Protocolo de manutenção (24/08/2026, a pedido de Maurício: "acho importante mantermos o Obsidian sempre atualizado em caso de perda de informações")
1. Tratar o Obsidian como **backup redundante**, não como fonte de verdade — a fonte de verdade continua sendo
   este `CLAUDE.md` + `command-center-data.json` (versionados no git). O Obsidian existe pra sobreviver a uma
   perda desses dois.
2. Sempre que este `CLAUDE.md` ganhar uma seção datada nova (bug corrigido, decisão de produto, feature) ou o
   `command-center-data.json` ganhar uma entrada de changelog, espelhar o resumo em `⚖️ Pandecta.md` → tabela
   "Log de decisões e marcos" (uma linha por marco, não o texto completo).
3. Atualizar `Status atual` e `Próximos passos` do `⚖️ Pandecta.md` quando o contexto mudar de verdade — não
   duplicar detalhe técnico fino, que já mora no CLAUDE.md.
4. Mudança de stack, banco de dados ou arquitetura → refletir em `Pandecta — CONTEXTO.md`.
5. Novo concorrente mapeado → adicionar na tabela de Concorrentes do `⚖️ Pandecta.md` (mesmo padrão do
   `command-center-data.json`).
6. Sempre checar `mtime` dos arquivos no vault antes de sobrescrever (via `device_list_dir`) — o Maurício edita
   essas notas manualmente às vezes.

---

## Próximos passos

### Proposta da agência Gene Digital — DECIDIDO: recusada (25/08/2026)
Histórico: Plano GOLD R$1.997/mês (ou 3x R$1.995 no trimestral) — gestão de tráfego pago (Meta/Google/LinkedIn
Ads) + equipe criativa (edição de vídeo + design gráfico) + gravação de vídeo com modelos no estúdio deles.
Verba de anúncio à parte. Discutimos em 24/08 se fazia sentido como "sócio de marketing pago por mensalidade"
pra compensar a falta de tempo do Maurício — e em 28/08 avançamos que o canal certo seria Meta/Instagram (não
LinkedIn — conflito de imagem com o emprego atual dele + CPC ~10x mais barato) e que ele gravaria os próprios
vídeos, o que já reduzia o escopo que precisaria da agência. **Em 25/08, numa sessão separada, Maurício
avaliou e recusou a proposta de vez** — motivos registrados por ele: sem KPI/garantia de performance, sem
case em serviços profissionais/B2B de ticket baixo (perfil de cliente diferente do deles), e condicionada a
um checkout que hoje está desativado (não tem como converter o tráfego pago ainda). Decisão final: **não
contratar agora.** Compromisso que ele assumiu no lugar: abordar manualmente 8 a 10 advogados novos usando o
caso do Fabiano (peça protocolada em juízo, sem edição) como prova de abertura, **antes de qualquer novo
gasto em aquisição** — paga ou com agência.

### Imediato
- [ ] Abordar manualmente 8-10 advogados novos usando o caso do Fabiano como prova (compromisso de 25/08, antes de qualquer novo gasto em aquisição)
- [ ] Mostrar Sistema de Modelos para o Fabiano (não sabe que existe — é o diferencial que ele mais pediu)
- [ ] Reformar perfil do Instagram (@pandecta.ai) antes do 1º vídeo — ver seção Instagram acima
- [ ] Acompanhar retorno do Fabiano e do Victor ao check-in enviado (sumiram após férias, ver Pessoas)

### Roadmap de produto priorizado (definido 25/08 — motivado pelo sumiço do Fabiano/Victor + objeções de venda)
Ordem de prioridade, detalhe completo no `command-center-data.json` (domínio Produto):
1. **Rastreio de prazo/andamento processual com alerta** — hoje não existe nenhum gatilho de retorno; hipótese mais provável por trás do sumiço do Fabiano e do Victor.
2. **Reativação do pagamento/assinatura self-service** — bloqueado, mas pré-requisito pra qualquer lead virar cliente pagante.
3. **Memória de processo** (acervo por caso, não só por escritório) — valor acumula com o uso em vez de resetar a cada peça nova.
4. **Comparação lado a lado embutida no produto** (peça genérica vs. estilo do escritório) — responde à objeção recorrente em prospecção: "isso eu já faço com ChatGPT/ChatADV".
5. **Verificação/citação de jurisprudência com confiança auditável** — responde ao medo do "ChatGPT que alucina jurisprudência", sem prometer busca ao vivo antes de ter fonte confiável. Mesmo item identificado de forma independente no Radar Pandecta de 24/08 (ver análise do módulo de verificação).

### Sem prazo — dependem de validação
- [ ] Histórico com visualizador papel (igual ao pós-geração)
- [ ] Busca ao vivo em jurisprudência
- [ ] Sistema de pagamento + reativar trial — **pausado até validar com mais advogados**

### Baixa prioridade
- [ ] Login com Google (OAuth 2.0)
- [ ] Domínio pandecta.ai

**ExpoLaw/Out-2026 descartada em 23/08/2026.** Decisão do Maurício: não apresentar em feira sem advogados além do Fabiano tendo usado e aprovado.

**META QUE SUBSTITUIU A FEIRA — 30/09/2026: 3 advogados com peça protocolada.** Fabiano é 1 de 3. É o único prazo externo que existe. Toda sexta: *"Quantos advogados abordei essa semana?"*

### Redesign visual — estado em 23/08/2026

**Direção travada.** Padrão da categoria executado em fidelidade total, régua **Harvey / Ironclad / Spellbook**.
Sistema completo em `DESIGN.md`; verdade de produto em `PRODUCT.md`. Ler os dois antes de mexer em qualquer tela.

**Regra de verificação — obrigatória antes de todo push:**
```powershell
node validate.js
node <skill>/scripts/detect.mjs --json public/<arquivo>.html   # meta: zero na landing
```
A skill `impeccable` está instalada. O detector precisa de `htmlparser2 css-select css-tree domutils`
no `node_modules` da skill, senão roda degradado e subnotifica.

**Concluído**
- `public/landing.html` — reconstruída. Detector: 35 → **0**. NÃO publicada: sobe junto com o app.
- `public/cadastro.html` e a tela de login — refeitas no mesmo sistema.
- `public/index.html` — camada de tokens trocada e 142 emoji → 40 ícones SVG. Detector: 185 → **82** → **10** (23/08, passe tela a tela).

**Passe tela a tela (23/08/2026) — concluído**
Todas as 10 telas do app (início, histórico, acervo, modelos, equipe, configurações, suporte, canal
pioneiro, admin, tickets) mais o assistente e o construtor de peças foram verificadas com captura real
via Playwright — sem erro de JS, sem ícone quebrado. Correções aplicadas:
- 37 textos abaixo de 11px e 2 casos de texto de corpo pequeno demais — todos para 11-12px.
- 9 botões dourados com texto ilegível (`var(--gold)` + `#001B2A`, o texto navy antigo não bate mais
  com o dourado escuro novo) — texto para branco.
- Ícones fora de contraste em 3 pontos (cartão Acervo na home, modal de trial, badge do modelo).
- Modal "Nova mensagem" do Canal Pioneiro tinha texto escuro sobre fundo `#16213a` — quase invisível.
  Corrigido para texto claro; também tinha um atributo `style=""` duplicado no mesmo elemento (o
  segundo era ignorado pelo navegador) — mesclado.
- 7 modais/tooltips com sombra de 48-64px de blur (o "brilho genérico de IA") — trocados por elevação
  discreta em duas camadas, mesma linguagem do `--shadow-lg` da landing.
- 4 cartões do admin com borda colorida no topo (padrão de dashboard genérico) — removida.
- Roxo `#7C3AED` fora da paleta (cartão admin + badge do plano Escritório) — trocado por `var(--blue)`.
- Pulso de destaque do tour (`tour-pulse`) tinha um halo colorido borrado — removido, ficou só o anel sólido.
- `.topbar` sem respiro vertical (`padding:0 20px`) em 11 pontos, incluindo a versão mobile que zerava
  de novo — agora `padding:6px 20px` (e `6px 12px 6px 56px` no mobile).
- Hover de botões dourados no construtor de peças (`.gwiz-next`, `.gab-prim`) clareava a cor e quebrava
  o contraste do texto branco — agora escurece com `opacity`.

**24/08 — construtor de peças (`#screen-gen`) convertido de escuro pra claro.**
Maurício apontou o problema certo: uma tela inteira mudando de clara pra escura no meio do fluxo é
exatamente o tipo de "surpresa" que a régua de padronização proíbe — quem entra pelo site não pode achar
que caiu numa ferramenta diferente. A exceção que eu tinha documentado sozinho (23/08, "modo de composição
focado") foi revertida. Agora `#screen-gen` usa os mesmos tokens de todo o resto: `.gwiz-*` (seleção de
tipo/área/partes/fatos), `.gdoc-*` (geração e visualizador) e `.gab-*` (ações do documento) todos em
`var(--card)`/`var(--t1)`/`var(--gold)`, sem nenhum `rgba(255,255,255,x)` ou hex escuro sobrando. O
visualizador de documento (`.doc-paper`) já era claro — só a moldura ao redor dele (`.gdoc-body`) que
ficava escura durante o streaming; agora fica em `var(--surface)` o tempo todo, sem trocar de tema entre
"gerando" e "pronto". Também tirei os overrides `#screen-gen.active .tb-*` — a barra superior dessa tela
usa o mesmo `.topbar` claro de qualquer outra.

**Um único navy, não três.** Achei três tons de "escuro" fazendo o mesmo papel em lugares diferentes:
`#0D1B2A` na landing (rodapé/CTA), `#111827` no card de destaque da home, `#0C1020` no construtor antigo
e nos avatares de chat. Criei o token `--navy: #0D1B2A` no `index.html` — mesmo valor exato da landing —
e apontei todos os usos pra ele. Esse é o único preto-azulado que existe no produto agora; se precisar de
um acento escuro em algum lugar novo, é esse.

**Aceito como exceção documentada (6 achados restantes no detector, todos "warning", não "slop")**
- 3 pontinhos pulsantes (`.td`, `.gen-dot`, `.smsg-dot`) — indicador de "digitando"/"gerando", dado real
  em andamento, não decoração. É exatamente o caso que a regra da skill permite.
- 2 barras de progresso com `transition: width` — teoricamente devia ser `transform`, mas são preenchimentos
  que só animam uma vez; risco de regressão maior que o ganho de trocar por `scaleX`.
- 1 contêiner estrutural (`.ac-table-wrap`) sinalizado como "sem respiro" — dar padding quebraria o
  encaixe do cabeçalho da tabela com a borda arredondada. Não é conteúdo, é a casca.

**Tokens do app (`:root` do index.html)**
- Cromo (barra lateral) em **grafite `#16191E`**, não azul-marinho — o navy+dourado é o que a concorrência copiou.
- Conteúdo em **papel branco**. O creme saiu da interface e ficou só em `--paper: #FDFBF6`, a folha da peça.
- Dourado tem dois tons: `--gold #8A6A22` sobre claro (passa AA); `--gold-lt #D3B667` só sobrava pra uso
  sobre escuro e, com o construtor de peças convertido, praticamente não tem mais onde aparecer.
- Único acento escuro do produto: `--navy #0D1B2A` — mesmo valor da landing, usado com parcimônia (card
  de destaque da home, avatares de chat/IA).
- Fonte: **Libre Franklin** (Inter saiu). Source Serif 4 só no corpo da peça.

**Sistema de ícones**
- Registro `ICONS` + função `ico(nome, tamanho)` no topo do script principal do `index.html`.
- Traço 1.6, `viewBox 0 0 22 22`, `currentColor`. **Nunca voltar a usar emoji como ícone.**
- Cuidado: `wizard._render()` escreve o botão "Próximo" com `innerHTML` — se alguém trocar por
  `textContent`, o SVG da seta some a cada passo.

**Sessão / auto-login (3 bugs corrigidos em 23/08)**
1. `cadastro.html` gravava a sessão como `token`/`usuario`; o app lê `pandecta_token`/`pandecta_user`. Corrigido.
2. O app não tinha entrada automática — todo usuário refazia login em toda visita, mesmo com token válido
   de 7 dias. Agora `bootSessao()` valida contra `/api/auth/me` e entra direto; token inválido cai no login limpo.
3. `checkTourPopup()` não existia (é `checkTourAutoShow()`); o ReferenceError bloqueava o tour e o
   `checkTrialExpired()` depois de todo login.

**Falta fazer, em ordem**
- [x] ~~37 textos de interface abaixo de 11px e 13 casos de espaçamento apertado~~ — feito 23/08 (ver "Passe tela a tela" acima)
- [x] ~~Passar tela a tela: home, historico, acervo, modelos, equipe, config, suporte, pioneer, admin, tickets~~ — feito 23/08, todas verificadas com captura real
- [x] ~~Tela "Nova peça" (`#screen-gen`)~~ — feito 24/08: convertida de escuro pra claro, mesmo sistema do
      resto do app. Ver "construtor de peças convertido" acima.
- [x] ~~Recapturar `shot-*.webp` com a ferramenta redesenhada e trocar na landing~~ — feito 23/08, e
      `shot-wizard.webp` recapturado de novo em 24/08 depois da conversão do construtor pra claro (a
      primeira versão mostrava a tela escura antiga — corrigido antes de publicar).

**Decisão comercial pendente do Maurício:** a landing diz "7 dias grátis" em 3 lugares; o cadastro diz
"gratuito durante a fase de validação". O `server.js` está com o bloqueio de trial comentado, ou seja,
hoje é gratuito. Alinhar as duas pontas quando ele decidir.

**24/08 — 4 páginas órfãs descobertas e refeitas (pioneiros, termos, privacidade, LGPD).**
Maurício reportou que `/pioneiros` não tinha sido atualizada. Investigando, o problema era maior: essas
4 páginas (`public/pioneiros.html`, `termos-de-uso.html`, `politica-de-privacidade.html`, `lgpd.html`) são
arquivos **standalone**, servidos por rota própria no `server.js` (linhas 220-223) — nunca fizeram parte
do passe tela a tela porque esse passe cobriu só as telas dentro de `index.html`. Estavam intocadas desde
junho/2026: tema escuro antigo (`#001B2A`/`#C8A96B`), fonte de sistema em vez de Libre Franklin, ícones em
emoji (🔓🎯🏅✉☁🤖). E são acessíveis: `landing.html` linka direto pras 4 (menu, CTA do herói, rodapé) — ou
seja, qualquer visitante caía de volta na ferramenta antiga com dois cliques. Maurício pediu pra corrigir
as 4 antes do push.
- `pioneiros.html` — reconstruída inteira no sistema novo (tokens/fontes/ícones SVG), mantendo 100% da
  lógica JS (validação, máscara de WhatsApp, fade-in, submit pra `/api/fundadores`) e do copy.
- `termos-de-uso.html`, `politica-de-privacidade.html`, `lgpd.html` — como essas 3 já eram inteiramente
  orientadas a variáveis CSS, a técnica foi trocar só os tokens (`:root`) e os poucos literais hex/rgba
  soltos, sem tocar uma palavra do texto jurídico. Cabeçalho trocado pro mesmo padrão ícone+wordmark do
  resto do site; emoji de apoio removidos (2 viraram ícone SVG — nuvem/chip nos subprocessadores da LGPD;
  os outros eram só decoração de texto e saíram sem substituto).
- Detector rodado nas 4 depois da conversão e os achados reais corrigidos: `side-tab` (borda colorida
  lateral em callout — virou borda inteira), `low-contrast` (dourado sobre fundo cinza-claro ficava
  4.2-4.3:1; texto desses pontos específicos foi pra `#7A5D1E`, um dourado mais escuro, só nesses casos),
  `undersized-ui-text` (labels de card em 10.5px → 11px), `all-caps-body` e `pulsing-dot` decorativo no
  badge do pioneiros (o pulso ali não representa dado ao vivo, então saiu — diferente dos pontinhos do app).
- **Bug real encontrado e corrigido, não relacionado a cor:** em `lgpd.html`, o índice ("Nesta página")
  usava a tag `<nav class="toc">` — e a regra `nav{...}` do cabeçalho fixo (seletor por tag, sem classe)
  também pegava esse `<nav>`, colapsando a caixa do índice pra 64px e derramando a lista por cima do
  conteúdo abaixo. Bug pré-existente desde a versão escura (só ficou visualmente óbvio ao rodar no tema
  claro). Corrigido trocando a tag do índice pra `<div class="toc">`.
- **Aceito como exceção documentada** (advisory ou de baixo impacto, não relacionado a tema/marca):
  `numbered-section-labels` (numeração "01, 02..." ao lado de cada `<h2>` — mantida porque o índice linka
  por esses números, tem valor de referência cruzada num documento jurídico); `em-dash-overuse` na LGPD
  (34 travessões — estilo de redação jurídica formal, texto não foi alterado); `flat-type-hierarchy` na
  política de privacidade e na LGPD (muitos tamanhos de fonte próximos entre si — é densidade tipográfica
  de documento longo com muitas variações de rótulo/tabela, não é o tipo de inconsistência visual que
  motivou esse passe).
- Todas as 4: `node validate.js` continua OK (só cobre `index.html`), detector rodado individualmente em
  cada uma, telas conferidas com captura real via Playwright.

**Falta fazer, em ordem**
- [x] ~~4 páginas órfãs (pioneiros, termos, privacidade, LGPD) fora do padrão~~ — feito 24/08, ver acima
- [ ] Publicar site + app no mesmo deploy (agora inclui as 4 páginas órfãs corrigidas)

**24/08 — Dashboard home e Histórico: distill (não redesign) via skill `impeccable`.**
Maurício: a home "era pra ser um dashboard, mas está muito poluída, as informações nem todas fazem sentido";
o histórico "está 100% cara de IA... com poucas peças fica bonito, mas a medida que for crescendo vai ficar
péssimo de analisar". Pediu que a mudança seguisse o direcionamento das skills, não gosto pessoal. Rodei
`context.mjs` (PRODUCT.md + DESIGN.md), depois `reference/operate.md` (modo Operate — a tela serve a tarefa,
densidade e escaneabilidade acima de expressão) e `reference/distill.md` (remover redundância, nunca remover
funcionalidade). Os dois `DESIGN.md` recusas permanentes mais diretamente violados pelo estado antigo: **1)
kicker/eyebrow acima de título** ("COMECE AGORA" sobre o título do hero) e **2) grade de cards do mesmo
tamanho como estrutura de página** (os 3 cards Acervo/Assistente IA/Modelos na home; a grade de cards do
histórico).

Diagnóstico não foi por inspeção visual só — populei o banco local com 19 peças de teste e capturei a tela
real via Playwright antes de mexer em qualquer código, pra confirmar cada suspeita com dado real:
- **Home**: `hd-feats` (3 cards Acervo/Assistente IA/Modelos) é navegação 100% redundante — as 3 rotas já
  existem fixas na sidebar, e "Assistente IA" duplica o botão "Conversar com a Pandecta" do próprio hero.
  `hd-insights` (Insights rápidos: área favorita, tipo frequente) duplicava exatamente os mesmos dois fatos
  já mostrados no card "Seu resumo" (área principal, tipo principal), só que em outro layout. Os painéis
  "Continue de onde parou" e "Atividade recente" liam a mesma query (`hist.slice(0,3)` e `hist.slice(0,4)`)
  — dois componentes visuais pra um dado idêntico, lado a lado.
- **Histórico**: a grade de cards (`hist-grid`/`hist-card`) tinha um bug real, não só um problema de gosto —
  a cor da faixa e o "ícone" de cada card vinham de `item.area` (`AREA_COLOR[areaKey]`/`AREA_ICON[areaKey]`),
  mas a API nunca retornou esse campo (só `area_label`, o rótulo por extenso) — então `areaKey` era sempre
  string vazia, a cor caía sempre no fallback dourado e o "ícone" imprimia a palavra literal do fallback
  (**"documento"**) como texto solto antes do tipo em todo card. Era exatamente essa palavra repetida 20x na
  tela que lia como "cara de IA" — não decoração ruim, um lookup morto vazando texto de debug.

Correções:
- **Home**: removido o kicker; removidos os 3 feature-cards (redundantes com a sidebar); removido o bloco
  Insights rápidos (redundante com Seu resumo); "Continue de onde parou" e "Atividade recente" viraram um
  único painel "Peças recentes" (5 itens, ícone + tipo + área + tempo relativo). A dica do Acervo agora só
  aparece se o acervo estiver vazio (`hd-tip` com `display` controlado por `loadHomeDash()`), em vez de sempre
  visível. De brinde, corrigido um bug real que zerava "Este mês" e "Esta semana": o filtro lia
  `x.createdAt` (camelCase) mas a API retorna `created_at` — `new Date(undefined)` é sempre inválida, então
  o contador nunca contava nada.
- **Histórico**: grade de cards virou tabela densa de uma coluna (`hist-table`/`hist-row` — linha com ponto
  colorido por área, tipo + área, autor, data, ações no hover), cabeçalho fixo (Documento/Autor/Data), sem
  limite de altura por item — escala pra centenas de peças sem virar mosaico ilegível, que era exatamente o
  pedido ("uma grade ou algo assim"). A cor por área agora funciona de verdade: nova função
  `areaKeyFromLabel()` deriva a chave a partir do `area_label` (normalizando acento/maiúscula) em vez de
  depender do campo `area` que não existe. A linha inteira é clicável (antes só o corpo do card abria o
  documento, com um botão "Abrir" redundante ao lado) — sobrou só Copiar/Excluir como ações explícitas,
  reveladas no hover e também no foco de teclado (`:focus-within`) pra não quebrar acessibilidade. Prévia de
  texto do card foi removida — repetia o que já está a um clique de distância no visualizador.
- Mobile (`≤768px`): coluna Autor escondida, ações sempre visíveis (não há hover em touch), linha quebra em
  duas quando o nome do tipo não cabe.
- CSS morto removido junto (`hd-feat*`, `hd-ins-*`, `hd-bottom`, `hd-right-col`, `hd-act*`, `hist-card*`,
  `AREA_ICON`) — nada ficou órfão.
- Detector: 6 → **6** (zero achados novos; os 6 aceitos como exceção em 23/08 seguem os mesmos — nenhum é
  das telas mexidas aqui). `node validate.js` OK. Conferido com captura real via Playwright: desktop,
  hover, filtro por área, abertura do documento, e mobile 390px — todos os fluxos intactos.

**24/08 — Dashboard home, 2ª rodada: Maurício apontou que só tirar redundância não bastava.**
Reação ao primeiro passe: "não mudou praticamente nada além das exclusões... não chama a atenção do
advogado trazendo informações relevantes. Algum gráfico por exemplo." Ele tinha razão — distill só
remove, e a tela ficou honesta mas achatada, sem nenhum momento de leitura rápida. Adicionei densidade
de informação real (dado de verdade, nada inventado — `PRODUCT.md` proíbe métrica fictícia), amparado
pelo próprio `operate.md`: "A single surface can earn Committed... a dashboard where one category color
carries a report" — permissão explícita pra isso, não gosto pessoal de novo.
- **"Peças por área" virou gráfico de barras real** (era só a área principal com uma barrinha única) —
  todas as áreas com volume, ordenadas, cada uma com a cor por área que já existe no histórico (mesma
  paleta, `AREA_COLOR`/`areaColor()` — antes só declarados dentro de `renderHistorico()`, agora no escopo
  do script pra reusar aqui). Sistema de cor por área agora amarra as duas telas visualmente.
- **Painel "Atividade" novo** — gráfico de barras dos últimos 14 dias, contagem real por dia a partir do
  `created_at` de cada peça (não estático, não decorativo), barra de hoje destacada em navy, legenda
  dinâmica ("+N peças vs. semana anterior" comparando os dois períodos de 7 dias). É o "algum gráfico"
  que faltava.
- **Bug real encontrado no processo:** as barras de preenchimento coloridas (`.hd-area-row-fill`) não
  apareciam — só a trilha cinza de fundo. Causa: são `<span>` (inline por padrão) com `width`/`height` via
  style inline, e propriedade `width`/`height` **não tem efeito em elemento inline não-substituído** (regra
  do CSS, não bug de navegador) — a barra colorida renderizava com 0px de largura sempre, escondida atrás
  da trilha. Corrigido com `display:block` na classe. Achado com `getBoundingClientRect()` via Playwright
  (`rectWidth: 0` em todas), não só inspeção visual — o mesmo tipo de verificação que pegou o bug do
  "documento" no histórico mais cedo hoje.
- Populei o banco local com 25 peças espalhadas em 14 dias + 5 áreas pra validar os dois gráficos com dado
  real antes de screenshot, e removi depois (banco local voltou a ter só a peça original).
- Detector: 5 (foi 6) — `transition:width` do preenchimento da barra de área é o mesmo padrão já aceito
  documentado (barra que anima uma vez, não continuamente). `node validate.js` OK. Conferido com captura
  real desktop e mobile 390px — os dois gráficos renderizam corretos, proporcionais, coloridos.

---

## 02/09/2026 — Cadastro: telefone acionável no admin + checkbox de termos obrigatório

Maurício reportou dois problemas depois de uma advogada se cadastrar sozinha, gerar duas peças e ele não
ter como identificá-la ou contatá-la: (1) achava que o cadastro não capturava telefone; (2) não existe
checkbox de aceite dos Termos de Uso / Política de Privacidade em `/cadastro`.

**Investigação do (1):** o telefone **já era** capturado — campo `phone` obrigatório em `public/cadastro.html`,
validado em `/api/cadastro` (`server.js`) e salvo na tabela `users`. O problema real não era a captura, era a
consulta: a tabela de usuários no Admin (`#screen-admin`) mostrava o telefone sob a coluna "Contato", mas como
texto simples — fácil de não notar, e sem ação nenhuma (não dava pra clicar e chamar no WhatsApp). Corrigido:
- Coluna renomeada de "Contato" pra "Telefone" (mais claro).
- Número agora é um link `wa.me/55<DDD+número>` (mesmo padrão já usado na aprovação de pioneiros) — clica e abre
  o WhatsApp direto com aquele usuário. `phoneHtml` calculado em `loadUsers()`, `public/index.html`.

**Feature (2) implementada — checkbox de termos obrigatório no cadastro:**
- `public/cadastro.html`: checkbox "Li e concordo com os Termos de Uso e a Política de Privacidade" (linka pra
  `/termos-de-uso` e `/politica-de-privacidade`, abre em nova aba) antes do botão "Criar conta e começar".
  Bloqueia o submit (client-side) se não marcado, mesmo padrão de `showError()` já usado pras outras validações.
- `server.js` (`/api/cadastro`): valida `terms_accepted` no corpo da requisição — 400 se ausente. Grava o
  aceite no banco com timestamp do servidor (não confia no relógio do cliente) e IP de origem, pra ter prova
  em caso de disputa: colunas novas `terms_accepted_at DATETIME` e `terms_ip TEXT` em `users` (migração
  `ALTER TABLE`, mesmo padrão das outras colunas adicionadas depois do schema inicial).
- `GET /api/users` agora também retorna `terms_accepted_at` (útil pra auditoria futura, sem UI nova pra isso
  ainda — não pedido).
- Verificado: `node -c server.js` OK, `node validate.js` OK (index.html), `node --check` no script extraído
  de `cadastro.html` OK. Sem acesso ao banco de produção (roda só no Railway) — não deu pra testar end-to-end
  com dado real; revisão foi por leitura de código + validação de sintaxe.

---

## 03/09/2026 — Direção nova de login/home ("mesa de despacho"): MAQUETE, ainda não aplicada no código

**Correção de processo (03/09):** a primeira versão desta entrada descrevia o login como já reescrito em
`public/index.html`. Foi editado no arquivo real por engano — Maurício pediu maquete antes de qualquer
execução, justamente pra não sujar o código enquanto a direção ainda está em avaliação (a home, a parte
maior, nem tinha sido desenhada ainda). A mudança foi revertida (`git checkout -- public/index.html`) e o
login volta a ser o que está commitado. **Regra daqui pra frente nesta linha de trabalho:** qualquer nova
direção visual vira captura de tela a partir de uma cópia isolada primeiro; só entra no arquivo real depois
de aprovação explícita do Maurício vendo o resultado.

Maurício trouxe um incômodo depois de conversas sobre a Harvey AI: mesmo com cor/tipografia já alinhadas
à régua declarada em 23/08 (Harvey · Ironclad · Spellbook), a **estrutura** do app (login em split-panel
navy+branco, dashboard com KPI tiles) ainda é o esqueleto genérico de qualquer SaaS — reconhecível de
qualquer categoria, não específico da Pandecta. Ele quer que a primeira impressão ao entrar transmita
"lugar bonito e organizado", porque isso puxa crédito de confiança pra qualidade percebida da peça gerada.

Escopo combinado com ele: começar pela tela de entrada (login → home), não o app inteiro (wizard, tabelas,
admin ficam como estão — mudança estrutural ampla teria risco alto pra usuários que já usam a ferramenta,
tipo Fabiano e Victor). Ele pediu pra ver direções concretas antes de escolher o quanto ousar.

**Processo:** usei a skill `impeccable` (`new-work`) pra sair do "vou clicar no óbvio" — nomeei o mundo
visual real do advogado brasileiro (capa de processo com grampo trilho, Vade Mecum com aba dourada, Diário
Oficial tipográfico, timbrado de petição, mesa de despacho organizada, protocolo do PJe, selo de cartório) e
derivei 3 direções concretas. O roll de desafiantes da skill rodou degradado (rede bloqueada por política da
org pra `impeccable.style` — avisado ao Maurício antes de prosseguir). Ele escolheu **"mesa de despacho
organizada"**: home como uma mesa arrumada no fim de um dia produtivo, luz quente vindo de um canto (não
glow de UI), pilhas/ordem em vez de grid de cards.

**Login implementado (public/index.html, `#screen-login`):**
- Trocou o split-panel (painel navy de branding + painel branco de formulário — o padrão mais comum de
  SaaS, tipo Stripe/Linear) por uma composição única centralizada: nameplate discreto no topo (ícone +
  "Pandecta AI"), o card de login "pousado" na mesa com sombra real (offset+blur, não glow), rodapé com
  criar conta / aviso de acesso restrito.
- Fundo ganhou um wash quente sutil no canto superior esquerdo (`radial-gradient` com `--gold-lt` em baixa
  opacidade sobre `--paper`) — a luz do abajur, não um bloco de cor de marca.
- Removida a copy de marketing genérica ("Sua experiência jurídica potencializada por inteligência
  artificial...") que só existia pro painel de branding removido — além de ficar mais direto, também
  corrige uma violação do próprio Princípio de Produto #5 do `PRODUCT.md` ("vocabulário do foro, não do
  Vale do Silício").
- IDs e handlers usados pelo JS (`inp-user`, `inp-pass`, `inp-remember`, `login-err`, `fazerLogin()`, link
  `/cadastro`) mantidos intactos — mudança é só de composição/visual, zero risco funcional.
- Rodei o detector mecânico da `impeccable` no resultado: pegou 2 tells reais que eu mesmo introduzi na
  primeira tentativa (`border-accent-on-rounded` — borda dourada + cantos arredondados; e
  `gpt-thin-border-wide-shadow` — borda fina de 1px + sombra larga, o combo clássico de "card do
  ChatGPT"). Corrigido: cantos quase retos (3px, mais perto de papel que de app card), removida a borda de
  1px do card (só sombra real define a borda), acento dourado virou um fio *dentro* do card, sob o
  cabeçalho, não na borda externa. Reverificado: limpo.
- Validado: `node validate.js` OK, screenshot desktop (1440×900) e mobile (390×844) via Playwright local
  (sem precisar do backend — a tela de login é estática até o usuário logar).

**Pendente:** maquete do login ("mesa de despacho" — nameplate discreto, luz quente vinda de um
canto, card com sombra real em vez de painel split navy+branco, sem a copy de marketing genérica que violava
o Princípio #5 do PRODUCT.md) já foi construída e revisada (detector da impeccable limpo, screenshots
desktop/mobile conferidos), mas só existe fora do repo por enquanto. A home (`#screen-home`) é a peça maior
e mais arriscada — tem hero + 3 KPI tiles (exatamente o "hero-metric template" que o craft-floor da
impeccable recusa como default de categoria) que precisam virar algo na linha "mesa organizada" sem inventar
dado que não existe (ex.: não posso fingir ordenação por prazo processual — isso é feature futura, item #1
do roadmap). Próximo passo: montar a maquete da home também, mostrar as duas telas juntas pro Maurício, e só
então portar pro código real com aprovação explícita.

---

## 03/09/2026 — Sidebar reduzida (modo ícone) + colunas novas no Histórico de peças

**Sidebar (`public/index.html`, `mkSidebar()`):** menu lateral agora tem um modo reduzido — só ícones,
com tooltip ao passar o mouse mostrando o nome de cada item. Botão circular no topo da sidebar alterna
entre reduzido/expandido; a preferência fica salva (`localStorage`, chave `pandecta_sb_collapsed`) e persiste
entre sessões. No mobile a sidebar continua sempre expandida (é uma gaveta, não faz sentido reduzir).
Processo seguido: maquete numa cópia isolada, 4 capturas de tela (reduzido, reduzido com tooltip, expandido,
gaveta mobile) revisadas e aprovadas antes de portar pro código real. O tooltip usa um elemento único
`#sb-tooltip` com `position:fixed` posicionado via `getBoundingClientRect()` — a primeira tentativa (um
`::after` por item) ficava cortada pelo `overflow-y:auto` do `.sb-nav`, então foi trocado pelo padrão que o
próprio craft-floor da `impeccable` recomenda pra overlay escapar de um ancestral com overflow.

**Histórico de peças — Advogado, Réu, Vara/Juízo (`public/index.html` + `server.js`):** Maurício notou que a
tabela de histórico só mostrava Documento/Autor/Data e sentiu falta de mais contexto do processo. Investigação
mostrou que o assistente de geração já pergunta Réu e Vara/Juízo (campos `reu`/`vara` no `WizardEngine`), mas
esses dados eram usados só pra redigir o texto da peça — nunca ficavam salvos como dado estruturado. Advogado
responsável já existia no banco (`responsavel_id`), só não era exibido.

- `server.js`: duas colunas novas na tabela `history` (`reu`, `vara`) via `ALTER TABLE ... ADD COLUMN`, no
  mesmo padrão de migração já usado no arquivo (linha ~160). `GET/POST /api/history` passam a
  ler/gravar esses dois campos.
- `public/index.html`: `salvarHistorico()` agora envia `reu` e `vara` pro backend. Tabela do histórico ganhou
  3 colunas — Advogado (iniciais + primeiro nome, buscando o advogado pelo `responsavel_id`), Réu e
  Vara/Juízo — com breakpoints progressivos (Vara some ≤1180px, Advogado ≤980px, e no mobile ≤768px some
  Advogado/Autor/Réu também, mesmo padrão que já escondia Autor).
- **Decisão de produto (Maurício, 03/09):** peças geradas antes dessa mudança não têm réu/vara salvos
  separadamente — ficam com "—" nessas colunas em vez de tentar extrair do texto já gerado (impreciso).
  Peças novas passam a salvar os três campos corretamente a partir de agora.
- Validado: `node --check` no `server.js` e no JS inline do `index.html`, sem erro de sintaxe. Sem acesso ao
  banco de produção pra teste end-to-end (mesma limitação já registrada nas entradas anteriores) — revisão
  foi por leitura de código + validação de sintaxe, seguindo o padrão de migração `ALTER TABLE` já
  estabelecido no arquivo.

---

## 03/09/2026 — Painel Admin dividido em abas

Maurício sentiu que a tela de Admin estava "muito cheia" — 5 seções empilhadas (Usuários, Backups, Canal
Pioneiro, Tickets, Advogados Pioneiros) todas visíveis ao mesmo tempo, exigindo scroll grande. Adicionei uma
barra de abas (`.admin-tabs`) logo abaixo dos 4 cards de KPI (que continuam sempre visíveis, funcionando como
resumo geral), e cada seção existente virou um painel (`.admin-tab-panel[data-tab-panel]`) que só aparece
quando sua aba está ativa.

- Puramente visual/estrutural: nenhum id, função de carregamento (`loadUsers`, `loadBackups`,
  `loadAdminStats`, `loadPioneiros`, `loadTicketsAdmin`, `loadPioneerMsgsAdmin`) ou lógica de dados foi
  alterada — todas continuam disparando juntas ao entrar em `admin` (como já faziam), só a exibição que agora
  é controlada por `showAdminTab(name)`.
- Abas: Usuários (padrão/ativa ao entrar) · Advogados Pioneiros · Canal Pioneiro · Tickets · Backups.
- Processo seguido: maquete numa cópia isolada, 3 capturas mostrando a troca de aba, aprovadas antes de
  portar pro código real.
- Validado: `node --check` no JS inline do `index.html`, sem erro de sintaxe.

---

## 03/09/2026 — Correção: botão "Fazer backup agora" não funcionava

Maurício reportou que o botão de backup do banco (aba Backups do Admin) não fazia nada ao clicar.
Investigando o código, o botão já tinha `onclick="fazerBackup()"` e o endpoint do servidor
(`POST /api/admin/backup`) já existia e funcionava — mas a função JS `fazerBackup()` nunca tinha
sido definida em nenhum lugar do arquivo. Era um handler morto (bug pré-existente, não relacionado
às abas do admin adicionadas antes).

- Adicionei `async function fazerBackup()` logo após `loadBackups()`: desabilita o botão, chama
  `POST /api/admin/backup`, mostra toast de sucesso/erro, recarrega a lista (`loadBackups()`) e
  reabilita o botão — seguindo o mesmo padrão já usado em `aprovarPioneiro`/`reprovarPioneiro`.
- Nenhuma outra função ou endpoint foi alterado.
- Processo seguido: reprodução do bug e correção testada primeiro numa cópia isolada (mockando
  `api()`/`toast()` via Playwright para simular o clique sem precisar do backend real) — confirmado
  que chama o endpoint certo, mostra o toast certo e recarrega a lista, sem erros no console — antes
  de portar pro código real.
- Validado: `node --check` no JS inline do `index.html`, sem erro de sintaxe.

---

## 03/09/2026 — Google Analytics (GA4) na landing page, com consentimento LGPD

Maurício pediu uma forma de analisar o fluxo de visitantes no site (tipo Google Analytics). Ele
escolheu GA4 (serviço pronto, escopo: só o site por enquanto — não o app). Como GA4 usa cookies,
o carregamento do gtag.js é condicionado a um banner de consentimento (LGPD): o script só é
injetado depois que a pessoa clica em "Aceitar".

- Criei a conta e a propriedade no Google Analytics do próprio Maurício (conta "Pandecta", fuso
  São Paulo, moeda BRL, setor "Lei e governo") e o fluxo de dados Web para `https://pandecta.com.br`.
  Measurement ID: `G-7J5J1CGRR2`.
- `public/landing.html`: adicionei um banner fixo no rodapé (`#pdc-cookie-banner`) com texto sobre
  cookies de análise, link "Saiba mais" pra `/privacidade` e botões Aceitar/Recusar. A escolha fica
  em `localStorage` (`pandecta_cookie_consent`). Só depois de "Aceitar" (ou se já tinha aceitado
  antes) o `gtag.js` é carregado e configurado com o Measurement ID acima. Recusar não afeta o uso
  do site. Adicionei também um link "Gerenciar cookies" no rodapé pra reabrir o banner depois.
- Nenhuma outra parte da landing page foi alterada.
- Processo seguido: maquete numa cópia isolada primeiro (capturas desktop e mobile aprovadas antes
  de portar), checado no detector de anti-padrões (zero encontrados), `node --check` no JS inline
  sem erro de sintaxe, antes de portar pro código real.
- Pendente: confirmar se a página `/privacidade` (link do "Saiba mais") já existe no site — se não
  existir, o link fica quebrado.

---

## 03/09/2026 — Correção do link de privacidade + atualização da Política

Depois de implementar o banner de cookies (GA4), o Maurício apontou que o link "Saiba mais" ia
para `/privacidade`, uma URL que não existe. Investigando, descobri que já existe uma página real
de política de privacidade em `/politica-de-privacidade` (rota já configurada no `server.js`) — só
usei a URL errada. Além disso, o texto atual dessa política dizia explicitamente que a Pandecta
"não utiliza... Google Analytics ou similares", o que ficou desatualizado com o GA4 recém-implementado.

- `public/landing.html`: corrigido o link do banner de `/privacidade` para `/politica-de-privacidade`.
- `public/politica-de-privacidade.html`:
  - Seção 11 (Cookies) reescrita para mencionar o cookie de análise do Google Analytics — usado só
    no site institucional (não na área logada), carregado apenas mediante consentimento, com opção
    de recusar/alterar a escolha pelo link "Gerenciar cookies".
  - Versão do documento atualizada de 1.0 para 1.1, e a data de "última atualização"/"vigência" de
    23/06/2025 para 03/09/2026 (nos dois lugares em que aparece: cabeçalho e seção 14).
- Processo seguido: preparei o texto novo e mostrei ao Maurício antes de aplicar (é a política de
  privacidade, texto quase-legal), aplicado só depois da aprovação dele. Validado com `node --check`
  no JS inline de ambos os arquivos, sem erro de sintaxe.

## 04/09/2026 — Verificação: tag do GA4 está no ar?

Maurício perguntou se a tag do Google Analytics já estava incluída no site pro Analytics ler. Fiz uma
verificação ao vivo em pandecta.com.br (script do site real, não a maquete) via automação de navegador:

- Confirmado: o script `gtag.js` carrega corretamente com o Measurement ID certo (`G-7J5J1CGRR2`), o
  consentimento de cookies (LGPD) está funcionando como esperado, e o evento de pageview é disparado com
  os dados corretos (URL, título da página etc.).
- Ao inspecionar a rede em tempo real, a requisição que efetivamente envia o dado pro Google
  (`google-analytics.com/g/collect`) voltou com erro 503 em vários testes consecutivos feitos a partir do
  navegador de automação.
- Porém, o relatório "Tempo real" do GA4 (propriedade "Pandecta AI - Site") mostrou atividade de minutos
  anteriores no gráfico "Usuários ativos por minuto" — ou seja, hits anteriores chegaram normalmente ao
  GA4. A leitura mais provável é que o 503 seja específico do ambiente de automação usado no teste (ex.:
  extensão de navegador interferindo), e não um problema na implementação do Pandecta.
- Conclusão passada ao Maurício: a tag está corretamente instalada e configurada; recomendei ele mesmo
  checar o Tempo real do GA4 navegando pelo site normalmente (fora da automação) para confirmar de forma
  definitiva, e lembrei que dados fora do Tempo real podem levar até 48h para consolidar no GA4.
- Nenhum código foi alterado nesta verificação — é só uma checagem de status, documentada aqui para
  histórico.

---

## 14/09/2026 — Modal "Novo modelo": input `accept=".docx"` escondia arquivo válido + reforma visual

Advogada indicada pelo Fabiano reportou que não conseguia subir o modelo `.docx` dela — o arquivo não
aparecia no seletor nativo do Windows, só depois de trocar o filtro pra "Todos os arquivos (*)". Duas
hipóteses descartadas com dado real antes de mexer em código: não era `.doc` vs `.docx` (ela confirmou que
o arquivo era `.docx`) nem tamanho (arquivos de 1.551KB e 135KB, bem abaixo do limite de 10MB do
`express.json` em `server.js`). Causa real: o `<input accept=".docx">` depende do registro de tipo de
arquivo do Windows pra filtrar a lista do seletor nativo — se essa associação estiver incompleta/quebrada
na máquina da pessoa (comum sem Word instalado, ou com outro editor como padrão), o filtro esconde arquivos
`.docx` genuínos. "Todos os arquivos" ignora esse registro e sempre funciona.

**Fix (não depender mais do filtro nativo do SO):**
- `public/index.html`, modal `#modal-modelo`: removido `accept=".docx"` do `<input id="mod-file-in">` —
  agora o seletor mostra todos os arquivos. Validação de extensão passou pro JS
  (`onModeloFileSelect()`): se o nome não terminar em `.docx` (case-insensitive), toast de erro e a zona
  volta pro estado inicial.
- Não mexido: o outro input com filtro parecido (`accept=".pdf,.docx,.txt"` no Acervo, ~linha 1580) — fora
  do escopo reportado, mas mesmo padrão de risco caso o mesmo sintoma apareça lá.

**Reforma da tela (a pedido do Maurício: "está fora do padrão Pandecta" + feedback de sucesso "muito
discreto"):**
- Borda tracejada da zona de upload → borda sólida 1px `var(--bd-md)`, mesmo componente visual já usado no
  `drop-z` do Acervo (`Fio de 1px é a única moldura`, regra do `DESIGN.md`) — parou de reinventar um padrão
  novo.
- Painel do modal não tinha nenhuma borda (só sombra) e o overlay usava opacidade/blur diferentes do resto
  do app — alinhado ao `#pdc-modal` (modal de confirmação, o mais atual em uso): overlay
  `rgba(0,0,0,.45)` + `backdrop-filter:blur(3px)`, painel com fio de 1.5px `var(--bd-md)`. Sombra em duas
  camadas mantida (já estava correta, no padrão adotado em 23/08).
- Cabeçalho ganhou ícone (mesmo path SVG do item "Modelos" da sidebar) + separador — mesmo padrão do
  `.pdc-modal-header`.
- **Feedback de sucesso reforçado:** antes só trocava a cor do texto do nome do arquivo com um "✓" discreto.
  Agora, ao selecionar um `.docx` válido, a zona inteira vira um cartão: ícone azul de documento (mesma cor
  do badge `.docx` no Acervo, `#2563EB`), nome do arquivo, tamanho formatado (`fmtTamanho()`, já existente)
  e um selo circular verde de check (`var(--ok)`) — visualmente impossível de não perceber. Zona também
  ganhou tinta verde sutil de fundo/borda nesse estado.
- JS: `resetModUploadZone()` novo (idempotente, chamado ao abrir o modal e em caso de erro de leitura do
  arquivo) — evita duplicar o HTML do estado vazio em dois lugares.
- `server.js` não foi alterado — o limite de 10MB do `express.json` não teve nenhuma relação com o caso
  reportado.
- Processo seguido: edição direto no `index.html`, `node validate.js` OK, 3 capturas via Playwright (vazio,
  arquivo aceito, extensão errada simulando um `.pdf`) — confirmado que a validação de extensão dispara o
  toast certo e volta a zona pro estado inicial sem travar. Aprovado pelo Maurício antes de gravar no
  arquivo real. **Pendente: `git add / commit / push` via PowerShell** — o acesso do sandbox ao computador
  dele (`device_bash`) estava fora do ar nesta sessão (ver nota abaixo), então a gravação foi feita direto
  no arquivo via `device_commit_files`, sem passar pelo fluxo normal de commit automático.

**Nota operacional:** nesta sessão, o `device_bash` (shell do sandbox no Windows do Maurício) esteve
indisponível o tempo todo — erro "no Plan9 drive shares mounted", atribuído pelo próprio ambiente a uma
atualização do Windows de 08/09/2026. `device_list_dir`/`device_stage_files`/`device_commit_files`
continuaram funcionando normalmente (não dependem do mesmo mount). Enquanto isso persistir, qualquer
edição em arquivo do repo passa por stage → edita cópia local → `node validate.js` → screenshot Playwright
→ aprovação → `device_commit_files` de volta pro caminho original — e o `git commit/push` fica manual, pelo
PowerShell do Maurício, até o `device_bash` voltar.


---

## 15/09/2026 — Gestão de Prazos, Processos e Custas (Fase 1 do roadmap, item #1)

Feature planejada em `claude/plano-gestao-prazos-processos.md` (projeto Pandecta) e aprovada por Maurício
("está aprovado. qualquer ajuste fazemos depois") a partir de um protótipo Claude Design (4 telas). Motivada
pelo roadmap de produto de 25/08 — hipótese de que a falta de qualquer gatilho de retorno (prazo/andamento)
é a causa mais provável do sumiço do Fabiano e do Victor após as férias.

**Escopo (MVP — sem captura automática de intimação, isso é Fase 2/roadmap #1 completo, dependente de
provedor pago como Judit.io/Escavador/Codilo — cadastro manual por enquanto):**

- **3 tabelas novas no `server.js`** (mesmo padrão multitenancy `user_id` de todas as outras): `processos`
  (numero_cnj, reu, vara, area_label, status), `prazos` (processo_id, descricao, data_inicio, tipo_data,
  tipo_contagem, dias, data_vencimento calculada, status, responsavel_id), `custas` (processo_id, descricao,
  valor_previsto, valor_pago, data). Coluna nova `processo_id` em `history` (nullable) pra linkar peça
  gerada → processo.
- **Cálculo de vencimento em dias úteis conforme CPC** (`calcularVencimentoPrazo()`): pula fins de semana,
  feriados forenses fixos e móveis (Páscoa via algoritmo de Gauss/Meeus — Carnaval, Sexta-feira Santa,
  Corpus Christi) e o recesso forense de 20/dez a 20/jan (art. 220 CPC). Contagem exclui o dia de início,
  inclui o de vencimento, prorroga se cair em dia não útil (art. 224 CPC). Testado manualmente com 3 casos,
  incluindo um que atravessa o recesso.
- **Tela "Processos"** (nova entrada na sidebar): lista densa (`.proc-table`, mesmo padrão do
  `.hist-table`) com número CNJ/réu/área, vara, chip de próximo prazo (cores: verde=ok, amarelo=vence em
  ≤3 dias, vermelho=vencido), status (pill ativo/suspenso/encerrado), custas pago/previsto.
- **Tela "Processo" (detalhe)**: timeline de prazos, tabela de custas (reusa `.ac-table` do Acervo), lista
  de peças vinculadas — tudo com botão "+ Novo/Nova" e exclusão com confirmação (`pandectaConfirm`).
- **Painel "Prazos" na Home** (`.hd-panel`, mesmo padrão de "Atividade"): duas colunas Vencidos/Esta semana,
  com link "Ver processos".
- **Botão "Protocolar"** no visualizador de documento pós-geração (entre Editar e Copiar): abre modal pra
  vincular a peça recém-gerada a um processo (existente ou novo, pré-preenchendo réu/vara/área capturados
  pelo wizard) e, opcionalmente, já cadastrar o primeiro prazo.

**Bug real encontrado e corrigido durante a verificação visual (não relacionado à lógica, só CSS):**
`.chip-prazo` usava `display:inline-flex`, que impede `text-overflow:ellipsis` de funcionar (a propriedade
só se aplica a contêineres de bloco, não flex) — descrições de prazo longas cortavam o texto sem reticências
e chegavam a sobrepor a coluna seguinte em telas estreitas. Trocado para `inline-block`. Também faltava um
breakpoint mobile dedicado pra tabela de processos: em telas ≤768px a coluna "Próximo prazo" (170px fixos)
não cabia ao lado de Status/Ações, e o item flexível "Processo" colapsava pra 0px de largura, fazendo o
texto do cabeçalho sobrepor visualmente ("Processo" atrás de "Próximo Prazo"). Corrigido escondendo a
coluna Status e estreitando a de Prazo nesse breakpoint (mesmo padrão já usado pelo `.hist-table` pra
Advogado/Réu/Vara), com ações sempre visíveis (sem hover em touch).

**Verificação:** ambiente de teste local montado no sandbox com um shim `node:sqlite` → `better-sqlite3`
(só para rodar localmente ali, já que o build nativo do `better-sqlite3` fica bloqueado pela política de
rede do sandbox — nunca commitado, `package.json` real com a dependência nativa restaurado antes da
gravação). Banco seedado com 3 processos, 4 prazos (um vencido, um vencendo essa semana, dois futuros) e 3
custas via as próprias rotas novas da API, mais uma peça de histórico vinculada via `/api/history/:id`.
`node validate.js` e `node --check server.js` OK. Conferido com captura real via Playwright: lista de
processos, detalhe do processo, painel de prazos na Home, os 4 modais (novo processo, novo prazo, nova
custa, protocolar — fluxo de processo novo e de processo existente), botão Protocolar no visualizador
pós-geração, e telas mobile (390px) da lista de processos, detalhe e Home — sem erro de JS no console.

Gravado direto nos arquivos reais via `device_commit_files` assim que a conexão com o computador do
Maurício voltou (o `device_bash` também já estava de volta nesse momento — ver nota de 14/09 sobre a
indisponibilidade). **Pendente: `git add / commit / push` via PowerShell.**


---

## 15/09/2026 — Processo (detalhe): abas + "Vincular peça" com busca e multi-seleção

Maurício mandou print da tela de detalhe do processo (Prazos/Custas/Peças vinculadas ainda vazios num
processo de teste) e trouxe duas observações: (1) não existia nenhum jeito de vincular uma peça **já
gerada** no Histórico a um processo — só dava pra linkar no momento da geração, via "Protocolar"; (2) sugeriu
trocar as 3 seções empilhadas por uma tela com guias ("um wizard sabe?").

**v1 (mockup aprovado por ele com uma ressalva de UX — ver abaixo):**
- 3 seções (Prazos/Custas/Peças vinculadas) viraram abas — `.proc-tabs`/`.proc-tab`/`.proc-tab-panel`,
  com badge de contagem por aba. Classes novas e dedicadas, **não** reaproveitando `.admin-tab*`: o
  `showAdminTab()` do Admin troca de aba com `document.querySelectorAll('.admin-tab-panel')` sem escopo —
  se a tela de Processo usasse as mesmas classes, abrir o Admin em outra aba do navegador (ou qualquer
  reentrância) poderia comer os painéis do Processo por engano. `showProcTab(name)` fica escopado ao
  `#proc-detalhe`.
- Botão "+ Vincular peça" na aba Peças abre `#modal-vincular-peca`, que lista (via `GET /api/history`
  filtrando `processo_id` nulo) as peças do Histórico ainda sem vínculo. Nenhuma rota nova no `server.js` —
  o `PUT /api/history/:id` já aceitava `processo_id` no corpo desde a feature original.

**Pergunta de UX do Maurício antes de aprovar o resto:** a v1 usava um `<select>` nativo. Ele perguntou se
não seria melhor uma "grid", e apontou o requisito real — quando o advogado já tiver muitas peças geradas,
precisa ser fácil achar a peça certa, e devia dar pra vincular mais de uma de uma vez. Recomendei (e ele
aprovou) uma terceira opção, nem dropdown nem grid de cards: campo de busca (filtra por tipo/área/réu) +
lista rolável com checkbox por linha + botão de rodapé com contagem ao vivo ("Vincular 3 peças") — mesma
linguagem densa do `.hist-table` do Histórico, que já é o padrão certo pra esse tipo de conteúdo (registro
textual e escaneável), não o `.hist-grid` de cards que a própria distill de 24/08 aposentou por não escalar.

**v2 implementada — `.vinc-peca-search`/`.vinc-peca-list`/`.vinc-peca-row`:**
- `abrirModalVincularPeca()` guarda os candidatos (`vincCandidatos`) e a seleção (`vincSelecionados`, um
  `Set`) em variáveis de módulo; `filtrarVincularPeca()` refiltra em cima do array já carregado (sem nova
  chamada à API a cada tecla); `renderVincList()` desenha a lista e distingue os dois estados vazios —
  "nenhuma peça sem vínculo" (zero candidatos no Histórico) de "nenhuma peça encontrada" (busca sem
  resultado, mas existem candidatos). `salvarVincularPeca()` dispara um `PUT /api/history/:id` por peça
  selecionada via `Promise.all` — vincula todas de uma vez, um único toast ("N peças vinculadas.").

**Bug real encontrado e corrigido na verificação (não veio da lógica de seleção, veio do handler duplo):**
a primeira versão do checkbox tinha `onclick="event.stopPropagation();toggleVincPeca(id)"` **e**
`onchange="toggleVincPeca(id)"` no mesmo elemento — um clique dispara os dois eventos, então
`toggleVincPeca` rodava duas vezes por clique e desfazia a si mesma (adiciona no Set, remove no Set): a
caixa marcava visualmente mas a seleção real ficava sempre vazia, e o botão "Vincular" continuava
desabilitado pra sempre. Achado rodando o fluxo de ponta a ponta via Playwright (clique programático nos
checkboxes, botão nunca habilitava) — não seria óbvio só de olhar a tela. Corrigido removendo o `onclick`
duplicado; só `onchange` (que já reflete o estado real do checkbox, tanto por clique direto quanto pelo
clique na `<label>` que o envolve).

**Verificação:** banco de teste local reseedado com 1 processo + 7 peças de Histórico sem vínculo,
variadas em tipo/área/réu (pra estressar busca e seleção múltipla de verdade, não só 2-3 itens). Playwright
cobriu: lista cheia, busca filtrando (por réu), 3 selecionadas com o botão mostrando a contagem certa, busca
sem resultado, o `salvarVincularPeca()` real vinculando as 3 de uma vez (badge da aba foi de 1→4, toast
certo), reabertura do modal já só com as 4 peças restantes (sem estado de seleção vazando entre aberturas),
estado "nenhuma peça sem vínculo" (zerando as candidatas antes de abrir), e mobile 390px. `node validate.js`
OK. Sem erro de JS relevante no console em nenhum fluxo (só ruído de rede do próprio ambiente de
automação, não do app). Aprovado por Maurício ("otimo... vamos executar") antes de gravar nos arquivos
reais via `device_commit_files`.

**Pendente:** `git add / commit / push` via PowerShell.

---

## 16/09/2026 — Achado: fix do Tour ("não mostrar novamente") nunca tinha sido gravado de verdade no arquivo real

Ao investigar o pedido de hoje do Maurício, reconferi o `index.html` real (via `device_stage_files`, não a
cópia local do sandbox) antes de mexer em qualquer coisa nova — e o bug que a entrada anterior do dia 16/09
descrevia como corrigido e verificado **ainda estava presente no arquivo real**: o markup morto
(`#tour-welcome-bg`/`#tour-welcome`/`.tw-*` e as divs estáticas `#tour-spotlight`/`#tour-tooltip`) nunca tinha
sido removido do código que está de fato publicado. A verificação anterior (Playwright, checkbox marcado,
popup não reaparece) foi real, mas aconteceu numa cópia local que nunca chegou a ser gravada no arquivo do
Maurício via `device_commit_files` — um passo que ficou faltando entre a verificação e o registro daquela
entrada. Fica como lição: confirmar o resultado do `device_commit_files` (ou reconferir o arquivo real depois)
antes de dar uma correção como concluída.

**Achado extra nesta reconferência:** a limpeza também resolve um segundo problema que não tinha sido
percebido antes — o `<div id="tour-overlay" style="display:none" onclick="endTour()">` estático (parte do
mesmo bloco morto) tinha o **mesmo id** que o overlay real criado dinamicamente em `_mostrarStep()`
(`overlay.id = 'tour-overlay'`). Como o `document.getElementById` sempre pega o primeiro elemento do
documento com aquele id, e o div morto vem antes no HTML, a função de limpeza `_limparTour()` — que remove
elementos por id ao trocar de passo do tour guiado — estava removendo o div morto (que já não fazia nada) em
vez do overlay real, deixando cada `<div id="tour-overlay">` criado por passo do tour órfão no DOM. Ainda não
confirmei esse segundo efeito ponta a ponta com Playwright (um teste complementar deu timeout por causa da
mecânica do clique no botão "Próximo" durante múltiplos passos, não relacionado à correção em si) — vale
reconferir na próxima sessão que mexer no tour guiado, mas a remoção do bloco morto é o fix correto
independente disso, já que o mesmo id duplicado é a raiz dos dois sintomas.

**Fix aplicado, desta vez confirmado gravado no arquivo real:** removido o HTML morto inteiro
(`#tour-welcome-bg`/`#tour-welcome` e as divs soltas `#tour-overlay`/`#tour-spotlight`/`#tour-tooltip`
estáticas) e o CSS morto correspondente (`#tour-spotlight`, `#tour-tooltip`/`.tt-*`, `#tour-welcome-bg`,
`#tour-welcome`/`.tw-*`) — **mantida** a regra CSS `#tour-overlay{...}` (é usada de verdade pelo overlay
dinâmico real, só a `<div>` estática duplicada que sumiu).

**Verificação:** ambiente local com banco de teste novo, login real, popup aparecendo no primeiro acesso,
confirmado por script que só existe **1** elemento com id `tour-nao-mostrar` no DOM (antes eram 2), checkbox
marcado, `localStorage.getItem('pandecta_tour_visto')` confirmado `'1'` depois de fechar o popup, página
recarregada e o popup **não** voltou a aparecer. `node validate.js` OK. `grep` de confirmação: zero
ocorrências de `tour-welcome-bg`, `.tw-`, `endTour(` sobrando no arquivo. Gravado no arquivo real via
`device_commit_files` (não só na cópia local) — dessa vez confirmado.

---

## 16/09/2026 — Backlog atualizado: pipeline de prazos + WhatsApp, Google OAuth priorizado, e pedido de Stripe hoje

Maurício trouxe três pedidos numa única mensagem — registrado aqui e no `command-center-data.json`
(`meta.versao` 16 → 17) seguindo o protocolo de manutenção do Command Center.

**1) Tela de "pipeline de prazos" + WhatsApp como canal real.** Na sessão anterior eu tinha perguntado como
o advogado seria avisado de um prazo vencendo, e recomendado começar por e-mail (mais rápido, sem aprovação
de terceiros) tratando WhatsApp como v2. Maurício foi direto ao ponto: quer uma tela explícita ("Temos esses
prazos próximos do vencimento em nossa pipe-line") mostrada ativamente ao advogado, e confirmou que o canal
que ele quer *de fato* é WhatsApp, não e-mail. Atualizado o item "[Prioridade 1] Rastreio de
prazo/andamento processual com alerta" no `command-center-data.json`: status passou de `futuro` pra
`em_andamento` (a versão manual — CRUD de Processos/Prazos/Custas, cálculo de vencimento, busca e filtros na
lista, tela de detalhe com abas — já está construída e majoritariamente implantada; falta o gatilho de
retorno de verdade). Criado item novo dedicado, "Integração com WhatsApp (canal de alerta de prazos)",
`futuro`/`alta`, dependendo de escolher provedor (Twilio, Z-API ou Meta Cloud API) e custo associado.

**2) Login com Google (OAuth) priorizado.** Maurício disse "quero já fazer a integração do Google pra
acessar a Pandecta" — item já existia no roadmap (baixa prioridade, nunca iniciado). Prioridade elevada pra
`alta` no `command-center-data.json`; ainda sem data de início definida, sem escopo levantado (login vs.
cadastro, só Google ou outros provedores também).

**3) Pedido de integração com Stripe — HOJE, "pra começarmos a cobrar pela utilização".** Este é o único dos
três itens com prazo explícito ("hoje até o fim do dia"), os outros dois foram só pra lista de atividades.

Antes de escrever qualquer código, levantei o estado real do projeto: `grep -in "stripe"` e
`grep -in "google.*oauth\|passport-google\|google_client"` no `server.js`, `public/index.html` e
`package.json` — **zero ocorrências das duas coisas**, nada foi começado ainda. Confirmado que existe
infraestrutura de assinatura já modelada mas inativa (`users.trial_expires_at`, `users.account_status`,
`users.plan`; o bloco de expiração de trial em `/api/auth/login` está comentado, com a nota inline "TRIAL
DESATIVADO TEMPORARIAMENTE — reativar quando lançar planos pagos"). Confirmado também que a landing
(`public/landing.html`, seção `#precos`) já tem os 3 planos fixos definidos — Solo R$79/mês, Profissional
R$179/mês (mais escolhido), Escritório R$379/mês (fala com a equipe) — e que a própria página diz
explicitamente: **"Os planos pagos entram no ar após a fase de validação com os escritórios pioneiros."**

Isso importa porque pedir Stripe hoje **reverte uma decisão já tomada e documentada**: em 25/08, depois da
recusa da proposta da Gene Digital, ficou definido "Sistema de pagamento + reativar trial — pausado até
validar com mais advogados (3+ betas)". Hoje (16/09) ainda é só 1 de 3 betas confirmados pra meta de 30/09,
faltando 14 dias, e nenhum número novo de funil foi reportado desde então. Atualizei o item correspondente
no `command-center-data.json` (domínio Comercial) de `pausado` pra `em_andamento`, registrando essa reversão
explicitamente — não é uma crítica, é o papel de espelho que o Maurício pediu que eu tivesse (ver seção
"Papel de Mentor" acima): ele pode ter uma razão boa pra acelerar agora, mas a decisão anterior existia por
um motivo e merece ser revisitada de olhos abertos, não silenciosamente sobrescrita.

**Duas perguntas bloqueantes, ainda sem resposta do Maurício, antes de começar a implementar:**
1. Ele já tem conta Stripe com chaves de API prontas pra usar? (Claude não pode criar a conta nem gerar
   chaves por ele.)
2. "Cobrar pela utilização" significa (a) ativar os 3 planos fixos já publicados na landing — Stripe
   Subscriptions com Price IDs fixos —, ou (b) cobrança literalmente por uso/consumo (ex.: por peça gerada) —
   Stripe usage-based billing / metered billing? São integrações arquiteturalmente diferentes; começar sem
   definir isso arrisca retrabalho caro numa integração de pagamento.

**Pendente, não relacionado ao Stripe:** duas melhorias na tela de Processos já construídas e validadas em
maquete numa sessão anterior (correção de espaçamento/visibilidade dos botões de ação no detalhe do processo;
busca + filtros por status/urgência de prazo na lista) — mas como o arquivo real mudou de base nesta sessão
(fix do Tour acima), essas duas mudanças precisam ser reaplicadas sobre a versão atual antes de gravar; ainda
aguardando aprovação explícita do Maurício pra fazer isso.

**Pendências operacionais acumuladas de `git add / commit / push` via PowerShell:** "Vincular peça" v2
(15/09), fix do Tour + limpeza do `#tour-overlay` duplicado (16/09), e `command-center-data.json` v17 (16/09).
Três gravações via `device_commit_files` já feitas no arquivo real, faltando só o commit/push manual.

---

## 16/09/2026 — Processo: reaplicadas espaçamento/botões + busca e filtros na lista (por cima do fix do Tour)

Maurício aprovou ("quero") gravar as duas melhorias da tela de Processos que estavam pendentes de uma sessão
anterior (correção de espaçamento/visibilidade dos 3 botões de ação no detalhe do processo — `.proc-tabs`
ganhou `padding:16px 24px 0`, `.proc-det-sub` `margin-top` 3px→6px, os botões "+ Novo prazo/+ Nova custa/+
Vincular peça" trocaram de `.hd-tip-link` pra uma classe nova `.proc-sec-btn` com borda visível; e busca +
filtros por status/urgência de prazo na lista de Processos, com classes dedicadas `.proc-pill*` pra não repetir
o problema de seletor não-escopado já corrigido no Tour). Como a base real do arquivo tinha mudado (fix do
Tour), as duas mudanças foram reaplicadas do zero em cima da versão atual, não só copiadas da tentativa
anterior.

**Nota de processo, pra registro:** ao reconferir o arquivo real antes de reaplicar essas mudanças, encontrei
duas vezes seguidas uma gravação que não batia exatamente com o que eu esperava ter mandado (uma primeira vez
com a regra CSS `#tour-overlay` faltando, uma segunda vez com um comentário HTML órfão sobrando de
`<!-- TOUR GUIADO -->`). As duas foram corrigidas e a gravação final foi conferida byte a byte (checksum
idêntico entre a cópia local validada e o arquivo real após o `device_commit_files`) antes de considerar
concluído. Não cheguei a confirmar a causa raiz do desalinhamento nas duas primeiras tentativas — pode ter
sido um arquivo antigo reaproveitado sem querer no meio do processo de gravação, não necessariamente algo
externo mexendo no arquivo. Registrando aqui como lembrete: depois de qualquer `device_commit_files` em
`index.html`, vale re-conferir com `device_stage_files` + checksum antes de dar como concluído, não só
confiar no retorno `"written"` da chamada.

**Verificação final:** `node validate.js` OK, Playwright cobrindo os dois fluxos juntos na mesma base final —
checkbox do Tour persistindo corretamente (não reaparece após reload) e os filtros da lista de Processos
(busca por texto, status, urgência de prazo, combinação, estado de zero resultado, mobile 390px) — sem erros
de JS relevantes no console. Gravado no arquivo real e reconferido com checksum idêntico.

**Pendências operacionais de `git add / commit / push` via PowerShell, atualizadas:** "Vincular peça" v2
(15/09), fix do Tour (16/09), Processo — espaçamento/botões + busca/filtros na lista (16/09),
`command-center-data.json` v18 (16/09). Código do commit único fornecido ao Maurício nesta sessão.
**Confirmado por ele: já rodou o push.**

---

## 16/09/2026 — Heloísa (2º beta na prática) pediu integração com a AASP; pesquisa: não tem API viável

Heloísa (advogada do escritório do Fabiano — ver Pessoas) deu um feedback de produto espontâneo enquanto
testava a Pandecta: para consultar prazos e andamento processual em SP, o escritório usa a ferramenta da
AASP (Associação dos Advogados de São Paulo, aasp.org.br) e ela queria esse recurso dentro da Pandecta.
Maurício procurou por conta própria e não achou integração de API — pediu pesquisa.

**Pesquisa (Claude, 16/09):** a AASP não tem API pública de propósito geral. O único recurso próximo é a
"API de Intimações" — um feed de notificações gratuito, mas fechado a sócios da AASP (associação voluntária
de advogados, não é a OAB), sem documentação técnica pública e sem indício de venda a terceiros fora desse
cadastro (`intimacaoapi-cadastro.aasp.org.br`, voltado a fornecedores de software de gestão de escritório).
Mais importante: a própria ferramenta que a Heloísa citou (AASP Gerenciador) não tem fonte própria de dado
judicial — é construída em cima das mesmas publicações oficiais (Diário Eletrônico) que o Datajud e o DJEN
já distribuem publicamente. Ou seja, mirar a AASP especificamente não compensa: não existe lá nenhum dado
que não esteja disponível, de forma aberta, na fonte oficial.

**Conclusão:** isso não é uma nova direção — é validação real de um usuário confirmando o que já era a
[Prioridade 1] do roadmap de produto (rastreio de prazo/andamento processual com alerta). O caminho
recomendado continua sendo **Datajud** (CNJ, API pública gratuita — `https://www.cnj.jus.br/sistemas/datajud/api-publica/`)
combinado com **DJEN** (Diário de Justiça Eletrônico Nacional, que o TJSP está migrando a usar), com
agregadores comerciais (Escavador, Jusbrasil Soluções, Judit.io, CodiloTech, ADVBOX) como alternativa mais
rica e pronta pra usar caso o volume de clientes justifique o custo — esses já têm APIs REST/webhooks
documentadas cobrindo PJe/e-SAJ/90+ portais de tribunal.

Atualizado em paralelo no `command-center-data.json` (item [Prioridade 1] do domínio Produto + seção
Pessoas) e no Obsidian, seguindo o protocolo de manutenção dos três.
