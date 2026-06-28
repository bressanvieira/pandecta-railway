# Projeção Financeira — Pandecta AI
> Elaborado em: 2026-06-25 | Câmbio referência: R$5,75/USD | Horizonte: Jul 2026 – Jun 2027

---

## 1. Premissas do modelo

| Variável | Valor | Fonte/Lógica |
|---|---|---|
| ARPU blended | R$160/mês | Mix 50% Solo (R$97) + 35% Pro (R$197) + 15% Escritório (R$397) |
| Churn mensal | 5% | Referência SaaS B2B early-stage |
| Custo Anthropic/usuário/mês | R$10 | 15 docs (Sonnet) + 20 turns assistente (Haiku) |
| Câmbio USD/BRL | 5,75 | Jun 2026 |
| Claude Sonnet 4.6 | $3/M input · $15/M output | Anthropic pricing |
| Claude Haiku 4.5 | $0,80/M input · $4/M output | Anthropic pricing |

### Custo por documento gerado (Sonnet)
- Input: ~1.900 tokens → $0,0057
- Output: ~4.500 tokens → $0,0675
- **Total/doc: $0,0732 ≈ R$0,42**

### Custo por turn do assistente (Haiku)
- Input: ~2.000 tokens → $0,0016
- Output: ~600 tokens → $0,0024
- **Total/turn: $0,004 ≈ R$0,023**

---

## 2. Precificação

| Plano | Preço/mês | Usuários | Docs/mês | Mix |
|---|---|---|---|---|
| Solo | R$97 | 1 | 20 | 50% |
| Profissional | R$197 | 1 | Ilimitado | 35% |
| Escritório | R$397 | até 5 | Ilimitado | 15% |
| **ARPU blended (conservador)** | **R$160** | — | — | — |

---

## 3. Economia unitária

| Métrica | Valor |
|---|---|
| ARPU | R$160/mês |
| COGS variável/usuário (Anthropic + infra) | R$11/mês |
| Margem de contribuição | R$149/usuário/mês |
| Gross Margin | ~93% |
| LTV (churn 5%/mês → vida média 18,7 meses) | R$2.980 |
| CAC estimado (orgânico) | R$200 |
| LTV:CAC ratio | **14,9×** (excelente — benchmark: >3×) |

---

## 4. Projeção de usuários e receita (12 meses)

| Mês | Período | Usuários Ativos | MRR (R$) | Anthropic (R$) | Infra (R$) | Gross Profit (R$) | GM% |
|---|---|---|---|---|---|---|---|
| 1 | Jul '26 | 10 | 1.600 | 100 | 80 | 1.275 | 80% |
| 2 | Ago '26 | 22 | 3.520 | 220 | 80 | 3.075 | 87% |
| 3 | Set '26 | 40 | 6.400 | 400 | 80 | 5.775 | 90% |
| 4 | Out '26 | 65 | 10.400 | 650 | 120 | 9.485 | 91% |
| 5 | Nov '26 | 95 | 15.200 | 950 | 200 | 13.905 | 91% |
| 6 | Dez '26 | 133 | 21.280 | 1.330 | 250 | 19.555 | 92% |
| 7 | Jan '27 | 165 | 26.400 | 1.650 | 350 | 24.255 | 92% |
| 8 | Fev '27 | 205 | 32.800 | 2.050 | 400 | 30.205 | 92% |
| 9 | Mar '27 | 252 | 40.320 | 2.520 | 500 | 37.155 | 92% |
| 10 | Abr '27 | 306 | 48.960 | 3.060 | 600 | 45.155 | 92% |
| 11 | Mai '27 | 371 | 59.360 | 3.710 | 700 | 54.805 | 92% |
| 12 | Jun '27 | 446 | 71.360 | 4.460 | 850 | 65.905 | 92% |

> **ARR mês 12: R$856.320**
> *EBITDA calculado antes do salário do fundador (R$15k/mês). Com salário, break-even no mês 7.*

---

## 5. Escalonamento de infraestrutura

| Usuários | Stack | Custo/mês | Quando |
|---|---|---|---|
| 0–50 | Railway Pro (atual) | R$80 | Meses 1–4 |
| 51–150 | Railway Pro enhanced | R$200 | Meses 5–6 |
| 151–300 | AWS t3.medium + RDS t3.small | R$600 | Meses 7–9 |
| 301–500 | AWS t3.large + RDS multi-AZ + CloudFront | R$1.400 | Meses 10–12 |
| 501–1.500 | AWS ECS Fargate + Aurora serverless + WAF | R$3.500 | Ano 2 |
| 1.500+ | AWS EKS + Aurora cluster + Redis + multi-região | R$8.000+ | Ano 2–3 |

