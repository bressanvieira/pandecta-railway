#!/usr/bin/env node
/**
 * validate.js — extrai JS inline do index.html e verifica sintaxe (sem executar)
 * Uso: node validate.js
 * Exit 0 = OK, Exit 1 = erro de sintaxe
 */
const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os   = require('os');

const htmlPath = path.join(__dirname, 'public', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf-8');

const scriptRe = /<script(?!\s+src)[^>]*>([\s\S]*?)<\/script>/gi;
let allJs = '', m;
while ((m = scriptRe.exec(html)) !== null) allJs += m[1] + '\n';

if (!allJs.trim()) { console.error('Nenhum script inline encontrado!'); process.exit(1); }

const tmp = path.join(os.tmpdir(), '_pandecta_validate.js');
fs.writeFileSync(tmp, allJs);

try {
  execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
  console.log('✅  Sintaxe JS OK — index.html pronto para deploy');
  process.exit(0);
} catch (e) {
  const stderr = e.stderr ? e.stderr.toString() : e.message;
  // Mapear linha do JS extraído → linha aproximada no HTML
  const errMatch = stderr.match(/:(\d+)/);
  const jsLine   = errMatch ? parseInt(errMatch[1]) : null;
  let htmlLine   = null;
  if (jsLine) {
    let count = 0, inScript = false;
    const lines = html.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/<script(?!\s+src)/i.test(lines[i])) inScript = true;
      if (inScript) count++;
      if (count === jsLine) { htmlLine = i + 1; break; }
      if (/<\/script>/i.test(lines[i])) inScript = false;
    }
  }
  console.error('❌  SyntaxError no JS do index.html');
  if (htmlLine) console.error(`    → linha ~${htmlLine} no HTML (linha ${jsLine} no JS extraído)`);
  const msgLine = stderr.split('\n').find(l => l.includes('SyntaxError') || l.includes('Error'));
  if (msgLine) console.error(`    ${msgLine.trim()}`);
  // Contexto
  if (jsLine) {
    const jsLines = allJs.split('\n');
    const from = Math.max(0, jsLine - 3), to = Math.min(jsLines.length, jsLine + 2);
    console.error('\nContexto JS:');
    jsLines.slice(from, to).forEach((l, i) => {
      const n = from + i + 1;
      console.error(`  ${n === jsLine ? '>>>' : '   '} ${n}: ${l}`);
    });
  }
  process.exit(1);
}
