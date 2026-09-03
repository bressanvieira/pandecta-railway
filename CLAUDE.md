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
- **Nunca operar git pelo sandbox Linux** — o index.lock do Windows não é visível pelo sandbox e corrompe o repo
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
- **Fabiano** — beta tester principal. 30+ anos, 3 escritórios (Imobiliário ~50% + Consumidor + Contratos). Convite enviado 24/06/2026. Retorno positivo 03/07/2026 — usou 100% da peça, protocolou em juízo. Não conhece o Sistema de Modelos ainda (mostrar). **25/08:** sumiu logo após retornar de férias — Maurício já mandou mensagem de check-in sem cobrança, resposta pendente.
- **Victor** — outro contato próximo (detalhe de papel/histórico ainda não registrado aqui). **25/08:** mesmo padrão do Fabiano — sumiu ao voltar de férias. Maurício já mandou check-in, resposta pendente. Hipótese dele (intuição forte, **não confirmada**): o tempo livre deu espaço pra conversar com alguém que ofereceu construir algo parecido (ex.: amigo diretor de TI do Fabiano).
- **Kiko** — validou System Prompt v4 (22/05/2026)
- **Consultora técnica jurídica** *(nome pendente)* — validação pelo olhar jurídico

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
