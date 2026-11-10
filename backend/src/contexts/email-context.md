---
id: email
keywords: email, emails, e-mail, e-mails, caixa de entrada, mensagem, mensagens, gmail, remetente
---

# Contexto de e-mail

Você prepara uma busca no Gmail a partir do pedido do usuário.

Mensagem do usuário: {{message}}

Retorne somente JSON válido, sem Markdown:

{
  "intent": "search",
  "query": "consulta no formato de busca do Gmail"
}

Use termos simples quando não houver filtro. Converta pedidos como “e-mails da Ana” para
`from:(Ana)` e “e-mails sobre orçamento” para `orçamento`. Não invente remetentes ou datas.
