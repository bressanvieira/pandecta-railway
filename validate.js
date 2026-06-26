#!/usr/bin/env node
/**
 * Pandecta — pre-deploy validator
 * Uso: node validate.js
 * Retorna exit 0 se OK, exit 1 se há erros.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = path.join(__dirname, 'public/index.html');
const html = fs.readFileSync(FILE, 'utf8');

let errors = 0;
function fail(msg) { console.error('❌', msg); errors++; }
function ok(msg)   { console.log ('✅', msg); }

// ── 1. Integridade básica ──────────────────────────────────
html.trimEnd().endsWith('</html>')
  ? ok('Arquivo termina com </html>')
  : fail('Arquivo NÃO termina com </html> — provável truncamento');

// ── 2. Extrai e valida cada bloco <script> ─────────────────
const scriptRe = /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi;
let match, scriptIdx = 0;
while ((match = scriptRe.exec(html)) !== null) {
  scriptIdx++;
  const src = match[1].trim();
  if (!src) continue;
  try {
    new vm.Script(src, { filename: `inline-script-${scriptIdx}` });
    ok(`Script #${scriptIdx} — sintaxe OK (${src.length} chars)`);
  } catch (e) {
    // Calcula linha real no HTML
    const offset = match.index + match[0].indexOf(src);
    const before = html.slice(0, offset + (e.stack.match(/:(\d+):\d+\)$/m)?.[1]-1||0)*1);
    const lineNo = (before.match(/\n/g)||[]).length + 1;
    fail(`Script #${scriptIdx} — ${e.message} (aprox. linha ${lineNo} do HTML)`);
  }
}

// ── 3. IDs críticos presentes ──────────────────────────────
const REQUIRED_IDS = [
  'screen-home','screen-gen','screen-historico','screen-acervo',
  'screen-config','screen-modelos','screen-equipe',
  'inp-user','inp-pass','hd-total','hd-mes','hd-recent-list',
];
REQUIRED_IDS.forEach(id => {
  html.includes(`id="${id}"`)
    ? ok(`ID #${id} presente`)
    : fail(`ID #${id} ausente`);
});

// ── 4. Funções JS críticas declaradas ─────────────────────
const REQUIRED_FNS = [
  'function go(','function fazerLogin(','function novaConversa(',
  'function loadHomeDash(','function loadHistorico(','function loadAcervo(',
  'function loadModelos(','function updateAvatars(',
];
REQUIRED_FNS.forEach(fn => {
  html.includes(fn)
    ? ok(`Função ${fn.replace('function ','')} declarada`)
    : fail(`Função ${fn} NÃO encontrada`);
});

// ── 5. Padrões suspeitos ───────────────────────────────────
// onclick com aspas não-escapadas dentro de strings JS
const badOnclick = /return\s+'[^']*onclick="[^"]*\('[^']+'\)[^"]*"[^']*'/;
if (badOnclick.test(html)) {
  fail('Possível aspas simples não-escapadas em onclick dentro de string JS');
} else {
  ok('Padrão onclick/aspas OK');
}

// ── 6. Resultado ──────────────────────────────────────────
console.log('\n' + '─'.repeat(50));
if (errors === 0) {
  console.log(`✅ TUDO OK — pode fazer git push`);
  process.exit(0);
} else {
  console.error(`\n❌ ${errors} erro(s) encontrado(s) — NÃO faça push`);
  process.exit(1);
}
