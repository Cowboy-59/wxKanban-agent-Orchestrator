# Guia do wxBrainstorm

Como conversar sobre uma sugestão de cliente, um pedido de funcionalidade ou sua própria ideia com o painel
do wxBrainstorm, e transformar o que você decidir em um registro de decisão e, se quiser, em um escopo.

- **Comando:** `/wxBrainstorm`
- **Executa em:** seu assistente de IA (Claude Code, Cursor, BLACKBOX AI), ou pelo Dev Cockpit, em comandos
  **Standard**
- **Etapa:** qualquer uma. Costuma ser usado em Design, antes do `/buildscope`
- **Grava:** somente `docs/brainstorms/`, o livro de decisões e seu arquivo pessoal de aprendizados, e somente
  depois que você aprovar um resumo. Nunca grava escopos, specs ou código, e nunca faz commit nem push.

---

## 1. O que é

O wxBrainstorm pega uma ideia (ou um conjunto de sugestões de clientes relacionadas) e a analisa com um painel
de onze papéis, os mesmos papéis de agente que o wxG-O-D usa para construir software:

| Papel | Olha a ideia por este lado |
|---|---|
| **Lead Architect** (chair) | Onde ela se encaixa e se combina com o design existente. Dá a recomendação do painel em cada ponto |
| **Domain Analyst** | A necessidade real por trás do pedido, o fluxo de trabalho e as regras de negócio que ele altera |
| **Legacy Analyst** | O que o sistema antigo fazia, para apps convertidos ou legados |
| **Database Engineer** | Novos dados, migrações de dados existentes, volume, relatórios |
| **Backend Engineer** | APIs, jobs, integrações, o que acontece quando algo falha |
| **Frontend Engineer** | Qual tela, como os usuários a encontram, acessibilidade |
| **DevOps Engineer** | Custo de operação, novos serviços, monitoramento, implantação segura |
| **Security Engineer** | Quem pode ver ou fazer, vazamento de dados entre clientes, casos de abuso |
| **QA Engineer** | Como é testado, que comportamento que já funciona ele poderia quebrar |
| **Migration Engineer** | Mover dados ou clientes existentes para a nova forma, reversão |
| **Documentation Engineer** | Páginas de ajuda, notas de versão, como é explicado aos clientes |

Somente os papéis que o seu tema toca participam. O Lead Architect e o Domain Analyst sempre participam. Os
demais que ficarem de fora são citados em uma linha, para que você possa convocar um deles.

O resultado é um registro curto de **o que você decidiu e por quê**, mantido em `docs/brainstorms/`. Esse
registro evita que a mesma sugestão seja debatida de novo no mês seguinte, e pode ser passado diretamente
para o `/buildscope`.

---

## 2. Quando usar (e quando não usar)

**Use o wxBrainstorm quando:**

- um cliente pede algo e você precisa decidir se vai fazer e como
- vários clientes enviaram sugestões parecidas e você quer agrupar e priorizar
- você tem uma ideia própria para um projeto existente e quer que ela seja questionada antes de escopar
- um relatório de feedback precisa de uma decisão, não apenas de uma correção

**Use outra coisa quando:**

| Situação | Use em vez disso |
|---|---|
| A "ideia" é um produto novo inteiro ou um plano de projeto completo | `/wxG-O-D` (ele executa o wxBrainstorm dentro de si onde precisa) |
| Você já sabe exatamente o que construir | `/buildscope` diretamente |
| É um bug simples com correção óbvia | Corrija pelo `/implement` |
| Você quer auditar um escopo existente em busca de lacunas | `/analyzescope` |

Se o tema se revelar um produto novo inteiro no meio do caminho, o painel dirá isso e sugerirá o `/wxG-O-D`.

---

## 3. Como iniciar

```text
/wxBrainstorm                                             # asks what to brainstorm
/wxBrainstorm customers keep asking to export the board to Excel
/wxBrainstorm --level=amateur                             # explains every idea in plain terms
/wxBrainstorm --resume                                    # continue an open brainstorm
```

