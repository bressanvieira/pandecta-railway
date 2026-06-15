// ═══════════════════════════════════════════════════════════════════
//  PANDECTA — Express Server v3  (Railway)
//  - SQLite persistence: lawyers, office, history, acervo
//  - POST /api/gerar           → SSE stream de petição
//  - CRUD /api/lawyers
//  - GET/PUT /api/office
//  - CRUD /api/history
//  - CRUD /api/acervo  +  POST /api/acervo/buscar
// ═══════════════════════════════════════════════════════════════════

const express   = require('express');
const Anthropic  = require('@anthropic-ai/sdk');
const path      = require('path');
const fs        = require('fs');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'pandecta-dev-secret-trocar-em-producao';

const app  = express();
const PORT = process.env.PORT || 3000;

// ── DATABASE ──────────────────────────────────────────────────────────────────

let db = null;
try {
  const Database = require('better-sqlite3');
  const dbDir  = process.env.DB_PATH
    ? path.dirname(process.env.DB_PATH)
    : path.join(__dirname, 'data');
  const dbPath = process.env.DB_PATH || path.join(dbDir, 'pandecta.db');

  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS lawyers (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      nome       TEXT NOT NULL,
      oab        TEXT DEFAULT '',
      uf         TEXT DEFAULT '',
      email      TEXT DEFAULT '',
      cargo      TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS office (
      id        INTEGER PRIMARY KEY CHECK (id = 1),
      nome      TEXT DEFAULT '',
      endereco  TEXT DEFAULT '',
      cidade    TEXT DEFAULT '',
      cep       TEXT DEFAULT '',
      telefone  TEXT DEFAULT '',
      email     TEXT DEFAULT '',
      logo      TEXT DEFAULT ''
    );
    INSERT OR IGNORE INTO office (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS history (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario       TEXT DEFAULT '',
      tipo          TEXT DEFAULT '',
      tipo_label    TEXT DEFAULT '',
      area_label    TEXT DEFAULT '',
      autor         TEXT DEFAULT '',
      responsavel_id INTEGER,
      texto         TEXT DEFAULT '',
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS acervo (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nome        TEXT NOT NULL,
      tipo        TEXT DEFAULT 'Outro',
      chunks      TEXT DEFAULT '[]',
      chunk_count INTEGER DEFAULT 0,
      tamanho     INTEGER DEFAULT 0,
      enviado_por TEXT DEFAULT '',
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nome          TEXT DEFAULT '',
      role          TEXT DEFAULT 'user',
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // migrations — adiciona colunas sem quebrar banco existente
  try { db.exec(`ALTER TABLE acervo ADD COLUMN tamanho INTEGER DEFAULT 0`); } catch(e) {}
  try { db.exec(`ALTER TABLE acervo ADD COLUMN enviado_por TEXT DEFAULT ''`); } catch(e) {}
  try { db.exec(`ALTER TABLE office ADD COLUMN logo TEXT DEFAULT ''`); } catch(e) {}

  // seed — cria usuário admin padrão se não existir
  const adminExists = db.prepare('SELECT id FROM users WHERE email=?').get('admin@pandecta.ai');
  if (!adminExists) {
    db.prepare('INSERT INTO users (email, password_hash, nome, role) VALUES (?,?,?,?)').run(
      'admin@pandecta.ai',
      bcrypt.hashSync('Pandecta@2026', 10),
      'Administrador',
      'admin'
    );
    console.log('✅  Usuário admin criado: admin@pandecta.ai / Pandecta@2026');
  }

  console.log('✅  Database:', dbPath);
} catch (err) {
  console.error('⚠️  Database init error (running without persistence):', err.message);
}

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '30d',
  etag: true,
  setHeaders: (res, filePath) => {
    // index.html nunca fica em cache — garante que o usuário sempre carrega a versão atual
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));
// Servir logos da pasta brand/ com cache longo
app.use('/brand', express.static(path.join(__dirname, 'brand'), { maxAge: '30d', etag: true }));

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ error: 'Não autenticado.' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

// ── AUTH ROUTES ───────────────────────────────────────────────────────────────

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios.' });
  if (!db) return res.status(503).json({ error: 'DB indisponível.' });
  try {
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email.trim().toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: 'Email ou senha incorretos.' });
    const token = jwt.sign({ userId: user.id, email: user.email, nome: user.nome, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, nome: user.nome, email: user.email, role: user.role });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/register', requireAuth, (req, res) => {
  // Só admin pode criar usuários
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Sem permissão.' });
  const { email, password, nome = '', role = 'user' } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios.' });
  if (password.length < 8) return res.status(400).json({ error: 'Senha deve ter no mínimo 8 caracteres.' });
  if (!db) return res.status(503).json({ error: 'DB indisponível.' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const r = db.prepare('INSERT INTO users (email,password_hash,nome,role) VALUES (?,?,?,?)').run(
      email.trim().toLowerCase(), hash, nome.trim(), role
    );
    res.json({ id: r.lastInsertRowid, email, nome, role });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email já cadastrado.' });
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ userId: req.user.userId, email: req.user.email, nome: req.user.nome, role: req.user.role });
});

