# Pandecta AI — CLAUDE.md

SaaS de inteligência jurídica para advogados brasileiros. Gera petições, contestações, recursos, contratos e notificações via IA (Claude). Especializado em Direito do Consumidor, Civil, Trabalhista e de Família.

**Identidade:** "A Pandecta" — artigo feminino, sempre.

---

## Stack

- **Frontend:** SPA vanilla JS/CSS/HTML em `public/index.html` (~3200 linhas)
- **Backend:** Node.js + Express em `server.js` (~1100 linhas)
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
- bcryptjs para senhas | trial 7 dias | roles: `user` / `admin`

### Edição do index.html
- **Nunca usar `open(..., 'w')`** em Python — trunca o arquivo. Usar modo binário + verificar `endswith(b'</html>')`
- **Edit tool trunca** index.html em template literals JS — preferir Python para edições grandes
- Sempre verificar integridade após salvar

### Git
- **Nunca operar git pelo sandbox Linux** — o index.lock do Windows não é visível pelo sandbox e corrompe o repo
- Sempre usar PowerShell para `git add / commit / push`
- Workflow: sandbox edita → copia para `pandecta-railway\public\` → PowerShell faz o commit

### Sidebar
- A sidebar é reconstruída via `mkSidebar(active)` a cada `go(screen)` — não persistir estado nela
- Para selecionar elemento da sidebar no tour: `.screen.active .sb-item.active`

### Acervo
- `buscarContextoUsuario(userId, pergunta, topN=8)` — normaliza acentos, palavras ≥ 2 chars
- Docs legados sem user_id: usar `OR user_id IS NULL` na query
- Rota `POST /api/acervo/reindexar` corrige user_id NULL em docs antigos

### Office
- `GET /api/office` cria registro vazio com `INSERT OR IGNORE` se não existir para o user

---

## Workflow de deploy

```powershell
# Após editar no sandbox (via pasta Pandecta como intermediário):
Copy-Item "C:\Users\usuario\Claude\Projects\Pandecta\index.html" "C:\Users\usuario\pandecta-railway\public\index.html"
cd C:\Users\usuario\pandecta-railway
git add .
git commit -m "feat/fix: descrição"
git push
# Railway faz deploy automático
```

---

## Funcionalidades implementadas

- Auth (bcrypt + JWT + signup + trial)
- Multitenancy completo (todas as tabelas isoladas por user_id)
- Construtor wizard: tipo → área → partes → fatos → responsável → modelo de estilo
- Sistema de Modelos: `.docx` → mammoth extrai texto → Claude usa como referência de estilo
- Histórico com edição, cópia e exportação Word
- Acervo (PDF/DOCX/TXT) com RAG por keyword
- Assistente multi-turn com contexto do acervo
- Equipe (CRUD advogados)
- Configurações (dados escritório + logo)
- Tour guiado (spotlight + popup boas-vindas com "não mostrar novamente")
- Landing page pandecta.com.br + páginas legais (Termos, PP, LGPD)
- Admin panel
- **Dashboard home** redesenhado: saudação, hero card, KPIs reais, 3 feature cards, insights rápidos, "Continue de onde parou", dica Pandecta
- **Trial countdown** no sidebar: barra regressiva 7→0 dias, modal de expiração ao terminar
- **Sino de notificações** sempre visível para admin/pioneer; badge só aparece com mensagens novas
- **Tour guiado** corrigido: spotlight visível, menu item branco durante highlight, retorna ao Início no Concluir
- **validate.js** — validador pré-deploy: checa sintaxe JS dos `<script>` inline e IDs/funções obrigatórios

### Bugs corrigidos (26/06/2026)
- `\${_sbTrialBlock()}` escapado em template literal impedia renderização da barra de trial
- `trial_expires_at` NULL para usuários antigos: server.js agora computa `created_at + 7 dias` como fallback e persiste no banco
- Tour crashava após step 2: `const el` era block-scoped dentro de `if(step.selector){}` — corrigido para `let el = null` no escopo externo

---

## Pessoas

- **Maurício** — fundador, dev, PO. Atibaia – SP. `mauriciovbressan@gmail.com`
- **Fabiano** — beta tester principal. 30+ anos, 3 escritórios (Imobiliário ~50% + Consumidor + Contratos). Convite enviado 24/06/2026.
- **Kiko** — validou System Prompt v4 (22/05/2026)
- **Consultora técnica jurídica** *(nome pendente)* — validação pelo olhar jurídico

---

## Instagram — Posts publicados

- **Post 1** (26/06/2026): "20 Vagas — Advogado Pioneiro" — imagem estática navy+gold. Patrocinado.
- **Post 2** (26/06/2026): Carrossel 4 slides — demonstração do produto (wizard + petição gerada). Patrocinado.
- **Post 3** (26/06/2026): Logo + "A inteligência jurídica chegou." — imagem de marca.
- Arquivos em `brand/` e `pandecta-post2-slide*.png`

---

## Próximos passos

- [ ] Resultado do impulsionamento Instagram (aguardar)
- [ ] Feedback piloto Fabiano
- [ ] Módulo Direito Imobiliário (Lei 8.245/91)
- [ ] Busca ao vivo em jurisprudência
- [ ] Sistema de pagamento (Stripe ou Hotmart)
- [ ] Domínio pandecta.ai
- **Deadline: ExpoLaw — Outubro 2026**
