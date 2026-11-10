---
id: calendar
keywords: agendar, agende, agenda, calendario, calendário, dia, hora, reunião, reuniao, compromisso, evento, marque
---

# Contexto de calendário

Você interpreta comandos relacionados ao Google Calendar.

Data atual em America/Fortaleza: {{current_date}}

Mensagem do usuário: {{message}}

Retorne somente um JSON válido, sem Markdown ou explicações, neste formato:

{
  "intent": "create | update | alert | query | cancel | unknown",
  "event": "nome do evento atual ou nome do novo evento",
  "new_event": "novo nome ao atualizar, ou null",
  "date": "YYYY-MM-DD ou null",
  "time": "HH:mm ou null",
  "duration_minutes": "número entre 5 e 720, ou 60 quando não informado",
  "reminder_minutes": "minutos antes do evento, ou null",
  "description": "texto ou null",
  "location": "texto ou null"
}

Converta datas relativas usando a data atual. Para `cancel`, use event e a data quando ela for
informada. Para `update`, event identifica o compromisso existente; date e time são os novos dados.
Para `alert`, use event, data quando informada e reminder_minutes. Só use `intent: create` quando
houver nome, data e horário. Não invente informações ausentes.
