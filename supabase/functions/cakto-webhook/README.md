# Cakto Webhook

Endpoint de sincronização de assinaturas do Cakto para o banco (tabelas `usuarios` e `subscriptions`).

## URL

Depois do deploy da Edge Function:

`https://<SEU_PROJECT_REF>.supabase.co/functions/v1/cakto-webhook`

## Segurança

Defina o segredo no Supabase:

- `CAKTO_WEBHOOK_SECRET`

A função valida o header `x-cakto-signature` (também aceita `cakto-signature`).

## Provisionamento automático de conta

Quando o evento chega com status de pagamento aprovado (ex.: `purchase_approved` / `subscription_renewed`) e o usuário ainda não existe:

- Cria automaticamente a conta no Auth (por e-mail)
- Garante registros em `public.profiles` e `public.usuarios`
- Envia e-mail de ativação/definição de senha via invite do Supabase
- Reprocessa o webhook para sincronizar assinatura em `usuarios/subscriptions`

Variável opcional:

- `APP_RESET_PASSWORD_URL` (default: `https://flixprev.com.br/reset-password`)

## Campos suportados do payload

A função tenta mapear de forma flexível:

- `event_id`, `id`, `data.id`
- `event`, `type`, `event_type`
- `status`, `data.status`, `subscription.status`, `order.status`
- `customer.email`, `buyer.email`, `data.customer.email`
- `customer.document|cpf`, `buyer.document|cpf`
- `metadata.user_id`, `customer.metadata.user_id`
- `plan.slug|name`, `subscription.plan.slug|name`
- `subscription.id`, `data.subscription.id`, `order.id`
- `subscription.expires_at`, `subscription.next_charge_at`

## Resultado

- Atualiza `public.usuarios.status_da_assinatura` (`ativo` / `inativo`)
- Upsert em `public.subscriptions` com metadados da assinatura
- Grava auditoria/idempotência em `public.subscription_webhook_events`
- Se necessário, cria conta automaticamente e envia e-mail de ativação

## Deploy

```bash
supabase functions deploy cakto-webhook
```

## Migração obrigatória

Aplique a migração:

- `supabase/migrations/20260226000003_cakto_webhook_subscription_sync.sql`
- `supabase/migrations/20260304000001_add_contact_fields_to_usuarios_and_cakto_rpc.sql`
