# Pandecta AI — Brand Reference

## Arquivos de logo

| Arquivo | Uso |
|---|---|
| `pandecta-icone.png` | Ícone P dourado isolado — sidebar, favicon, avatar P no chat |
| `pandecta-logo-horizontal.png` | Logo completa — tela de login, topbar |

> Ambos em alta resolução (~900KB cada). Fundo escuro (`#0C1020`).

---

## Ícone

- Letra **P** estilizada com círculo integrado
- Ponto circular no centro-direita do P
- Acabamento **dourado com gradiente metálico** (brilho 3D)
- Traço linear, elegante, premium

## Logo horizontal

- Ícone P + texto **"PANDECTA AI"** (serif, uppercase, espaçado)
- Subtítulo: **"INTELIGÊNCIA JURÍDICA"** (sans-serif, uppercase, muito espaçado, menor)
- Separadores horizontais dourados flanqueando o subtítulo
- Paleta: dourado `#C8823A` / branco / fundo dark `#0C1020`

---

## Paleta de cores

```
Dark sidebar:       #1A1D2B
Fundo principal:    #EDECEA   (off-white quente, não branco)
Branco cards:       #FFFFFF
Texto primário:     #1A1D2B
Texto secundário:   #6B7280
Texto terciário:    #9CA3AF
Âmbar accent:       #C8823A
Âmbar claro:        #D4924A
Borda inputs:       #E5E7EB
Active sidebar bg:  rgba(200,130,58,0.18)
Active sidebar bd:  rgba(200,130,58,0.35)
```

---

## Tipografia

| Elemento | Font | Tamanho | Peso |
|---|---|---|---|
| Headline hero | **Serif** (Playfair Display ou Georgia) | 38–42px | Bold |
| Accent headline | Mesmo serif | mesma | Bold, cor âmbar |
| Body / UI | Inter | 13–15px | 400/500 |
| Nav items | Inter | 14px | 400 |
| Labels form | Inter | 11px | 600, UPPERCASE, letter-spacing |
| Page title | Inter | 28px | 700 |

---

## Uso dos assets no código

```html
<!-- Ícone (sidebar, chat avatar) -->
<img src="/pandecta-icone.png" alt="P">

<!-- Logo horizontal (login, topbar) -->
<img src="/pandecta-logo-horizontal.png" alt="Pandecta AI">
```

**Sidebar dark:** usar `filter: brightness(0) invert(1)` NÃO — o logo já tem cores douradas que funcionam sobre fundo escuro sem filtro.

**Tela de login (fundo escuro):** mostrar logo horizontal sem filtro.

**Topbar (fundo claro):** usar versão com filtro ou uma versão dark do logo (a ser criada), ou usar só o texto "PANDECTA AI" em dark.
