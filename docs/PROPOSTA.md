# Mil Terras — Proposta: Gestão + Portal do Parceiro

## A ideia em uma frase
Dois apps sobre **um único banco de dados**: o **Mil Terras Gestão** (para você, a distribuidora) e o **Mil Terras Parceiro** (para restaurantes, bares e lojas). O que o parceiro registra no salão vira, na hora, informação para você decidir. O que você aprova volta para o parceiro como reposição e conta a pagar.

```
 PARCEIRO (restaurante)                    MIL TERRAS (gestão)
 ─────────────────────                     ───────────────────
 registra venda (vinho + garçom)  ───────► giro real por rótulo/parceiro
 faz contagem e envia fechamento  ───────► caixa "Para conferir"
 pede reposição / novo rótulo     ───────► aprova → baixa consignado,
                                           gera conta a receber,
 recebe aviso + reposição         ◄─────── envia remessa do estoque central
 paga (forma do seu cadastro)     ───────► financeiro / fluxo de caixa
```

## Formato técnico: PWA (o "HTML que parece app")
- Um único código serve **iPhone, Android e computador**. No iPhone: Safari › Compartilhar › *Adicionar à Tela de Início*. Abre em tela cheia, com ícone próprio, e funciona com internet ruim (service worker).
- Sem App Store e sem mensalidade de loja; atualizações chegam sozinhas.
- Se no futuro quiser publicar nas lojas, o mesmo código pode ser empacotado com Capacitor.

## O que já está pronto neste repositório (versão 1, funcional)

### App Gestão (`/gestor`)
| Módulo | O que faz |
|---|---|
| **Painel** | Faturamento do mês com projeção, a receber/vencido, estoque central e consignado (garrafas e R$), gráfico faturamento × lucro, central de alertas, rótulos e parceiros que mais faturam, agenda de fechamentos, "onde está cada garrafa". |
| **Estoque central** | Saldo por rótulo, **cobertura em dias** (saldo ÷ giro), mínimo, custo médio; entradas (importação), venda direta, ajuste; histórico de movimentações. |
| **Consignação** | Mapa parceiro × rótulo, valor em terceiros, nova remessa (com sugestão de rótulos), recolhimento, **romaneio para assinatura**. |
| **Parceiros** | Ranking por receita e **giro**; ficha com faturamento por fechamento, rótulos mais vendidos, vendas por garçom, margem do parceiro (argumento comercial), oportunidades e cadastro (formas de pagamento, prazo, ciclo, PIN de acesso). |
| **Fechamentos** | Caixa de entrada dos fechamentos enviados pelos parceiros; conferência com divergência *contado × lançado no app*; ajuste e aprovação da reposição (limitada ao estoque central); pagamento; **relatório em PDF com o logo**; envio por WhatsApp. |
| **Financeiro** | DRE simplificada mensal (faturamento, CMV, despesas, resultado, recebido), contas a receber, despesas por categoria, exportação CSV. |
| **Inteligência** | Alertas automáticos (ver abaixo), **curva ABC**, giro por parceiro. |
| **Rótulos** | Os 14 vinhos do catálogo com foto, ficha técnica, preço, custo, margem e onde estão. |
| **Configurações** | Link + código + PIN de cada parceiro para enviar por WhatsApp, backup/restauração, "começar do zero". |

### App Parceiro (`/cliente`)
| Módulo | O que faz |
|---|---|
| **Início** | Período atual: garrafas vendidas, receita na carta, valor a pagar, **lucro do restaurante**; dias até o fechamento; rótulos acabando (pedido antecipado via WhatsApp); destaque da equipe. |
| **Registrar venda** | Toca no vinho → quantidade → garçom. 3 segundos. |
| **Relatórios** | Receita por dia/semana, **receita por vinho**, **ranking de garçons**, **mapa de calor garçom × rótulo**, rentabilidade por vinho; filtros de período; exportação CSV. |
| **Fechamento** | Assistente em 3 passos: (1) contagem já pré-preenchida pelo esperado; (2) **reposição sugerida** pelo ritmo de vendas + inclusão de novo rótulo com recomendação; (3) forma de pagamento (somente as liberadas no cadastro) e envio. Histórico e status. |
| **Carta e harmonização** | Assistente "o cliente vai comer…" que indica os vinhos certos, priorizando os que estão na casa. |
| **Equipe e preços** | Cadastro de garçons e preço de cada vinho na carta. |

### Funcionalidades inteligentes
1. **Reposição sugerida**: nível ideal = venda média diária × ciclo × 1,3 (+1). O parceiro só confirma.
2. **Cobertura do estoque central**: avisa quando um rótulo tem menos de 45 dias de estoque (tempo de uma importação).
3. **Rótulo parado**: garrafas sem giro há 45+ dias num parceiro → sugere recolher ou trocar.
4. **Recomendação de novos rótulos** por parceiro, com base no desempenho em parceiros parecidos (mesma região pesa mais).
5. **Divergência de contagem**: compara o contado com o lançado no app e aponta parceiros cuja equipe não registra vendas.
6. **Cobrança**: títulos vencidos e fechamentos atrasados viram alertas; resumo pronto para WhatsApp.
7. **Curva ABC e giro por parceiro** para decidir mix e quantidade.

## Dados da primeira carga
- **Reais** (dos PDFs): 14 rótulos, preços da tabela, ficha técnica, harmonização, fotos das garrafas, logo, paleta e fontes do Manual da Marca.
- **Fictícios** (para demonstração): 8 parceiros nas cidades atendidas e ~6 meses de movimento simulado.
- **Custo de aquisição** está provisório em 50% do preço de tabela: ajuste em *Rótulos › Editar*.
- Para começar a operação real: *Configurações › Começar do zero* (mantém só o catálogo).

## Roteiro sugerido
| Fase | Entrega |
|---|---|
| **1. Hoje** | Protótipo funcional (este repositório). Dados ficam no aparelho; os dois apps conversam quando abertos no mesmo navegador. Ideal para validar telas e fluxo com 1 ou 2 parceiros de confiança. |
| **2. Nuvem** (≈1–2 semanas) | Banco Supabase (`supabase/schema.sql` já escrito, com segurança por parceiro e tempo real). Login real por parceiro, sincronização entre aparelhos, publicação em domínio próprio (ex.: `app.milterras.com.br`). |
| **3. Automação** | Notificação push (iPhone 16.4+ e Android) quando chega fechamento ou aprovação; PIX com QR Code dinâmico e baixa automática; emissão de NF-e via integrador; envio automático do relatório em PDF. |
| **4. Expansão** | Pedido de venda direta (B2C/eventos), metas e comissão por garçom, previsão de compra para a próxima importação, multiusuário (vendedores). |

## Decisões que preciso de você
1. **Custo real** de cada rótulo (para margem e CMV corretos).
2. **Política de reposição**: o parceiro pode pedir livremente ou só dentro da sugestão?
3. **Perdas/quebras no parceiro**: entram como venda (cobradas) ou como perda da Mil Terras?
4. **Chave PIX** e se haverá boleto (qual banco), para a fase de cobrança automática.
5. **Domínio** para publicar os apps.
