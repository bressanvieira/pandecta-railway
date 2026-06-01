// ═══════════════════════════════════════════════════════════════════
//  PANDECTA — Express Server para Railway  (System Prompt v4)
//  POST /api/gerar
//  Body: { area, tipo, autor, reu, fatos, pedido, estilo, chunks_acervo }
//  Response: text/event-stream (SSE)
//  Sem timeout — servidor persistente
// ═══════════════════════════════════════════════════════════════════

const express  = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── SYSTEM PROMPT V4 ─────────────────────────────────────────────────────────

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

// ── BASE DE CONHECIMENTO ─────────────────────────────────────────────────────

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
  recurso:         'Recurso / Apelação',
  notificacao:     'Notificação Extrajudicial',
  contrato:        'Contrato',
  defesa:          'Contestação / Defesa',
};

const AREA_LABELS = {
  consumidor:  'Direito do Consumidor',
  trabalhista: 'Direito Trabalhista',
  civil:       'Direito Civil',
  familia:     'Direito de Família',
};

// ── ROTA PRINCIPAL ────────────────────────────────────────────────────────────

app.post('/api/gerar', async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { area = 'consumidor', tipo = 'peticao_inicial', autor, reu, fatos, pedido, estilo = '', chunks_acervo = [] } = req.body || {};

  if (!autor || !fatos) {
    return res.status(400).json({ error: 'Campos obrigatórios: autor, fatos.' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada nas variáveis de ambiente.' });
  }

  const areaLabel = AREA_LABELS[area]  || AREA_LABELS.consumidor;
  const tipoLabel = TIPO_LABELS[tipo]  || 'Petição Inicial';
  const contexto  = LEGAL_CONTEXTS[area] || LEGAL_CONTEXTS.consumidor;
  const systemPrompt = SYSTEM_PROMPT_V4;

  const today = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo'
  });

  let acervoContexto = '';
  if (chunks_acervo && chunks_acervo.length > 0) {
    acervoContexto = '\n\nREFERÊNCIAS DO ACERVO DO ESCRITÓRIO\n';
    acervoContexto += '(Trechos selecionados da base local — use como referência de estilo e linguagem)\n\n';
    chunks_acervo.forEach((c, i) => {
      acervoContexto += `[Ref ${i+1} — ${c.fonte}]\n${c.texto}\n\n`;
    });
  }

  const estiloContexto = estilo ? `\nESTILO DO ADVOGADO:\n${estilo}\n` : '';

  const userPrompt = `DATA DE HOJE (use como data da petição e para calcular dias de privação/prejuízo): ${today}

LEGISLAÇÃO E JURISPRUDÊNCIA RELEVANTE:
───────────────────────────────────────
${contexto}
───────────────────────────────────────

TAREFA: Redija uma ${tipoLabel} completa para ${areaLabel}.

DADOS DO AUTOR / RECLAMANTE:
${autor}

DADOS DO RÉU / REQUERIDO:
${reu || 'A ser identificado conforme os fatos'}

FATOS DO CASO:
${fatos}

PEDIDO ESPECÍFICO:
${pedido || 'Reparação integral dos danos conforme os fatos narrados'}
${estiloContexto}${acervoContexto}
---
Gere o documento completo, técnico e formal, citando os artigos fornecidos acima.
Siga rigorosamente a estrutura e todas as regras do system prompt.`;

  // SSE headers
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Keep-alive para evitar timeout de proxy reverso
  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 15000);

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const stream = await client.messages.stream({
      model:       'claude-sonnet-4-6',
      max_tokens:  16000,
      temperature: 0.3,
      system:      systemPrompt,
      messages:    [{ role: 'user', content: userPrompt }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
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
  res.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() });
});

// ── START ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Pandecta server rodando na porta ${PORT}`);
});