| Argumento | O que faz |
|---|---|
| texto livre | A ideia. Ela ainda é reformulada e confirmada antes de qualquer pesquisa |
| `--level=amateur` (ou `--amateur`) | Novato em projetos de desenvolvimento. Cada ideia é explicada em termos simples, com a boa prática por trás |
| `--level=junior` (ou `--junior`) | Alguma experiência. Explicações curtas para termos conhecidos, completas para os novos |
| `--level=senior` (ou `--senior`) | Experiente. Uma linha por papel, depois a recomendação. Você pergunta a partir daí. **Este é o padrão** |
| `--resume` | Lista os brainstorms abertos e continua o que você escolher |

Se você não informar um nível, será perguntado uma vez. Sem resposta, vale o nível senior. Quando você estiver
claramente à vontade no seu nível, o painel pode sugerir subir de nível, mas nunca muda o nível sozinho.

---

## 4. Como uma sessão funciona

### Passo 1: O painel é apresentado

Uma introdução de duas ou três linhas sobre os onze papéis. Nada mais acontece ainda.

### Passo 2: Você diz o que brainstormar, antes de qualquer pesquisa

O wxBrainstorm, de propósito, **não olha seu código, seus escopos nem seus documentos antes que o tema seja
confirmado**. Pesquisar primeiro desperdiça esforço com a coisa errada e contamina a pergunta com o que
estiver no código por acaso.

Você é perguntado, em uma única vez:

1. **Qual é a ideia?** Cole como o cliente a escreveu, informe o ID de um relatório de feedback ou descreva
   com suas palavras.
2. **De onde veio, e quantos pediram?** (opcional) Um cliente, vários, ou interno. Isso pesa na prioridade
   depois.
3. **O que você quer obter com isso?** Decidir se faz ou não, definir como deve funcionar, ou ordenar várias
   sugestões.

Em seguida, o tema é reformulado em uma linha, com a necessidade por trás dele:

> Tema: clientes querem o quadro no Excel. A necessidade parece ser compartilhar o status com pessoas que não
> têm login. Correto?

Responda **sim** ou corrija. Esta linha é o momento mais importante da sessão: um pedido de "exportação para
Excel" e uma necessidade de "compartilhar o status com pessoas de fora" levam a designs bem diferentes.

**Várias sugestões de uma vez?** Elas são agrupadas (duplicatas e quase duplicatas juntas), mostradas como
uma lista numerada, e você escolhe qual grupo vai primeiro. Cada grupo é um tema próprio e um registro
próprio, e cada um só é pesquisado quando chegar a sua vez.

**IDs de relatórios de feedback?** Com o MCP do wxKanban conectado, somente esses relatórios são buscados.
Sem ele, você é solicitado a colar os textos.

### Passo 3: O que já existe

Agora o painel pesquisa, voltado apenas para o tema confirmado: o código, `specs/Project-Scope/*.md`,
`specs/*/spec.md`, a ajuda, brainstorms anteriores e (com o MCP conectado) o índice de capacidades e os
feedbacks abertos de outros clientes.

Você recebe uma tabela como esta:

| Item | Situação | Evidência | Confiança |
|---|---|---|---|
| Exportação CSV de uma lista de tarefas | **Built** (Construído) | `src/server/routes/tasks.ts:212` | **Confirmed** (Confirmado) |
| Link somente leitura e compartilhável do quadro | **Planned** (Planejado, `SCOPE-0NN`) | documento de escopo | **Likely** (Provável) |
| Saída em Excel (.xlsx) | **Not found** (Não encontrado) | pesquisou rotas, serviços, ajuda | **Unknown** (Desconhecido) |

- **Situação:** **Built** (Construído) · **Partly built** (Parcialmente construído) · **Planned** (Planejado,
  `SCOPE-NNN`) · Decidido antes (registro) · **Not found** (Não encontrado)
- **Confiança:** **Confirmed** (Confirmado: foi lido) · **Likely** (Provável) · **Assumed** (Presumido) ·
  **Unknown** (Desconhecido) · **Conflicting** (Conflitante: dois lugares divergem)

"Not found" (Não encontrado) nunca é tratado como prova. Uma busca restrita é marcada como **Unknown**
(Desconhecido).

O que a tabela muda é dito primeiro:

- **Já construído:** o tema real pode ser que os clientes não encontram a função, o que é um trabalho para a
  ajuda e para a tela, não código novo.
- **Decidido antes:** a decisão anterior e seu motivo são mostrados, e você é perguntado o que mudou.
- **Planejado:** o brainstorm pode moldar esse escopo em vez de iniciar um novo.