// ── LAWYERS ───────────────────────────────────────────────────────────────────

app.get('/api/lawyers', requireAuth, (req, res) => {
  if (!db) return res.json([]);
  try {
    res.json(db.prepare('SELECT id, nome, oab, uf, email, cargo FROM lawyers ORDER BY nome ASC').all());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/lawyers', requireAuth, (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB indisponível.' });
  const { nome, oab = '', uf = '', email = '', cargo = '' } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome obrigatório.' });
  try {
    const r = db.prepare('INSERT INTO lawyers (nome,oab,uf,email,cargo) VALUES (?,?,?,?,?)').run(
      nome.trim(), oab.trim(), uf.trim().toUpperCase(), email.trim(), cargo.trim()
    );
    res.json({ id: r.lastInsertRowid, nome, oab, uf: uf.toUpperCase(), email, cargo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/lawyers/:id', requireAuth, (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB indisponível.' });
  const { nome, oab = '', uf = '', email = '', cargo = '' } = req.body;
  try {
    db.prepare('UPDATE lawyers SET nome=?,oab=?,uf=?,email=?,cargo=? WHERE id=?').run(
      nome, oab, uf.toUpperCase(), email, cargo, req.params.id
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/lawyers/:id', requireAuth, (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB indisponível.' });
  try {
    db.prepare('DELETE FROM lawyers WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── OFFICE ────────────────────────────────────────────────────────────────────

app.get('/api/office', requireAuth, (req, res) => {
  if (!db) return res.json({});
  try {
    res.json(db.prepare('SELECT nome,endereco,cidade,cep,telefone,email,logo FROM office WHERE id=1').get() || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/office', requireAuth, (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB indisponível.' });
  const { nome = '', endereco = '', cidade = '', cep = '', telefone = '', email = '', logo = '' } = req.body;
  try {
    db.prepare('UPDATE office SET nome=?,endereco=?,cidade=?,cep=?,telefone=?,email=?,logo=? WHERE id=1').run(
      nome, endereco, cidade, cep, telefone, email, logo
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── HISTORY ───────────────────────────────────────────────────────────────────

app.get('/api/history', requireAuth, (req, res) => {
  if (!db) return res.json([]);
  try {
    res.json(db.prepare(
      'SELECT id,usuario,tipo,tipo_label,area_label,autor,responsavel_id,texto,created_at FROM history ORDER BY created_at DESC LIMIT 100'
    ).all());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/history', requireAuth, (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB indisponível.' });
  const { usuario='',tipo='',tipo_label='',area_label='',autor='',responsavel_id=null,texto='' } = req.body;
  try {
    const r = db.prepare(
      'INSERT INTO history (usuario,tipo,tipo_label,area_label,autor,responsavel_id,texto) VALUES (?,?,?,?,?,?,?)'
    ).run(usuario, tipo, tipo_label, area_label, autor, responsavel_id || null, texto);
    res.json(db.prepare('SELECT * FROM history WHERE id=?').get(r.lastInsertRowid));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/history/:id', requireAuth, (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB indisponível.' });
  const { texto = '' } = req.body;
  try {
    db.prepare('UPDATE history SET texto=? WHERE id=?').run(texto, req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/history/:id', requireAuth, (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB indisponível.' });
  try {
    db.prepare('DELETE FROM history WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ACERVO ────────────────────────────────────────────────────────────────────

app.get('/api/acervo', requireAuth, (req, res) => {
  if (!db) return res.json([]);
  try {
    res.json(db.prepare('SELECT id,nome,tipo,chunk_count,tamanho,enviado_por,created_at FROM acervo ORDER BY created_at DESC').all());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/acervo', requireAuth, (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB indisponível.' });
  const { nome, tipo = 'Outro', chunks = [], tamanho = 0, enviado_por = '' } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome obrigatório.' });
  try {
    const r = db.prepare('INSERT INTO acervo (nome,tipo,chunks,chunk_count,tamanho,enviado_por) VALUES (?,?,?,?,?,?)').run(
      nome, tipo, JSON.stringify(chunks), chunks.length, tamanho, enviado_por
    );
    res.json({ id: r.lastInsertRowid, nome, tipo, chunk_count: chunks.length, tamanho, enviado_por });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/acervo/:id', requireAuth, (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB indisponível.' });
  try {
    db.prepare('DELETE FROM acervo WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/acervo/buscar', requireAuth, (req, res) => {
  if (!db) return res.json([]);
  const { query = '', top = 5 } = req.body;
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (!words.length) return res.json([]);
  try {
    const rows = db.prepare('SELECT nome, chunks FROM acervo').all();
    const scored = [];
    rows.forEach(row => {
      let chunks;
      try { chunks = JSON.parse(row.chunks || '[]'); } catch (e) { chunks = []; }
      chunks.forEach(c => {
        const lo = (c.texto || '').toLowerCase();
        const score = words.filter(w => lo.includes(w)).length / words.length;
        if (score > 0) scored.push({ texto: c.texto, fonte: row.nome, score });
      });
    });
    scored.sort((a, b) => b.score - a.score);
    res.json(scored.slice(0, top).map(c => ({ texto: c.texto, fonte: c.fonte })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ASSISTENTE PANDECTA ───────────────────────────────────────────────────────

const ASSISTENTE_PROMPT = `Você é o assistente do Pandecta AI — plataforma de inteligência jurídica para advogados brasileiros.
Responda dúvidas sobre as funcionalidades do sistema de forma clara, direta e amigável.

FUNCIONALIDADES DO PANDECTA:
• Nova Peça (botão "+ Novo"): Gera petições iniciais, contestações, recursos, notificações e contratos via IA. O fluxo coleta área jurídica, tipo de peça, dados do autor/réu, fatos e pedido.
• Histórico: Lista todas as peças geradas. É possível editar, copiar ou exportar para Word (.doc) com cabeçalho do escritório.
• Acervo: Base de documentos do escritório (PDF, DOCX, TXT). Os arquivos são lidos, divididos em trechos (chunks) e indexados. Esses trechos são usados como contexto na geração de peças — funciona como RAG (Retrieval-Augmented Generation).
• Equipe: Cadastro de advogados (nome, OAB, e-mail, cargo). O advogado responsável é selecionado ao gerar cada peça e aparece na assinatura do Word exportado.
• Configurações: Dados do escritório (nome, endereço, logo, cidade, CEP, telefone, e-mail) para o cabeçalho dos documentos exportados.
• Exportação Word: Gera arquivo .doc com cabeçalho do escritório (logo + dados), corpo da peça em formato jurídico e assinatura do advogado responsável.
• Sistema jurídico: Especializado em Direito do Consumidor (CDC/JEC), Civil, Trabalhista e de Família. Aplica regras automáticas como triage CDC, regras do JEC e estrutura em 7 seções para petições.

REGRAS:
- Seja objetivo, amigável e claro
- Responda sempre em português brasileiro
- Se a dúvida não for sobre o Pandecta, redirecione gentilmente
- Para dúvidas técnicas de uso, dê passos práticos
- Máximo 3–4 parágrafos por resposta`;

app.post('/api/assistente', requireAuth, async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { pergunta, historico = [] } = req.body || {};
  if (!pergunta) return res.status(400).json({ error: 'Pergunta obrigatória.' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key não configurada.' });

  res.setHeader('Content-Type',               'text/event-stream');
  res.setHeader('Cache-Control',              'no-cache, no-transform');
  res.setHeader('Connection',                 'keep-alive');
  res.setHeader('X-Accel-Buffering',          'no');
  res.flushHeaders();

  // monta historico multi-turn + pergunta atual
  const messages = [
    ...historico.slice(-16).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: pergunta },
  ];

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const stream = await client.messages.stream({
      model:       'claude-haiku-4-5-20251001',
      max_tokens:  1024,
      temperature: 0.4,
      system:      ASSISTENTE_PROMPT,
      messages,
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta')
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

app.options('/api/assistente', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(200).end();
});

// ── SYSTEM PROMPT V4 ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT_V4 = `Você é o Pandecta — assistente jurídico de precisão especializado em direito brasileiro.
Seu papel é auxiliar advogados a redigir documentos jurídicos de alta qualidade com base nos fatos fornecidos.

REGRAS INVIOLÁVEIS:
1. Cite sempre o fundamento legal (artigo, lei, súmula ou jurisprudência)
2. Linguagem jurídica formal e técnica contemporânea — sem arcaísmos ("se digne a" → "requer")
3. Nunca invente jurisprudência — use apenas o que foi fornecido no contexto
4. REGRA CRÍTICA DE DATAS: calcule os dias de privação/prejuízo até a DATA DE HOJE (data de protocolo), não até a data do último fato narrado
5. Ao final, adicione: "— Rascunho gerado por IA. Revisão e assinatura do advogado responsável obrigatórias. —"
6. Use nomenclatura uniforme: defina "1ª Ré" OU "1ª Requerida" e mantenha até o final

REGRA CRÍTICA — TRIAGE DE REGIME CDC (v4):
ANTES de qualquer fundamentação, identifique o regime correto:
- Produto/serviço causou DANO FÍSICO ou ACIDENTE? → Arts. 12 ou 14 CDC (fato)
- Produto SIMPLESMENTE NÃO FUNCIONA como deveria? → Art. 18 CDC (vício) ← mais comum no JEC
⚠️ NUNCA combine Art. 12/14 com Art. 18 na mesma fundamentação. São regimes distintos.
Art. 18 CDC: prazo 30 dias para sanar + 90 dias decadencial (Art. 26, II CDC)
Art. 12 CDC: produto causa dano físico + 5 anos prescricional (Art. 27 CDC)
Art. 14 CDC: serviço causa dano físico + 5 anos prescricional (Art. 27 CDC)

REGRAS CRÍTICAS — JEC (Lei 9.099/95):
⚠️ HONORÁRIOS EM 1ª INSTÂNCIA: PROIBIDO — Art. 55 Lei 9.099/95 veda honorários (salvo má-fé)
⚠️ PROVA PERICIAL: NUNCA requerer em JEC — gera extinção por incompetência
   Usar SEMPRE: "provas documentais e depoimento pessoal dos representantes das Rés"
⚠️ Limite: até 40 salários mínimos (Art. 3º Lei 9.099/95)
⚠️ Astreinte: Art. 537 CPC + Art. 52, IV Lei 9.099/95

ENDEREÇAMENTO OBRIGATÓRIO:
"Excelentíssimo(a) Senhor(a) Doutor(a) Juiz(a) de Direito do ___ Juizado Especial Cível da Comarca de [Cidade/UF]"

JUROS E CORREÇÃO MONETÁRIA:
- Dano moral extracontratual: desde o evento danoso → Súmula 54 STJ
- Dano moral contratual: desde o arbitramento → Súmula 362 STJ
- SEMPRE incluir pedido subsidiário: "subsidiariamente, juros desde a citação (Art. 405 CC)"
- Dano material: correção desde o desembolso + juros 1%/mês desde a citação

MARKETPLACE: Arts. 7º p.u. e 25 §1º CDC + Teoria da Aparência + REsp 1.737.428/RS (STJ)

DANO MORAL — 3 CAMADAS OBRIGATÓRIAS (v4):
1. BASE: in re ipsa — dispensa prova específica (STJ consolidado)
2. ELEMENTOS CONCRETOS: demonstrar ao menos 3 dos seguintes:
   - Duração da privação em dias corridos
   - Impacto profissional documentado (cargo, função, prejuízo à atividade)
   - Constrangimento ou vexame específico descrito
   - Número de contatos frustrados com o fornecedor (SAC, portal, protocolo)
   - Necessidade de buscar alternativas onerosas
3. TEORIA DO DESVIO PRODUTIVO (REsp 1.737.017/SP): quantificar tempo subtraído
⚠️ JAMAIS usar apenas "causou abalo emocional" sem elementos concretos dos fatos.
Valor JEC: R$ 3.000–R$ 8.000 — justificar com duração + conduta + impacto demonstrado.

PEDIDOS ESPECIAIS:
- Tutela de urgência (Art. 300 CPC): incluir quando privação ativa de bem essencial
- Justiça gratuita: SOMENTE se cliente desempregado/vulnerável (JEC sem custas em 1ª instância)
- Audiência de conciliação: mencionar após qualificação (Art. 22 Lei 9.099/95)

ESTRUTURA — PETIÇÃO INICIAL:
I — Da Audiência de Conciliação
II — Da Competência (Arts. 3º e 4º Lei 9.099/95)
III — Dos Fatos (cronológico, datas exatas, dias calculados até hoje)
IV — Do Direito (triage CDC → tempestividade → responsabilidade → prova → dano moral 3 camadas)
V — Dos Pedidos (a, b, c — com alternatividade)
VI — Do Valor da Causa (≤ 40 SM)
VII — Dos Requerimentos Finais (documental + depoimento pessoal — SEM pericial)`;

// ── BASE DE CONHECIMENTO ──────────────────────────────────────────────────────

const LEGAL_CONTEXTS = {
  consumidor: `LEGISLAÇÃO — DIREITO DO CONSUMIDOR:
Art. 6º CDC — Direitos básicos: informação adequada, reparação de danos (VI), inversão do ônus da prova (VIII).
Art. 7º p.u. CDC — Solidariedade de toda a cadeia de fornecimento.
Art. 12 CDC — Fabricante: responsabilidade objetiva por defeitos do produto.
Art. 14 CDC — Fornecedor de serviços: responsabilidade objetiva independente de culpa.
Art. 18 CDC — Solidariedade por vícios de qualidade. §1º: substituição, restituição ou abatimento após 30 dias.
Art. 25 §1º CDC — Solidariedade irrenunciável entre fornecedores.
Art. 26, II CDC — Prazo decadencial: 90 dias para bens duráveis (da entrega ou manifestação do vício).
Súmula 54 STJ — Juros desde o evento danoso (responsabilidade extracontratual).
Súmula 297 STJ — CDC aplicável às instituições financeiras.
Súmula 362 STJ — Correção monetária do dano moral desde o arbitramento.
Súmula 479 STJ — Instituições financeiras respondem objetivamente por fraudes de terceiros.
REsp 1.737.428/RS STJ — Marketplace: responsabilidade solidária quando viabiliza venda sem garantir reparação.
REsp 1.737.017/SP STJ — Teoria do Desvio Produtivo: tempo subtraído do consumidor = dano moral autônomo.`,

  trabalhista: `LEGISLAÇÃO — DIREITO TRABALHISTA:
Art. 7º CF/88 — Direitos: proteção contra despedida (I), 13º salário (VIII), jornada 8h/44h (XIII), férias (XVII), FGTS (III), prescrição quinquenal (XXIX).
Art. 58 CLT — Jornada normal: 8 horas diárias.
Art. 59 CLT — Horas extras: acréscimo mínimo de 50%.
Art. 467 CLT — Parte incontroversa das verbas rescisórias: 50% de acréscimo se não paga na audiência.
Art. 477 CLT — Verbas rescisórias: prazo de 10 dias após o término do contrato.
Súmula 85 TST — Compensação de jornada requer acordo escrito ou convenção coletiva.
Súmula 291 TST — Horas extras habituais geram reflexos em férias, 13º, aviso prévio e FGTS.
Súmula 338 TST — Ônus da prova do horário: do empregador com mais de 10 empregados.
Súmula 437 TST — Supressão do intervalo intrajornada: pagamento integral com adicional de 50%.`,

  civil: `LEGISLAÇÃO — DIREITO CIVIL:
Art. 186 CC — Ato ilícito: ação ou omissão que viola direito e causa dano.
Art. 187 CC — Abuso de direito: exercício que excede boa-fé, bons costumes ou fins sociais.
Art. 405 CC — Juros moratórios: a partir da citação (obrigações contratuais).
Art. 421 CC — Liberdade contratual nos limites da função social do contrato.
Art. 475 CC — Parte lesada: pode pedir resolução ou cumprimento forçado.
Art. 927 CC — Obrigação de reparar danos por ato ilícito.
Art. 944 CC — Indenização mede-se pela extensão do dano.
Súmula 37 STJ — Cumulação de danos materiais e morais do mesmo fato: admitida.
Súmula 54 STJ — Juros desde o evento danoso (responsabilidade extracontratual).
Súmula 362 STJ — Correção monetária do dano moral desde o arbitramento.`,

  familia: `LEGISLAÇÃO — DIREITO DE FAMÍLIA:
Art. 1.583 CC — Guarda: unilateral ou compartilhada.
Art. 1.584 CC — Guarda compartilhada: aplicada na ausência de acordo entre os pais.
Art. 1.585 CC — Liminar de guarda: pode ser deferida antes da decisão final.
Art. 1.694 CC — Alimentos: compatíveis com condição social e possibilidades do alimentante.
Art. 1.699 CC — Alimentos: revisão se houver mudança de fortuna de qualquer das partes.
Art. 1.701 CC — Direito a alimentos de boa-fé enquanto não fixados outros.
Art. 1.703 CC — Pais: obrigados proporcionalmente pela manutenção dos filhos.
Lei 11.698/2008 — Guarda compartilhada como regra geral.
Lei 13.058/2014 — Igualdade de direitos pai/mãe na guarda compartilhada.
Súmula 277 STJ — Alimentos devidos desde a citação em investigação de paternidade.
Súmula 358 STJ — Cancelamento de alimentos do filho maior: depende de decisão judicial.`,
};

const TIPO_LABELS = {
  peticao_inicial: 'Petição Inicial',
  defesa:          'Contestação / Defesa',
  recurso:         'Recurso / Apelação',
  manifestacao:    'Manifestação / Memorial',
  contrato:        'Contrato',
  parecer:         'Parecer Jurídico',
  notificacao:     'Notificação Extrajudicial',
};

const SUBTIPO_LABELS = {
  servicos:   'Prestação de Serviços',
  honorarios: 'Honorários Advocatícios',
  nda:        'Confidencialidade (NDA)',
  locacao:    'Locação',
  outro:      'Contrato Diverso',
};

const AREA_LABELS = {
  consumidor:  'Direito do Consumidor',
  trabalhista: 'Direito Trabalhista',
  civil:       'Direito Civil',
  familia:     'Direito de Família',
};

// ── ROTA PRINCIPAL — GERAR ────────────────────────────────────────────────────

app.post('/api/gerar', requireAuth, async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { area='consumidor', tipo='peticao_inicial', subtipo='', autor, reu, fatos, pedido, estilo='', chunks_acervo=[] } = req.body || {};

  if (!autor || !fatos)
    return res.status(400).json({ error: 'Campos obrigatórios: autor, fatos.' });

  if (!process.env.ANTHROPIC_API_KEY)
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada.' });

  const areaLabel    = AREA_LABELS[area]  || AREA_LABELS.consumidor;
  const tipoLabel    = TIPO_LABELS[tipo]  || 'Petição Inicial';
  const subtipoLabel = subtipo ? (SUBTIPO_LABELS[subtipo] || subtipo) : '';
  const contexto     = LEGAL_CONTEXTS[area] || LEGAL_CONTEXTS.consumidor;
  const today        = new Date().toLocaleDateString('pt-BR', {
    day:'2-digit', month:'long', year:'numeric', timeZone:'America/Sao_Paulo'
  });

  let acervoCtx = '';
  if (chunks_acervo?.length) {
    acervoCtx = '\n\nREFERÊNCIAS DO ACERVO DO ESCRITÓRIO\n(Trechos selecionados da base local)\n\n';
    chunks_acervo.forEach((c, i) => { acervoCtx += `[Ref ${i+1} — ${c.fonte}]\n${c.texto}\n\n`; });
  }

  const estiloCtx = estilo ? `\nESTILO DO ADVOGADO:\n${estilo}\n` : '';

  const userPrompt = `DATA DE HOJE (use como data da petição e para calcular dias de privação/prejuízo): ${today}

LEGISLAÇÃO E JURISPRUDÊNCIA RELEVANTE:
───────────────────────────────────────
${contexto}
───────────────────────────────────────

TAREFA: Redija ${subtipoLabel?`um ${subtipoLabel} (${tipoLabel})`:`uma ${tipoLabel} para ${areaLabel}`} completo(a) e formal.

DADOS DO AUTOR / RECLAMANTE:
${autor}

DADOS DO RÉU / REQUERIDO:
${reu || 'A ser identificado conforme os fatos'}

FATOS DO CASO:
${fatos}

PEDIDO ESPECÍFICO:
${pedido || 'Reparação integral dos danos conforme os fatos narrados'}
${estiloCtx}${acervoCtx}
---
Gere o documento completo, técnico e formal, citando os artigos fornecidos acima.
Siga rigorosamente a estrutura e todas as regras do system prompt.`;

  res.setHeader('Content-Type',               'text/event-stream');
  res.setHeader('Cache-Control',              'no-cache, no-transform');
  res.setHeader('Connection',                 'keep-alive');
  res.setHeader('X-Accel-Buffering',          'no');
  res.setHeader('Transfer-Encoding',          'chunked');
  res.setHeader('Access-Control-Allow-Origin','*');
  res.flushHeaders();

  const keepAlive = setInterval(() => {
    try { res.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`); }
    catch (e) { clearInterval(keepAlive); }
  }, 3000);

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const stream = await client.messages.stream({
      model:       'claude-sonnet-4-6',
      max_tokens:  16000,
      temperature: 0.3,
      system:      SYSTEM_PROMPT_V4,
      messages:    [{ role: 'user', content: userPrompt }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta')
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Erro ao gerar:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  } finally {
    clearInterval(keepAlive);
  }
});

// CORS preflight
app.options('/api/gerar', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(200).end();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '3.0.0', db: !!db, timestamp: new Date().toISOString() });
});

// ── START ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => console.log(`Pandecta v3 na porta ${PORT}`));
