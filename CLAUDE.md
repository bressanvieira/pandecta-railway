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

### Pré-ExpoLaw (Outubro 2026)
- [ ] Histórico com visualizador papel (igual ao pós-geração)
- [ ] Busca ao vivo em jurisprudência
- [ ] Sistema de pagamento + reativar trial — **pausado até validar com mais advogados**

### Baixa prioridade
- [ ] Login com Google (OAuth 2.0)
- [ ] Domínio pandecta.ai

**Deadline: ExpoLaw — Outubro 2026**