---

## 6. Break-even

- **Sem salário fundador:** break-even no **mês 1** (~3 usuários pagantes cobrem custos fixos de R$345/mês)
- **Com salário fundador (R$15k/mês):** break-even no **mês 7** — Jan 2027, com 165 usuários e MRR de R$26.400
- Fórmula: (R$15.000 + R$495 fixos) / R$149 contribuição = **103 usuários**

---

## 7. Valuation — cenários de aquisição

### Mês 3 (Set 2026) — pré-tração
- ARR: R$76.800
- Múltiplo ARR (8–12×): R$614k – R$922k
- Com prêmio estratégico 1,5×: **R$920k – R$1,4M** (~USD 160k–240k)

### Mês 6 (Dez 2026) — tração inicial
- ARR: R$255.360
- Múltiplo ARR (10–15×): R$2,55M – R$3,83M
- Com prêmio estratégico 1,5×: **R$3,8M – R$5,7M** (~USD 660k–1M)

### Mês 12 (Jun 2027) — escala
- ARR: R$856.320
- Múltiplo ARR (15–20×): R$12,8M – R$17,1M
- Com prêmio estratégico 2×: **R$25,6M – R$34,2M** (~USD 4,5M–6M)

---

## 8. Potenciais compradores

| Comprador | Tese | Múltiplo estimado | Diferencial |
|---|---|---|---|
| Jusbrasil | Distribuição + geração de docs | 10–14× ARR | 1,3M advogados já na plataforma |
| Enter AI | Cobre o lado do autor (complementar) | 12–18× ARR | Fechar todo o espectro da lide |
| Harvey / Clio (EUA) | Entrada no mercado brasileiro | 15–25× ARR | BR = 1,3M OAB sem player dominante |
| PE / VC (Série A) | Investimento (não aquisição) | 8–12× ARR | Proof of concept + crescimento |

---

## 9. Análise de sensibilidade — MRR mês 12

| Cenário | Multiplicador | Usuários | MRR mês 12 | ARR | Valuation (20× + 2×) |
|---|---|---|---|---|---|
| Bear | 50% da projeção | 223 | R$35.680 | R$428k | R$17,1M |
| **Base** | **100%** | **446** | **R$71.360** | **R$856k** | **R$34,2M** |
| Bull | 150% (ExpoLaw + viral) | 669 | R$107.040 | R$1,28M | R$51,4M |

---

## 10. Marcos críticos

- [ ] **Jul 2026** — 10 pioneiros pagantes (R$1.600 MRR)
- [ ] **Out 2026** — 65 usuários, MRR R$10k → ponto de credibilidade para investidores anjo
- [ ] **Dez 2026** — ExpoLaw → pico de aquisição, MRR R$21k
- [ ] **Jan 2027** — Break-even (inc. salário fundador)
- [ ] **Jun 2027** — ARR R$856k → janela ideal para levantar Série A ou negociar M&A

---

## 11. Comparáveis de mercado

| Empresa | Segmento | Valuation | Múltiplo ARR | Referência |
|---|---|---|---|---|
| Enter AI | LegalTech BR corporativo | US$1,2B (unicórnio) | ~100× | Mai 2026 |
| Harvey AI | LegalTech global (grandes firmas) | US$3B+ | ~50× | 2025 |
| Clio | LegalTech (escritórios médios, CA/US) | US$3B | ~20× | 2024 |
| Jusbrasil | LegalTech BR (plataforma) | ~R$2B | ~15× | 2023 est. |
| **Pandecta AI** | **LegalTech BR (advogado solo/PME)** | **R$900k–R$34M** | **10–20×** | **projeção** |

> O nicho da Pandecta (advogado solo/pequeno escritório, self-service, preço acessível) é o único não coberto por nenhum dos players acima. Isso cria uma janela de oportunidade clara antes que qualquer um deles pivote para baixo.

---

*Tags: #financeiro #projeção #valuation #SaaS #pandecta #custos*
*Atualizar mensalmente com MRR real vs. projetado.*
