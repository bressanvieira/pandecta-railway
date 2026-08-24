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
- **Dashboard home** redesenhado: saudação, hero card, KPIs reais, 3 feature cards, insights rápidos, "Continue de onde parou", dica Pandecta
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
- **Fabiano** — beta tester principal. 30+ anos, 3 escritórios (Imobiliário ~50% + Consumidor + Contratos). Convite enviado 24/06/2026. Retorno positivo 03/07/2026 — usou 100% da peça, protocolou em juízo. Não conhece o Sistema de Modelos ainda (mostrar).
- **Kiko** — validou System Prompt v4 (22/05/2026)
- **Consultora técnica jurídica** *(nome pendente)* — validação pelo olhar jurídico

---

## Instagram — Posts publicados

- **Post 1** (26/06/2026): "20 Vagas — Advogado Pioneiro" — imagem estática navy+gold. Patrocinado.
- **Post 2** (26/06/2026): Carrossel 4 slides — demonstração do produto (wizard + petição gerada). Patrocinado.
- **Post 3** (26/06/2026): Logo + "A inteligência jurídica chegou." — imagem de marca.
- Arquivos em `brand/` e `pandecta-post2-slide*.png`
- **Observação:** Instagram pode não ser o canal ideal para advogados — público parece estar mais no LinkedIn/YouTube. Aguardar resultado do impulsionamento antes de investir mais.

---

## Concorrentes mapeados

- **Exordial AI** (exordial.ai) — similar, baseado em Goiânia. Têm: jurisprudência em chat, contratos, petição em lote, transcrição de áudio, editor de documento separado (/editor). Pouquíssima tração no Instagram (40 curtidas no maior post). Usam guardrails como marketing.
- **Enter AI** (getenter.ai) — mapeado anteriormente

---

## Obsidian

- **Vault:** `C:\Users\usuario\Documents\Obsidian Vault`
- **Projeto Jurídica AI:** `🗂️ Projetos\⚖️ Jurídica AI\`
- **Validações:** `📋 Validações de Advogados\`

---

## Próximos passos

### Imediato
- [ ] Mostrar Sistema de Modelos para o Fabiano (não sabe que existe — é o diferencial que ele mais pediu)
- [ ] Aguardar resultado do impulsionamento Instagram

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