Quando o tema alteraria um trabalho existente, você também vê **O que a mudança atingiria**: as specs, o
código e os escopos dependentes afetados, a partir das ferramentas de Análise de Impacto do kit. Isso serve
apenas para a discussão. Nada é registrado.

### Passo 4: A primeira visão do painel e a pauta

Cada papel aplicável dá uma linha, rotulada como **Benefit** (Benefício), **Risk** (Risco) ou **Question**
(Pergunta). Depois vem uma pauta numerada, sempre nesta ordem:

1. **A necessidade por trás do pedido** (sempre primeiro: os clientes pedem uma solução, o painel encontra o
   problema por trás dela)
2. **Quem usaria, e com que frequência**
3. **Reutilizar ou construir do zero**
4. **A menor versão útil**
5. **Cada risco ou pergunta levantado pelo painel**, com os itens de parar-e-sinalizar primeiro
6. **Encaixe e prioridade**: agora, depois, ou nunca (sempre por último)

Você escolhe por onde começar. O item 1 é o recomendado.

### Passo 5: O brainstorm propriamente dito

Um item por vez, em texto simples, no seu ritmo. Cada item termina com **a recomendação do coordenador
(chair) e uma pergunta simples**. Responda com suas palavras. Não há menus.

Antes de cada "qual o próximo?", a pauta inteira é mostrada novamente com a situação de cada item:

| Situação | Significado |
|---|---|
| **Suggestion** (Sugestão) | Ainda não discutido |
| **Agreed** (Acordado) | Você aceitou a recomendação |
| **Changed** (Alterado) | Você decidiu algo diferente do que foi pedido ou recomendado |
| **Added** (Adicionado) | Um item novo que surgiu durante a discussão |
| **Declined** (Recusado) | Decidido contra, com o motivo |
| **Parked** (Adiado) → \<onde\> | Pertence a outro lugar, geralmente a um tema separado |

No nível amateur, cada item segue um padrão fixo: onde estamos, o que é, por que importa, a visão do painel,
a sugestão, a boa prática por trás dela e a sua decisão.

### Passo 6: Encerramento e registro

Quando você disser que terminou, ou quando todos os itens tiverem uma situação, você recebe um resumo agrupado
em **Agreed** (Acordado), **Added** (Adicionado), **Changed** (Alterado), **Declined** (Recusado) e **Parked**
(Adiado). Então você escolhe, em palavras simples:

- **record it and take the agreed items to a scope** (registre e leve os itens acordados a um escopo)
- **record it only** (registre apenas: decisões mantidas, nada escopado ainda)
- **change the summary first** (altere o resumo primeiro: corrija, veja de novo, escolha outra vez)

**Este é o primeiro ponto em que algo é gravado.** Em qualquer uma das respostas de registro:

1. O registro é gravado em `docs/brainstorms/YYYY-MM-DD-<topic>.md`.
2. Cada decisão Agreed, Added, Changed e Declined é adicionada ao livro de decisões (`decisions/ledger.yaml`)
   pelo script de livro do kit. Os itens Parked são registrados como perguntas em aberto.
3. Os padrões gerais por trás das suas escolhas são adicionados ao seu arquivo pessoal de aprendizados.

Você é informado onde está o registro e quantas entradas do livro foram gravadas.

### Passo 7: Encaminhamento para um escopo (opcional)

Somente se você escolheu "levar para um escopo", e com o seu aval antes de cada um:

1. `/buildscope --from-md docs/brainstorms/<file>.md`. Sua própria verificação de reutilização decide se
   altera um escopo existente ou cria um novo, e todas as suas etapas interativas continuam valendo.
2. `/validateScope` sobre o resultado.
3. `/createSpecs` é oferecido, mas só é executado se você pedir.

O registro é atualizado conforme cada item é concluído: **To scope?** passa a `done (SCOPE-NNN)`. Se algum
comando falhar ou parar em um portão, a sessão para e diz exatamente onde. Ela nunca contorna o problema.

**Resposta ao cliente.** Quando a ideia veio de um cliente, você pode pedir um rascunho de resposta em
linguagem simples: o que foi decidido e, para uma ideia recusada, o porquê. Ele é mostrado somente no chat.
Nunca é enviado, e o status do relatório de feedback nunca é alterado, a menos que você peça.

---

## 5. Conversando com o painel

