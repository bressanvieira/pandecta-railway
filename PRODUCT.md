# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Advogados brasileiros autônomos e escritórios pequenos (1–10 usuários). O usuário primário é o próprio advogado que redige — não um assistente de TI, não um paralegal. Situação real: precisa produzir uma peça (petição inicial, contestação, recurso, contrato, notificação, parecer) a partir dos fatos de um caso concreto, sob prazo, hoje resolvendo isso no Word com modelos antigos, copiar-e-colar de peças anteriores e pesquisa manual de fundamentação.

Perfil confirmado do beta principal: 30+ anos de prática, 3 escritórios, carteira concentrada em Imobiliário (~50%), Consumidor e Contratos.

## Product Purpose

Transformar os fatos de um caso em uma peça jurídica completa, fundamentada e no formato do escritório, pronta para revisão e protocolo. Sucesso = o advogado protocola a peça gerada. Isso já aconteceu uma vez, com o beta principal, em 03/07/2026.

## Positioning

Três mecanismos que um concorrente não pode copiar sem construir o mesmo sistema:

1. **Aprende o estilo do escritório.** O advogado sobe um `.docx` seu; um modelo de linguagem analisa a peça e extrai um Style Profile em JSON (tamanho de parágrafo, tom, uso de negrito, estrutura) que passa a governar obrigatoriamente toda geração. A exportação Word usa o próprio `.docx` como template real, preservando cabeçalho, rodapé, logo e configuração de página.
2. **Usa o acervo do próprio escritório como fonte.** Documentos do usuário (PDF/DOCX/TXT) viram contexto recuperável na geração e no assistente — não é um modelo genérico respondendo sobre direito brasileiro.
3. **Guardrails anti-injection em 4 camadas.** Um PDF aparentemente normal pode conter instruções ocultas para manipular a IA. A Pandecta detecta e bloqueia isso na entrada do acervo, na montagem do contexto, no system prompt e no assistente.

## Operating Context

O trabalho acontece em desktop, dentro do horário de expediente do escritório, sob prazo processual. O artefato final é um `.docx` que será revisado, assinado e protocolado em sistema de tribunal (PJe/e-SAJ). O vocabulário é o do foro: peça, petição inicial, contestação, recurso, parecer, protocolar, fundamentar, súmula, jurisprudência, CDC, CLT.

Avaliação de compra: o advogado julga a ferramenta pela qualidade da peça que ela produz, não pela interface. Ceticismo alto — a referência mental dele é "ChatGPT que alucina jurisprudência".

## Capabilities and Constraints

Confirmado e em produção:

- Geração por wizard: tipo → área → partes → fatos → responsável → modelo de estilo, com streaming
- 6 áreas com contexto legal e regras processuais próprias: Consumidor, Civil, Trabalhista, Família, Imobiliário, Previdenciário
- Sistema de Modelos (Style Profile) e exportação Word com template real
- Acervo com recuperação por palavra-chave (sem embeddings)
- Assistente multi-turn com contexto do acervo
- Histórico com edição, cópia e exportação
- Equipe (CRUD de advogados), Configurações do escritório com logo
- Multitenancy: todas as tabelas isoladas por `user_id`
- Painel admin e Executive Command Center

Restrições técnicas: SPA em HTML/CSS/JS vanilla em arquivo único (`public/index.html`), backend Node/Express, SQLite via better-sqlite3, deploy Railway. Sem framework, sem build step. A landing (`public/landing.html`) é um arquivo estático independente.

Indeciso: sistema de pagamento e trial estão desativados até haver mais validação. Busca ao vivo em jurisprudência não existe ainda — não pode ser prometida.

## Brand Commitments

- Nome: **Pandecta AI**. Artigo feminino, sempre: "a Pandecta".
- Logo travado pelo usuário: ícone "P" e logo horizontal (`public/pandecta-icone.png`, `public/pandecta-logo-horizontal.png`). Os PNGs atuais têm 925 KB e 2,1 MB e precisam ser otimizados sem trocar a marca.
- Preços e planos travados: R$79 (Solo, 1 advogado, 30 peças/mês), R$179 (Profissional, até 3 usuários, peças ilimitadas), R$379 (Escritório, até 10 usuários). Todos com 7 dias de teste.
- Programa Pioneiros: 20 vagas, 3 meses grátis, acesso direto ao fundador, selo vitalício, preço travado.
- Paleta e tipografia **não** são compromisso de marca — o usuário liberou explicitamente.
- **Régua de acabamento (preferência permanente, declarada em 23/08/2026):** a Pandecta deve poder sentar ao lado de **Harvey, Ironclad e Spellbook** sem parecer amadora. O usuário escolheu deliberadamente o padrão da categoria — legaltech premium — executado em fidelidade total, sem ironia e sem excentricidade contrabandeada. Sobriedade cara, densidade de informação alta, zero infantilidade. Essa decisão vale para superfícies futuras, não só para a landing.
- Domínio: pandecta.com.br. Deadline de mercado: ExpoLaw, outubro de 2026.

## Evidence on Hand

Real e utilizável:

- **Fabiano** — beta principal. Usou 100% da peça gerada e protocolou em juízo em 03/07/2026. A citação dele já está publicada na landing atual com o primeiro nome e o descritor "Advogado, 30+ anos de prática, 3 escritórios". Permissão para uso nomeado ainda **não** foi formalizada.
- **Kiko** — validou o System Prompt v4 em 22/05/2026.
- **A própria ferramenta** — screenshots reais do wizard e do visualizador de documento podem ser capturados e usados. O hero atual usa um mockup de navegador desenhado à mão, não a interface real.

Ausências que não podem ser inventadas: número de usuários, número de peças geradas, tempo médio economizado, taxa de aprovação em tribunal, qualquer cliente além do beta acima, qualquer prêmio, imprensa ou selo de certificação.

## Product Principles

1. **A peça é o produto.** Toda decisão de superfície serve a demonstrar a qualidade do texto jurídico gerado. Interface bonita que esconde a peça falhou.
2. **Prova antes de promessa.** O comprador é cético por formação. Um trecho real de peça vale mais que qualquer adjetivo.
3. **Nunca prometer capacidade que não existe.** Jurisprudência ao vivo, integração com tribunal e métricas de uso estão fora do discurso até existirem.
4. **O escritório é o dono do estilo.** A Pandecta se adapta ao advogado, não o contrário — é o que separa a ferramenta de um chat genérico.
5. **Vocabulário do foro, não do Vale do Silício.** "Peça", "protocolar", "fundamentar" — não "workflow", "produtividade", "game changer".

## Accessibility & Inclusion

Público majoritariamente 35–65 anos, lendo em desktop, frequentemente em telas de escritório mal calibradas. Corpo de texto nunca abaixo de 16px; contraste mínimo WCAG AA (4.5:1) em todo texto de conteúdo — a página atual falha esse piso em 10 pontos.
