// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
//  PANDECTA â Express Server v3  (Railway)
//  - SQLite persistence: lawyers, office, history, acervo
//  - POST /api/gerar           â SSE stream de petiÃ§Ã£o
//  - CRUD /api/lawyers
//  - GET/PUT /api/office
//  - CRUD /api/history
//  - CRUD /api/acervo  +  POST /api/acervo/buscar
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

const express   = require('express');
const Anthropic  = require('@anthropic-ai/sdk');
const path      = require('path');
const fs        = require('fs');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'pandecta-dev-secret-trocar-em-producao';

// ── TELEGRAM ─────────────────────────────────────────────────────────────────
const TG_TOKEN   = process.env.TELEGRAM_TOKEN   || '8712437845:AAGgpo5_4r7IER46zCoFtE_2EKFmXNqOTRQ';
const TG_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '8507810191';

function sendTelegram(text) {
  const https = require('https');
  const body  = JSON.stringify({ chat_id: TG_CHAT_ID, text, parse_mode: 'HTML' });
  const opts  = {
    hostname: 'api.telegram.org',
    path: `/bot${TG_TOKEN}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  };
  const req = https.request(opts, () => {});
  req.on('error', () => {}); // silencia erros — notificação não pode derrubar o servidor
  req.write(body);
  req.end();
}

const app  = express();
const PORT = process.env.PORT || 3000;

// ââ DATABASE ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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

  // migrations â adiciona colunas sem quebrar banco existente
  try { db.exec(`ALTER TABLE acervo ADD COLUMN tamanho INTEGER DEFAULT 0`); } catch(e) {}
  try { db.exec(`ALTER TABLE acervo ADD COLUMN enviado_por TEXT DEFAULT ''`); } catch(e) {}
  try { db.exec(`ALTER TABLE acervo ADD COLUMN chunk_count INTEGER DEFAULT 0`); } catch(e) {}
  try { db.exec(`ALTER TABLE acervo ADD COLUMN chunks TEXT DEFAULT '[]'`); } catch(e) {}
  try { db.exec(`ALTER TABLE office ADD COLUMN logo TEXT DEFAULT ''`); } catch(e) {}
  try { db.exec(`ALTER TABLE history ADD COLUMN user_id INTEGER`); } catch(e) {}
  try { db.exec(`ALTER TABLE acervo ADD COLUMN user_id INTEGER`); } catch(e) {}
  // migrations cadastro v2
  try { db.exec(`ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''`); } catch(e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'solo'`); } catch(e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN profile_type TEXT DEFAULT 'advogado'`); } catch(e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN oab_number TEXT DEFAULT ''`); } catch(e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN oab_uf TEXT DEFAULT ''`); } catch(e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN institution TEXT DEFAULT ''`); } catch(e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN semester TEXT DEFAULT ''`); } catch(e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN trial_expires_at DATETIME`); } catch(e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN account_status TEXT DEFAULT 'active'`); } catch(e) {}

  // seed â cria usuÃ¡rio admin padrÃ£o se nÃ£o existir
  const adminExists = db.prepare('SELECT id FROM users WHERE email=?').get('admin@pandecta.ai');
  if (!adminExists) {
    db.prepare('INSERT INTO users (email, password_hash, nome, role) VALUES (?,?,?,?)').run(
      'admin@pandecta.ai',
      bcrypt.hashSync('Pandecta@2026', 10),
      'Administrador',
      'admin'
    );
    console.log('â  UsuÃ¡rio admin criado: admin@pandecta.ai / Pandecta@2026');
  }

  console.log('â  Database:', dbPath);
} catch (err) {
  console.error('â ï¸  Database init error (running without persistence):', err.message);
}

// ââ MIDDLEWARE ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

app.use(express.json({ limit: '10mb' }));

// Landing page na raiz, SPA em /app
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/cadastro', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cadastro.html')));

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '30d',
  etag: true,
  setHeaders: (res, filePath) => {
    // index.html nunca fica em cache â garante que o usuÃ¡rio sempre carrega a versÃ£o atual
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));
// Servir logos da pasta brand/ com cache longo
app.use('/brand', express.static(path.join(__dirname, 'brand'), { maxAge: '30d', etag: true }));

// ââ AUTH MIDDLEWARE âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ error: 'NÃ£o autenticado.' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invÃ¡lido ou expirado.' });
  }
}

// ââ AUTH ROUTES âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatÃ³rios.' });
  if (!db) return res.status(503).json({ error: 'DB indisponÃ­vel.' });
  try {
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email.trim().toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: 'Email ou senha incorretos.' });
    // verifica trial expirado
    if (user.account_status === 'trial' && user.trial_expires_at) {
      const expires = new Date(user.trial_expires_at);
      if (expires < new Date()) {
        db.prepare("UPDATE users SET account_status='trial_expired' WHERE id=?").run(user.id);
        return res.status(402).json({ error: 'trial_expired', message: 'Seu per\u00edodo de teste de 7 dias encerrou. Escolha um plano para continuar.' });
      }
    }
    if (user.account_status === 'trial_expired' || user.account_status === 'blocked') {
      return res.status(402).json({ error: 'trial_expired', message: 'Seu per\u00edodo de teste de 7 dias encerrou. Escolha um plano para continuar.' });
    }
    const token = jwt.sign({ userId: user.id, email: user.email, nome: user.nome, role: user.role, plan: user.plan, account_status: user.account_status }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, nome: user.nome, email: user.email, role: user.role, plan: user.plan, account_status: user.account_status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cadastro', (req, res) => {
  const { email, password, nome, sobrenome, phone, plan = 'solo',
          profile_type = 'advogado', oab_number = '', oab_uf = '',
          institution = '', semester = '' } = req.body;

  if (!email || !password || !nome || !sobrenome || !phone)
    return res.status(400).json({ error: 'Preencha todos os campos obrigat\u00f3rios.' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Senha deve ter no m\u00ednimo 8 caracteres.' });
  if (profile_type === 'advogado' && (!oab_number || !oab_uf))
    return res.status(400).json({ error: 'N\u00famero OAB e estado s\u00e3o obrigat\u00f3rios para advogados.' });
  if (profile_type === 'estudante' && (!institution || !semester))
    return res.status(400).json({ error: 'Institui\u00e7\u00e3o e semestre s\u00e3o obrigat\u00f3rios para estudantes.' });
  if (!db) return res.status(503).json({ error: 'DB indispon\u00edvel.' });

  try {
    const hash = bcrypt.hashSync(password, 10);
    const trialExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const nomeCompleto = (nome.trim() + ' ' + sobrenome.trim()).trim();

    const r = db.prepare(`
      INSERT INTO users (email, password_hash, nome, role, phone, plan, profile_type,
                         oab_number, oab_uf, institution, semester, trial_expires_at, account_status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'trial')
    `).run(
      email.trim().toLowerCase(), hash, nomeCompleto, 'user',
      phone.trim(), plan, profile_type,
      oab_number.trim().toUpperCase(), oab_uf.trim().toUpperCase(),
      institution.trim(), semester.trim(), trialExpires
    );

    const token = jwt.sign(
      { userId: r.lastInsertRowid, email: email.trim().toLowerCase(), nome: nomeCompleto, role: 'user', plan, account_status: 'trial' },
      JWT_SECRET, { expiresIn: '7d' }
    );

    // Notificação Telegram
    const planLabels = { solo: 'Solo R$79', profissional: 'Profissional R$179', escritorio: 'Escritório R$379' };
    const perfilInfo = profile_type === 'advogado'
      ? `OAB ${oab_number}/${oab_uf}`
      : `Estudante — ${institution} (${semester}º sem.)`;
    sendTelegram(
      `🆕 <b>Novo cadastro Pandecta</b>\n\n` +
      `👤 <b>${nomeCompleto}</b>\n` +
      `📧 ${email.trim().toLowerCase()}\n` +
      `📱 ${phone.trim()}\n` +
      `⚖️ ${perfilInfo}\n` +
      `📦 Plano: ${planLabels[plan] || plan}\n` +
      `⏱ Trial: 7 dias`
    );

    res.json({ token, nome: nomeCompleto, email: email.trim().toLowerCase(),
               role: 'user', plan, account_status: 'trial', trial_days: 7 });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Este e-mail j\u00e1 est\u00e1 cadastrado.' });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/register', requireAuth, (req, res) => {
  // SÃ³ admin pode criar usuÃ¡rios
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Sem permissÃ£o.' });
  const { email, password, nome = '', role = 'user' } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatÃ³rios.' });
  if (password.length < 8) return res.status(400).json({ error: 'Senha deve ter no mÃ­nimo 8 caracteres.' });
  if (!db) return res.status(503).json({ error: 'DB indisponÃ­vel.' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const r = db.prepare('INSERT INTO users (email,password_hash,nome,role) VALUES (?,?,?,?)').run(
      email.trim().toLowerCase(), hash, nome.trim(), role
    );
    res.json({ id: r.lastInsertRowid, email, nome, role });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email jÃ¡ cadastrado.' });
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ userId: req.user.userId, email: req.user.email, nome: req.user.nome, role: req.user.role });
});

// ââ USERS CRUD (admin only) âââââââââââââââââââââââââââââââââââââââââââââââââââ

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso restrito a administradores.' });
  next();
}

app.get('/api/users', requireAuth, requireAdmin, (req, res) => {
  if (!db) return res.json([]);
  try {
    res.json(db.prepare(`
      SELECT id, email, nome, role, phone, plan, profile_type,
             oab_number, oab_uf, institution, semester,
             trial_expires_at, account_status, created_at
      FROM users ORDER BY created_at DESC
    `).all());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/users/:id/status', requireAuth, requireAdmin, (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB indisponivel.' });
  const { status } = req.body;
  const allowed = ['active', 'trial', 'blocked'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Status invalido.' });
  if (String(req.params.id) === String(req.user.userId))
    return res.status(400).json({ error: 'Nao e possivel alterar o proprio status.' });
  try {
    db.prepare('UPDATE users SET account_status=? WHERE id=?').run(status, req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB indisponÃ­vel.' });
  const { nome = '', email = '', role = 'user', password = '' } = req.body;
  if (!email) return res.status(400).json({ error: 'Email obrigatÃ³rio.' });
  try {
    if (password) {
      if (password.length < 8) return res.status(400).json({ error: 'Senha deve ter no mÃ­nimo 8 caracteres.' });
      db.prepare('UPDATE users SET nome=?, email=?, role=?, password_hash=? WHERE id=?').run(
        nome.trim(), email.trim().toLowerCase(), role, bcrypt.hashSync(password, 10), req.params.id
      );
    } else {
      db.prepare('UPDATE users SET nome=?, email=?, role=? WHERE id=?').run(
        nome.trim(), email.trim().toLowerCase(), role, req.params.id
      );
    }
    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email jÃ¡ cadastrado.' });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB indisponÃ­vel.' });
  if (String(req.params.id) === String(req.user.userId))
    return res.status(400).json({ error: 'NÃ£o Ã© possÃ­vel excluir o prÃ³prio usuÃ¡rio.' });
  try {
    db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ââ LAWYERS âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

app.get('/api/lawyers', requireAuth, (req, res) => {
  if (!db) return res.json([]);
  try {
    res.json(db.prepare('SELECT id, nome, oab, uf, email, cargo FROM lawyers ORDER BY nome ASC').all());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/lawyers', requireAuth, (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB indisponÃ­vel.' });
  const { nome, oab = '', uf = '', email = '', cargo = '' } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome obrigatÃ³rio.' });
  try {
    const r = db.prepare('INSERT INTO lawyers (nome,oab,uf,email,cargo) VALUES (?,?,?,?,?)').run(
      nome.trim(), oab.trim(), uf.trim().toUpperCase(), email.trim(), cargo.trim()
    );
    res.json({ id: r.lastInsertRowid, nome, oab, uf: uf.toUpperCase(), email, cargo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/lawyers/:id', requireAuth, (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB indisponÃ­vel.' });
  const { nome, oab = '', uf = '', email = '', cargo = '' } = req.body;
  try {
    db.prepare('UPDATE lawyers SET nome=?,oab=?,uf=?,email=?,cargo=? WHERE id=?').run(
      nome, oab, uf.toUpperCase(), email, cargo, req.params.id
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/lawyers/:id', requireAuth, (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB indisponÃ­vel.' });
  try {
    db.prepare('DELETE FROM lawyers WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ââ OFFICE ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

app.get('/api/office', requireAuth, (req, res) => {
  if (!db) return res.json({});
  try {
    res.json(db.prepare('SELECT nome,endereco,cidade,cep,telefone,email,logo FROM office WHERE id=1').get() || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/office', requireAuth, (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB indisponÃ­vel.' });
  const { nome = '', endereco = '', cidade = '', cep = '', telefone = '', email = '', logo = '' } = req.body;
  try {
    db.prepare('UPDATE office SET nome=?,endereco=?,cidade=?,cep=?,telefone=?,email=?,logo=? WHERE id=1').run(
      nome, endereco, cidade, cep, telefone, email, logo
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ââ HISTORY âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

app.get('/api/history', requireAuth, (req, res) => {
  if (!db) return res.json([]);
  try {
    const isAdmin = req.user.role === 'admin';
    const rows = isAdmin
      ? db.prepare('SELECT id,usuario,tipo,tipo_label,area_label,autor,responsavel_id,texto,created_at FROM history ORDER BY created_at DESC LIMIT 100').all()
      : db.prepare('SELECT id,usuario,tipo,tipo_label,area_label,autor,responsavel_id,texto,created_at FROM history WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(req.user.userId);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/history', requireAuth, (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB indisponÃ­vel.' });
  const { usuario='',tipo='',tipo_label='',area_label='',autor='',responsavel_id=null,texto='' } = req.body;
  try {
    const r = db.prepare(
      'INSERT INTO history (usuario,tipo,tipo_label,area_label,autor,responsavel_id,texto,user_id) VALUES (?,?,?,?,?,?,?,?)'
    ).run(usuario, tipo, tipo_label, area_label, autor, responsavel_id || null, texto, req.user.userId);
    res.json(db.prepare('SELECT * FROM history WHERE id=?').get(r.lastInsertRowid));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/history/:id', requireAuth, (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB indisponÃ­vel.' });
  const { texto = '' } = req.body;
  try {
    const row = db.prepare('SELECT user_id FROM history WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'NÃ£o encontrado.' });
    if (req.user.role !== 'admin' && row.user_id && row.user_id !== req.user.userId)
      return res.status(403).json({ error: 'Sem permissÃ£o.' });
    db.prepare('UPDATE history SET texto=? WHERE id=?').run(texto, req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/history/:id', requireAuth, (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB indisponÃ­vel.' });
  try {
    const row = db.prepare('SELECT user_id FROM history WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'NÃ£o encontrado.' });
    if (req.user.role !== 'admin' && row.user_id && row.user_id !== req.user.userId)
      return res.status(403).json({ error: 'Sem permissÃ£o.' });
    db.prepare('DELETE FROM history WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ââ ACERVO ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

app.get('/api/acervo', requireAuth, (req, res) => {
  if (!db) return res.json([]);
  try {
    const isAdmin = req.user.role === 'admin';
    const rows = isAdmin
      ? db.prepare('SELECT id,nome,tipo,chunk_count,tamanho,enviado_por,created_at FROM acervo ORDER BY created_at DESC').all()
      : db.prepare('SELECT id,nome,tipo,chunk_count,tamanho,enviado_por,created_at FROM acervo WHERE user_id=? ORDER BY created_at DESC').all(req.user.userId);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/acervo', requireAuth, (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB indisponÃ­vel.' });
  const { nome, tipo = 'Outro', chunks = [], tamanho = 0, enviado_por = '' } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome obrigatÃ³rio.' });
  try {
    const r = db.prepare('INSERT INTO acervo (nome,tipo,chunks,chunk_count,tamanho,enviado_por,user_id) VALUES (?,?,?,?,?,?,?)').run(
      nome, tipo, JSON.stringify(chunks), chunks.length, tamanho, enviado_por, req.user.userId
    );
    res.json({ id: r.lastInsertRowid, nome, tipo, chunk_count: chunks.length, tamanho, enviado_por });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/acervo/:id', requireAuth, (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB indisponÃ­vel.' });
  try {
    const row = db.prepare('SELECT user_id FROM acervo WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'NÃ£o encontrado.' });
    if (req.user.role !== 'admin' && row.user_id && row.user_id !== req.user.userId)
      return res.status(403).json({ error: 'Sem permissÃ£o.' });
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

// ââ ASSISTENTE PANDECTA âââââââââââââââââââââââââââââââââââââââââââââââââââââââ

const ASSISTENTE_PROMPT = `VocÃª Ã© o assistente do Pandecta AI â plataforma de inteligÃªncia jurÃ­dica para advogados brasileiros.
Responda dÃºvidas sobre as funcionalidades do sistema de forma clara, direta e amigÃ¡vel.

FUNCIONALIDADES DO PANDECTA:
â¢ Nova PeÃ§a (botÃ£o "+ Novo"): Gera petiÃ§Ãµes iniciais, contestaÃ§Ãµes, recursos, notificaÃ§Ãµes e contratos via IA. O fluxo coleta Ã¡rea jurÃ­dica, tipo de peÃ§a, dados do autor/rÃ©u, fatos e pedido.
â¢ HistÃ³rico: Lista todas as peÃ§as geradas. Ã possÃ­vel editar, copiar ou exportar para Word (.doc) com cabeÃ§alho do escritÃ³rio.
â¢ Acervo: Base de documentos do escritÃ³rio (PDF, DOCX, TXT). Os arquivos sÃ£o lidos, divididos em trechos (chunks) e indexados. Esses trechos sÃ£o usados como contexto na geraÃ§Ã£o de peÃ§as â funciona como RAG (Retrieval-Augmented Generation).
â¢ Equipe: Cadastro de advogados (nome, OAB, e-mail, cargo). O advogado responsÃ¡vel Ã© selecionado ao gerar cada peÃ§a e aparece na assinatura do Word exportado.
â¢ ConfiguraÃ§Ãµes: Dados do escritÃ³rio (nome, endereÃ§o, logo, cidade, CEP, telefone, e-mail) para o cabeÃ§alho dos documentos exportados.
â¢ ExportaÃ§Ã£o Word: Gera arquivo .doc com cabeÃ§alho do escritÃ³rio (logo + dados), corpo da peÃ§a em formato jurÃ­dico e assinatura do advogado responsÃ¡vel.
â¢ Sistema jurÃ­dico: Especializado em Direito do Consumidor (CDC/JEC), Civil, Trabalhista e de FamÃ­lia. Aplica regras automÃ¡ticas como triage CDC, regras do JEC e estrutura em 7 seÃ§Ãµes para petiÃ§Ãµes.

REGRAS:
- Seja objetivo, amigÃ¡vel e claro
- Responda sempre em portuguÃªs brasileiro
- Se a dÃºvida nÃ£o for sobre o Pandecta, redirecione gentilmente
- Para dÃºvidas tÃ©cnicas de uso, dÃª passos prÃ¡ticos
- MÃ¡ximo 3â4 parÃ¡grafos por resposta`;

app.post('/api/assistente', requireAuth, async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { pergunta, historico = [] } = req.body || {};
  if (!pergunta) return res.status(400).json({ error: 'Pergunta obrigatÃ³ria.' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key nÃ£o configurada.' });

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

// ââ SYSTEM PROMPT V4 ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

const SYSTEM_PROMPT_V4 = `VocÃª Ã© o Pandecta â assistente jurÃ­dico de precisÃ£o especializado em direito brasileiro.
Seu papel Ã© auxiliar advogados a redigir documentos jurÃ­dicos de alta qualidade com base nos fatos fornecidos.

REGRAS INVIOLÃVEIS:
1. Cite sempre o fundamento legal (artigo, lei, sÃºmula ou jurisprudÃªncia)
2. Linguagem jurÃ­dica formal e tÃ©cnica contemporÃ¢nea â sem arcaÃ­smos ("se digne a" â "requer")
3. Nunca invente jurisprudÃªncia â use apenas o que foi fornecido no contexto
4. REGRA CRÃTICA DE DATAS: calcule os dias de privaÃ§Ã£o/prejuÃ­zo atÃ© a DATA DE HOJE (data de protocolo), nÃ£o atÃ© a data do Ãºltimo fato narrado
5. Ao final, adicione: "â Rascunho gerado por IA. RevisÃ£o e assinatura do advogado responsÃ¡vel obrigatÃ³rias. â"
6. Use nomenclatura uniforme: defina "1Âª RÃ©" OU "1Âª Requerida" e mantenha atÃ© o final

REGRA CRÃTICA â TRIAGE DE REGIME CDC (v4):
ANTES de qualquer fundamentaÃ§Ã£o, identifique o regime correto:
- Produto/serviÃ§o causou DANO FÃSICO ou ACIDENTE? â Arts. 12 ou 14 CDC (fato)
- Produto SIMPLESMENTE NÃO FUNCIONA como deveria? â Art. 18 CDC (vÃ­cio) â mais comum no JEC
â ï¸ NUNCA combine Art. 12/14 com Art. 18 na mesma fundamentaÃ§Ã£o. SÃ£o regimes distintos.
Art. 18 CDC: prazo 30 dias para sanar + 90 dias decadencial (Art. 26, II CDC)
Art. 12 CDC: produto causa dano fÃ­sico + 5 anos prescricional (Art. 27 CDC)
Art. 14 CDC: serviÃ§o causa dano fÃ­sico + 5 anos prescricional (Art. 27 CDC)

REGRAS CRÃTICAS â JEC (Lei 9.099/95):
â ï¸ HONORÃRIOS EM 1Âª INSTÃNCIA: PROIBIDO â Art. 55 Lei 9.099/95 veda honorÃ¡rios (salvo mÃ¡-fÃ©)
â ï¸ PROVA PERICIAL: NUNCA requerer em JEC â gera extinÃ§Ã£o por incompetÃªncia
   Usar SEMPRE: "provas documentais e depoimento pessoal dos representantes das RÃ©s"
â ï¸ Limite: atÃ© 40 salÃ¡rios mÃ­nimos (Art. 3Âº Lei 9.099/95)
â ï¸ Astreinte: Art. 537 CPC + Art. 52, IV Lei 9.099/95

ENDEREÃAMENTO OBRIGATÃRIO:
"ExcelentÃ­ssimo(a) Senhor(a) Doutor(a) Juiz(a) de Direito do ___ Juizado Especial CÃ­vel da Comarca de [Cidade/UF]"

JUROS E CORREÃÃO MONETÃRIA:
- Dano moral extracontratual: desde o evento danoso â SÃºmula 54 STJ
- Dano moral contratual: desde o arbitramento â SÃºmula 362 STJ
- SEMPRE incluir pedido subsidiÃ¡rio: "subsidiariamente, juros desde a citaÃ§Ã£o (Art. 405 CC)"
- Dano material: correÃ§Ã£o desde o desembolso + juros 1%/mÃªs desde a citaÃ§Ã£o

MARKETPLACE: Arts. 7Âº p.u. e 25 Â§1Âº CDC + Teoria da AparÃªncia + REsp 1.737.428/RS (STJ)

DANO MORAL â 3 CAMADAS OBRIGATÃRIAS (v4):
1. BASE: in re ipsa â dispensa prova especÃ­fica (STJ consolidado)
2. ELEMENTOS CONCRETOS: demonstrar ao menos 3 dos seguintes:
   - DuraÃ§Ã£o da privaÃ§Ã£o em dias corridos
   - Impacto profissional documentado (cargo, funÃ§Ã£o, prejuÃ­zo Ã  atividade)
   - Constrangimento ou vexame especÃ­fico descrito
   - NÃºmero de contatos frustrados com o fornecedor (SAC, portal, protocolo)
   - Necessidade de buscar alternativas onerosas
3. TEORIA DO DESVIO PRODUTIVO (REsp 1.737.017/SP): quantificar tempo subtraÃ­do
â ï¸ JAMAIS usar apenas "causou abalo emocional" sem elementos concretos dos fatos.
Valor JEC: R$ 3.000âR$ 8.000 â justificar com duraÃ§Ã£o + conduta + impacto demonstrado.

PEDIDOS ESPECIAIS:
- Tutela de urgÃªncia (Art. 300 CPC): incluir quando privaÃ§Ã£o ativa de bem essencial
- JustiÃ§a gratuita: SOMENTE se cliente desempregado/vulnerÃ¡vel (JEC sem custas em 1Âª instÃ¢ncia)
- AudiÃªncia de conciliaÃ§Ã£o: mencionar apÃ³s qualificaÃ§Ã£o (Art. 22 Lei 9.099/95)

ESTRUTURA â PETIÃÃO INICIAL:
I â Da AudiÃªncia de ConciliaÃ§Ã£o
II â Da CompetÃªncia (Arts. 3Âº e 4Âº Lei 9.099/95)
III â Dos Fatos (cronolÃ³gico, datas exatas, dias calculados atÃ© hoje)
IV â Do Direito (triage CDC â tempestividade â responsabilidade â prova â dano moral 3 camadas)
V â Dos Pedidos (a, b, c â com alternatividade)
VI â Do Valor da Causa (â¤ 40 SM)
VII â Dos Requerimentos Finais (documental + depoimento pessoal â SEM pericial)`;

// ââ BASE DE CONHECIMENTO ââââââââââââââââââââââââââââââââââââââââââââââââââââââ

const LEGAL_CONTEXTS = {
  consumidor: `LEGISLAÃÃO â DIREITO DO CONSUMIDOR:
Art. 6Âº CDC â Direitos bÃ¡sicos: informaÃ§Ã£o adequada, reparaÃ§Ã£o de danos (VI), inversÃ£o do Ã´nus da prova (VIII).
Art. 7Âº p.u. CDC â Solidariedade de toda a cadeia de fornecimento.
Art. 12 CDC â Fabricante: responsabilidade objetiva por defeitos do produto.
Art. 14 CDC â Fornecedor de serviÃ§os: responsabilidade objetiva independente de culpa.
Art. 18 CDC â Solidariedade por vÃ­cios de qualidade. Â§1Âº: substituiÃ§Ã£o, restituiÃ§Ã£o ou abatimento apÃ³s 30 dias.
Art. 25 Â§1Âº CDC â Solidariedade irrenunciÃ¡vel entre fornecedores.
Art. 26, II CDC â Prazo decadencial: 90 dias para bens durÃ¡veis (da entrega ou manifestaÃ§Ã£o do vÃ­cio).
SÃºmula 54 STJ â Juros desde o evento danoso (responsabilidade extracontratual).
SÃºmula 297 STJ â CDC aplicÃ¡vel Ã s instituiÃ§Ãµes financeiras.
SÃºmula 362 STJ â CorreÃ§Ã£o monetÃ¡ria do dano moral desde o arbitramento.
SÃºmula 479 STJ â InstituiÃ§Ãµes financeiras respondem objetivamente por fraudes de terceiros.
REsp 1.737.428/RS STJ â Marketplace: responsabilidade solidÃ¡ria quando viabiliza venda sem garantir reparaÃ§Ã£o.
REsp 1.737.017/SP STJ â Teoria do Desvio Produtivo: tempo subtraÃ­do do consumidor = dano moral autÃ´nomo.`,

  trabalhista: `LEGISLAÃÃO â DIREITO TRABALHISTA:
Art. 7Âº CF/88 â Direitos: proteÃ§Ã£o contra despedida (I), 13Âº salÃ¡rio (VIII), jornada 8h/44h (XIII), fÃ©rias (XVII), FGTS (III), prescriÃ§Ã£o quinquenal (XXIX).
Art. 58 CLT â Jornada normal: 8 horas diÃ¡rias.
Art. 59 CLT â Horas extras: acrÃ©scimo mÃ­nimo de 50%.
Art. 467 CLT â Parte incontroversa das verbas rescisÃ³rias: 50% de acrÃ©scimo se nÃ£o paga na audiÃªncia.
Art. 477 CLT â Verbas rescisÃ³rias: prazo de 10 dias apÃ³s o tÃ©rmino do contrato.
SÃºmula 85 TST â CompensaÃ§Ã£o de jornada requer acordo escrito ou convenÃ§Ã£o coletiva.
SÃºmula 291 TST â Horas extras habituais geram reflexos em fÃ©rias, 13Âº, aviso prÃ©vio e FGTS.
SÃºmula 338 TST â Ãnus da prova do horÃ¡rio: do empregador com mais de 10 empregados.
SÃºmula 437 TST â SupressÃ£o do intervalo intrajornada: pagamento integral com adicional de 50%.`,

  civil: `LEGISLAÃÃO â DIREITO CIVIL:
Art. 186 CC â Ato ilÃ­cito: aÃ§Ã£o ou omissÃ£o que viola direito e causa dano.
Art. 187 CC â Abuso de direito: exercÃ­cio que excede boa-fÃ©, bons costumes ou fins sociais.
Art. 405 CC â Juros moratÃ³rios: a partir da citaÃ§Ã£o (obrigaÃ§Ãµes contratuais).
Art. 421 CC â Liberdade contratual nos limites da funÃ§Ã£o social do contrato.
Art. 475 CC â Parte lesada: pode pedir resoluÃ§Ã£o ou cumprimento forÃ§ado.
Art. 927 CC â ObrigaÃ§Ã£o de reparar danos por ato ilÃ­cito.
Art. 944 CC â IndenizaÃ§Ã£o mede-se pela extensÃ£o do dano.
SÃºmula 37 STJ â CumulaÃ§Ã£o de danos materiais e morais do mesmo fato: admitida.
SÃºmula 54 STJ â Juros desde o evento danoso (responsabilidade extracontratual).
SÃºmula 362 STJ â CorreÃ§Ã£o monetÃ¡ria do dano moral desde o arbitramento.`,

  familia: `LEGISLAÃÃO â DIREITO DE FAMÃLIA:
Art. 1.583 CC â Guarda: unilateral ou compartilhada.
Art. 1.584 CC â Guarda compartilhada: aplicada na ausÃªncia de acordo entre os pais.
Art. 1.585 CC â Liminar de guarda: pode ser deferida antes da decisÃ£o final.
Art. 1.694 CC â Alimentos: compatÃ­veis com condiÃ§Ã£o social e possibilidades do alimentante.
Art. 1.699 CC â Alimentos: revisÃ£o se houver mudanÃ§a de fortuna de qualquer das partes.
Art. 1.701 CC â Direito a alimentos de boa-fÃ© enquanto nÃ£o fixados outros.
Art. 1.703 CC â Pais: obrigados proporcionalmente pela manutenÃ§Ã£o dos filhos.
Lei 11.698/2008 â Guarda compartilhada como regra geral.
Lei 13.058/2014 â Igualdade de direitos pai/mÃ£e na guarda compartilhada.
SÃºmula 277 STJ â Alimentos devidos desde a citaÃ§Ã£o em investigaÃ§Ã£o de paternidade.
SÃºmula 358 STJ â Cancelamento de alimentos do filho maior: depende de decisÃ£o judicial.`,
};

const TIPO_LABELS = {
  peticao_inicial: 'PetiÃ§Ã£o Inicial',
  defesa:          'ContestaÃ§Ã£o / Defesa',
  recurso:         'Recurso / ApelaÃ§Ã£o',
  manifestacao:    'ManifestaÃ§Ã£o / Memorial',
  contrato:        'Contrato',
  parecer:         'Parecer JurÃ­dico',
  notificacao:     'NotificaÃ§Ã£o Extrajudicial',
};

const SUBTIPO_LABELS = {
  servicos:   'PrestaÃ§Ã£o de ServiÃ§os',
  honorarios: 'HonorÃ¡rios AdvocatÃ­cios',
  nda:        'Confidencialidade (NDA)',
  locacao:    'LocaÃ§Ã£o',
  outro:      'Contrato Diverso',
};

const AREA_LABELS = {
  consumidor:  'Direito do Consumidor',
  trabalhista: 'Direito Trabalhista',
  civil:       'Direito Civil',
  familia:     'Direito de FamÃ­lia',
};

// ââ ROTA PRINCIPAL â GERAR ââââââââââââââââââââââââââââââââââââââââââââââââââââ

app.post('/api/gerar', requireAuth, async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { area='consumidor', tipo='peticao_inicial', subtipo='', autor, reu, fatos, pedido, estilo='', chunks_acervo=[], chunks_memoria=[] } = req.body || {};

  if (!autor || !fatos)
    return res.status(400).json({ error: 'Campos obrigatÃ³rios: autor, fatos.' });

  if (!process.env.ANTHROPIC_API_KEY)
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY nÃ£o configurada.' });

  const areaLabel    = AREA_LABELS[area]  || AREA_LABELS.consumidor;
  const tipoLabel    = TIPO_LABELS[tipo]  || 'PetiÃ§Ã£o Inicial';
  const subtipoLabel = subtipo ? (SUBTIPO_LABELS[subtipo] || subtipo) : '';
  const contexto     = LEGAL_CONTEXTS[area] || LEGAL_CONTEXTS.consumidor;
  const today        = new Date().toLocaleDateString('pt-BR', {
    day:'2-digit', month:'long', year:'numeric', timeZone:'America/Sao_Paulo'
  });

  let acervoCtx = '';
  if (chunks_acervo?.length) {
    acervoCtx = '\n\nREFERÃNCIAS DO ACERVO DO ESCRITÃRIO\n(Trechos selecionados da base local)\n\n';
    chunks_acervo.forEach((c, i) => { acervoCtx += `[Ref ${i+1} â ${c.fonte}]\n${c.texto}\n\n`; });
  }

  const estiloCtx = estilo ? `\nESTILO DO ADVOGADO:\n${estilo}\n` : '';

  const userPrompt = `DATA DE HOJE (use como data da petiÃ§Ã£o e para calcular dias de privaÃ§Ã£o/prejuÃ­zo): ${today}

LEGISLAÃÃO E JURISPRUDÃNCIA RELEVANTE:
âââââââââââââââââââââââââââââââââââââââ
${contexto}
âââââââââââââââââââââââââââââââââââââââ

TAREFA: Redija ${subtipoLabel?`um ${subtipoLabel} (${tipoLabel})`:`uma ${tipoLabel} para ${areaLabel}`} completo(a) e formal.

DADOS DO AUTOR / RECLAMANTE:
${autor}

DADOS DO RÃU / REQUERIDO:
${reu || 'A ser identificado conforme os fatos'}

FATOS DO CASO:
${fatos}

PEDIDO ESPECÃFICO:
${pedido || 'ReparaÃ§Ã£o integral dos danos conforme os fatos narrados'}
${estiloCtx}${acervoCtx}
---
Gere o documento completo, tÃ©cnico e formal, citando os artigos fornecidos acima.
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

// ââ BACKUP (admin only) âââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// Faz backup online do SQLite usando a API nativa do better-sqlite3.
// O arquivo Ã© salvo em <dbDir>/backups/pandecta-<timestamp>.db
// e os 5 mais recentes sÃ£o mantidos (os demais sÃ£o apagados).

app.get('/api/admin/stats', requireAuth, requireAdmin, (req, res) => {
  if (!db) return res.json({});
  try {
    const users   = db.prepare('SELECT COUNT(*) as n FROM users WHERE role!=\'admin\'').get().n;
    const trial   = db.prepare("SELECT COUNT(*) as n FROM users WHERE account_status='trial'").get().n;
    const pecas   = db.prepare('SELECT COUNT(*) as n FROM history').get().n;
    const docs    = db.prepare('SELECT COUNT(*) as n FROM acervo').get().n;
    const chunks  = db.prepare('SELECT SUM(chunk_count) as n FROM acervo').get().n || 0;
    const lawyers = db.prepare('SELECT COUNT(*) as n FROM lawyers').get().n;
    const ultimas = db.prepare("SELECT tipo_label, area_label, autor, created_at FROM history ORDER BY created_at DESC LIMIT 5").all();
    res.json({ users, trial, pecas, docs, chunks, lawyers, ultimas });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/backup', requireAuth, requireAdmin, (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB indisponÃ­vel.' });
  try {
    const dbDir = process.env.DB_PATH
      ? path.dirname(process.env.DB_PATH)
      : path.join(__dirname, 'data');
    const backupDir = path.join(dbDir, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(backupDir, `pandecta-${ts}.db`);

    // backup() Ã© sÃ­ncrono e seguro mesmo com escritas concorrentes
    db.backup(dest);

    // MantÃ©m apenas os 5 backups mais recentes
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.db'))
      .map(f => ({ name: f, time: fs.statSync(path.join(backupDir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);
    files.slice(5).forEach(f => fs.unlinkSync(path.join(backupDir, f.name)));

    res.json({ ok: true, arquivo: path.basename(dest), total_backups: Math.min(files.length, 5) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/backups', requireAuth, requireAdmin, (req, res) => {
  try {
    const dbDir = process.env.DB_PATH
      ? path.dirname(process.env.DB_PATH)
      : path.join(__dirname, 'data');
    const backupDir = path.join(dbDir, 'backups');
    if (!fs.existsSync(backupDir)) return res.json([]);
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.db'))
      .map(f => {
        const stat = fs.statSync(path.join(backupDir, f));
        return { nome: f, tamanho: stat.size, created_at: stat.mtime.toISOString() };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(files);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ââ START ââââââââââââââââââââââââââââââââ
app.listen(PORT, () => console.log(`✅  Pandecta v3 na porta ${PORT}`));