Estes funcionam em qualquer momento do passo 5:

| Você digita | O que acontece |
|---|---|
| **explain** (explique) | A versão mais longa do ponto atual: contexto, um exemplo, as trocas, como seria construído. Depois volta à forma curta |
| **question** (pergunta) ... (como primeira palavra) | Uma pergunta paralela. É respondida, e depois o brainstorm volta ao ponto em que estava. Não é uma decisão e não entra na pauta, a menos que você depois peça para adicioná-la |
| **Security, what worries you?** (Segurança, o que te preocupa?) | Chama um papel pelo nome. Esse papel responde com a própria voz e depois devolve a palavra ao coordenador |
| **what else could we do?** (o que mais poderíamos fazer?) | Mostra as alternativas (normalmente contidas para manter cada resposta curta) |
| Uma nova ideia no meio de um item | Anotada em uma linha; o item atual é concluído primeiro, e depois a nova é adicionada ao fim como **Added** (Adicionado) |
| **pause** (pausar) / "isto está ficando longo" | Oferece salvar o brainstorm como aberto (veja a seção 7) |

Quando os papéis discordam, os dois lados são mostrados, e o Lead Architect dá a recomendação e a troca
envolvida. O painel nunca esconde a divergência.

### Quando o painel para e sinaliza

O painel levanta estes pontos com clareza, como um **Risk** (Risco), com uma recomendação, em vez de contorná-los
silenciosamente:

- a ideia conflita com uma regra de negócio existente ou com o comportamento atual do app
- ela pode perder ou corromper dados existentes, ou não pode ser desfeita
- muda quem pode ver ou fazer o quê, ou toca nos dados de outro cliente
- depende de um sistema ou serviço que o app não possui
- cresceu além do que o cliente realmente pediu

---

## 6. O bloco de rascunho

`docs/brainstorms/Scratchpad.md` é uma visão ao vivo, de uma tela só, da sessão: o tema, seu nível, quem está
falando, **onde estamos**, a pauta com as situações, os itens aguardando o fim da lista, e o que foi acordado
mas ainda não foi registrado.

Mantenha-o aberto ao lado do chat para nunca perder o seu lugar: no VS Code, abra o arquivo e pressione
`Ctrl+K V`.

É um **display, não um registro**. Nada o lê como decisão. Quando um tema é encerrado, ele é reduzido a uma
linha que aponta para o registro.

---

## 7. Pausar e retomar

Um brainstorm longo enche a conversa e a deixa mais lenta. Pause depois que um tema for encerrado, ou sempre
que parecer longo.

**Para pausar no meio de um tema:** diga isso. Salvar é uma gravação, então você é perguntado antes. Com um
sim, o registro é gravado com **Status: open**, as decisões até então, a pauta restante e o próximo item.
Então você recebe:

> Salvo. Digite `/clear`, depois `/wxBrainstorm --resume`, e continuamos com: \<próximo item\>.

**Para retomar:** execute `/wxBrainstorm --resume`. Você recebe a lista de brainstorms abertos (tema, data de
abertura, próximo item) e escolhe um. As decisões até então e a pauta são mostradas novamente, o bloco de
rascunho é recriado, e a sessão continua no nível salvo. A pesquisa não é repetida, a menos que você peça ou
que o registro tenha mais de uma semana; nesse caso, uma atualização é oferecida, pois o app pode ter mudado.

---

## 8. O que é gravado, e onde

| Arquivo | Quando | Conteúdo |
|---|---|---|
| `docs/brainstorms/Scratchpad.md` | Durante toda a sessão | Somente visão ao vivo; espelha o que está na tela |
| `docs/brainstorms/YYYY-MM-DD-<topic>.md` | Depois que você aprova o resumo (ou concorda em pausar) | O registro: pedido, o que já existe, painel, decisões, itens em aberto, próximo passo |
| `decisions/ledger.yaml` | Logo após o registro, somente com um resumo aprovado | Uma entrada por decisão, gravada por `_wxAI/askgate/ledger.mjs`. Nunca edite este arquivo à mão; um hook o bloqueia |
| `~/.wxai/god-learnings.md` (Windows: `%USERPROFILE%\.wxai\god-learnings.md`) | Logo após o livro de decisões | Padrões gerais das suas escolhas, compartilhados com o wxG-O-D, para que as recomendações futuras combinem com o seu jeito de decidir. Nunca guarda nomes de projetos, clientes, caminhos ou números de escopo. Você pode ler, editar ou limpar a qualquer momento |

