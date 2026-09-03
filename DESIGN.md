# Design — Pandecta AI

<!-- Escrito a partir do build, não antes dele. Cobre public/landing.html e,
     desde 23/08/2026, os tokens de cor/tipografia da SPA (public/index.html) também —
     comentário anterior estava desatualizado. Composição de tela (estrutura, não
     tokens) é tratada surface a surface: nova direção pra login/home ("mesa de
     despacho") em avaliação como maquete desde 03/09/2026, ainda não aplicada no
     código — ver CLAUDE.md antes de reaplicar qualquer coisa nessa linha. -->

**Régua declarada:** Harvey · Ironclad · Spellbook. Legaltech premium, executado em fidelidade total. Sobriedade cara, densidade alta, zero infantilidade.

**Modo da landing:** Persuadir. O visitante decide e age. A prova aparece antes da promessa.

---

## Cor

Superfície principal é papel branco. O navy da marca deixou de ser o fundo da página e virou **campo**, usado só duas vezes e no fim: Pioneiros e rodapé. Isso é o que muda a leitura de "SaaS escuro genérico" para "software jurídico sério".

| Token | Valor | Uso |
|---|---|---|
| `--paper` | `#FFFFFF` | superfície primária |
| `--surface` | `#F6F6F3` | seções alternadas, prova, preços |
| `--surface-2` | `#EFEEE9` | moldura de mídia |
| `--navy` | `#0D1B2A` | campo escuro, botão primário, rodapé |
| `--navy-2` | `#14263A` | hover do primário, CTA final |
| `--ink` | `#101A24` | texto |
| `--ink-2` | `#46525E` | texto secundário |
| `--ink-3` | `#636C76` | legenda, meta — **piso AA** |
| `--line` | `#E3E2DD` | fio de 1px |
| `--line-2` | `#D2D1CA` | borda de controle |
| `--gold` | `#8A6A22` | ícone e marcador sobre claro |
| `--gold-on-navy` | `#D3B667` | ênfase sobre navy |
| `--green` | `#2F6B4F` | estado protegido, selo |

**Regra de contraste:** todo texto de conteúdo ≥ 4.5:1. `#C9A84C` original dava 2.1:1 sobre branco e está proibido em texto — sobrevive só sobre navy.

## Tipografia

- **Libre Franklin** — títulos, interface, corpo. Substitui Inter, que era a assinatura visual do problema.
- **Source Serif 4** — só onde é documento: depoimento e trechos de peça. Ecoa o serif do visualizador do produto.
- Escala: h1 `clamp(38px,5vw,60px)` · h2 `clamp(28px,3.4vw,40px)` · h3 19px · corpo 17px/1.62 · meta 14–15px.
- **Tracking mínimo −0.024em.** O arquivo antigo chegava a −0.09em e destruía a forma da letra.
- Medida de leitura fixada em 66ch. Nenhum texto abaixo de 13.5px.

## Forma

- Fio de 1px é a única moldura. Raio 6px em controle, 8–10px em painel e mídia.
- Sombra tem deslocamento real e desfoque curto. **Halo colorido de raio zero é proibido** — era o "brilho dourado" que entregava o jogo.
- Espaçamento numa escala de 4px (`--sp-1`…`--sp-10`). Seção = 96px, aperta para 64px no mobile.
- **Ícones desenhados**, traço 1.5–1.8px, `currentColor`. Emoji nunca.

## Recusas permanentes

Fixadas porque foram exatamente o diagnóstico dos especialistas:

1. **Sem kicker/eyebrow.** Rótulo em caixa-alta espaçada acima de título é banido. O título se sustenta.
2. **Sem grade de cards iguais** como estrutura de página. As capacidades são lista com fio, não seis cartões com ícone.
3. **Sem emoji** como sistema de ícone.
4. **Sem texto em gradiente.** Ênfase vem de peso e tamanho.
5. **Sem pontinho pulsando** sem dado vivo por trás.
6. **Sem mockup desenhado.** A interface que aparece na página é captura da ferramenta real.
7. **Sem passo numerado** a menos que a ordem carregue informação que o leitor precise.

## Movimento

Um momento autoral: o hero se assenta ao carregar, em quatro tempos de 60ms, com `cubic-bezier(.16,1,.3,1)`. As seções sobem uma vez, discretamente, e o observer solta o elemento. `prefers-reduced-motion` desliga tudo e nada depende de animação para aparecer.

## Superfícies do navegador

Seleção, foco, barra de rolagem e numerais tabulares são temáticos, não default. É o sinal mais barato de que a página foi construída e não montada.

## Ativos

- `shot-documento.webp` · `shot-wizard.webp` · `shot-inicio.webp` — capturas reais da Pandecta, geradas em 23/08/2026 com Chromium a 1440×900 @2x, a partir de instância local com banco próprio. **A peça exibida é ilustrativa, com partes fictícias**, e a legenda diz isso na página.
- `logo-pandecta.webp` · `icone-pandecta.webp` — derivados dos PNGs originais. Os originais (3,1 MB somados) continuam no repo para as outras páginas; a landing não os carrega mais.

## Verificação

`node validate.js` e o detector da impeccable
(`node <skill>/scripts/detect.mjs --json public/landing.html`) — **0 ocorrências**, contra 35 na versão anterior.