### O registro

```markdown
# Brainstorm: <topic>

- **Status:** open | closed
- **Opened / last updated:** YYYY-MM-DD / YYYY-MM-DD
- **Source:** <feedback report ID, "customer call", "sales demo", "internal">
- **Asked for by:** <how many customers, or which kind; never a name>
- **Level:** amateur | junior | senior
- **Next item:** <while open>

## The request
## What already exists
## Panel
## Decisions
| # | Item | Decision | Kind | To scope? | Date |
## Open items
## Next step
```

Sessões posteriores sobre o mesmo tema atualizam o mesmo arquivo. Linhas de decisões anteriores nunca são
reescritas: uma decisão revertida é uma nova linha que diz o que ela substitui.

---

## 9. Regras básicas

- **Pergunta antes de pesquisar.** O tema é sempre confirmado primeiro.
- **Texto simples, sem menus,** durante toda a sessão.
- **Nada é gravado até você aprovar um resumo,** exceto o bloco de rascunho.
- **Nunca escreve escopos, specs, tarefas ou código.** `/buildscope`, `/validateScope` e `/createSpecs` rodam
  somente com o seu aval, sob as próprias regras.
- **Nunca faz commit, push, deploy, nem envia nada a um cliente.**
- **Nenhum dado pessoal.** Clientes são citados pelo ID de feedback ou pela data, nunca por nome, e-mail ou
  telefone. Arquivos `.env`, chaves e certificados nunca são abertos.
- **Fatos são citados, sugestões são rotuladas.** Uma afirmação sobre o app aponta para onde foi encontrada.
  Todo o resto é marcado como **Assumed** (Presumido).

---

## 10. Dicas para uma boa sessão

- **Cole as palavras do cliente, não o seu resumo delas.** O Domain Analyst descobre a necessidade por trás do
  pedido; o seu resumo pode já ter escolhido uma solução.
- **Dedique o tempo ao item 1.** Acertar a necessidade deixa o resto da pauta curto.
- **Diga "Declined" em voz alta.** Um "não, porque..." registrado tem tanto valor quanto um "sim". É o que
  impede que o mesmo pedido seja debatido novamente.
- **Mantenha um tema por sessão.** Adie tudo que fugir do assunto. Um item adiado vira um brainstorm próprio
  depois.
- **Use "question" à vontade.** Perguntas paralelas nunca mudam a pauta nem contam como decisões.
- **Pause e use `/clear` entre temas.** Uma sessão nova por tema é mais rápida e mantém o painel focado.
- **Leia registros anteriores antes de uma sessão de planejamento de release.** `docs/brainstorms/` é o
  histórico do que foi decidido e por quê.

---

## 11. Solução de problemas

| Sintoma | Causa e solução |
|---|---|
| "The impact check is not available in this kit" | `_wxAI/impact/` não está instalado neste projeto. O brainstorm continua sem ele; atualize o kit para obtê-lo |
| "The ledger is not installed" | `_wxAI/askgate/ledger.mjs` está ausente. O registro ainda é gravado; atualize o kit para obter as entradas do livro de decisões |
| O script do livro recusa uma entrada | Ele rejeita duplicatas e aprovadores vazios. A recusa é informada em palavras simples e não é contornada; verifique se a decisão já está no livro |
| Os IDs de feedback não podem ser buscados | O MCP do wxKanban não está conectado. Cole o texto dos relatórios |
| `/buildscope` para em um portão durante o encaminhamento | A sessão para e diz onde. Resolva o portão e execute novamente o encaminhamento dos itens restantes |
| `--resume` não lista nada | Nenhum registro tem **Status: open**. Temas encerrados são reabertos iniciando um novo brainstorm sobre o mesmo assunto; o registro anterior é encontrado no passo 3 |

---

## Relacionados

- `/wxG-O-D`: planejamento do projeto inteiro; executa o wxBrainstorm em suas revisões, ideias e brainstorms de design
- `/buildscope`, `/validateScope`, `/createSpecs`: a cadeia de encaminhamento
- Referência de comandos: a página de Ajuda no app para `/wxBrainstorm`
- Registros anteriores: `docs/brainstorms/`
