# Cakto Webhook

Endpoint de sincronização de assinaturas do Cakto para o banco (tabelas `usuarios` e `subscriptions`).

## URL

Depois do deploy da Edge Function:

`https://<SEU_PROJECT_REF>.supabase.co/functions/v1/cakto-webhook`

Atencao: o caminho termina com `cakto-webhook`.
Se estiver como `cakto-webhoc`, `cakto-webhoo` ou qualquer outra variacao, vai falhar.

## Segurança

Defina o segredo no Supabase:

- `CAKTO_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

A função valida o header `x-cakto-signature` (também aceita `cakto-signature`).

Se o segredo `CAKTO_WEBHOOK_SECRET` estiver configurado no Supabase, o teste também precisa enviar a assinatura correta.
Sem isso, a função responde `401 Invalid webhook signature`.

## Provisionamento automático de conta

Quando o evento chega com compra aprovada e o usuário ainda não existe:

- A criação automática acontece apenas em `purchase_approved` ou equivalente de pagamento aprovado
- `subscription_renewed` não cria conta nova
- `boleto_gerado`, `pix_gerado`, `purchase_refused`, `refund`, `chargeback` e cancelamentos não criam conta

- Cria automaticamente a conta no Auth (por e-mail)
- Garante registros em `public.profiles` e `public.usuarios`
- Gera o link de definição de senha no Supabase e envia um e-mail customizado de boas-vindas via Resend
- Reprocessa o webhook para sincronizar assinatura em `usuarios/subscriptions`

Variável opcional:

- `APP_RESET_PASSWORD_URL` (default: `https://flixprev.uxcodedev.com.br/reset-password`)
- `APP_BASE_URL` (default: `https://flixprev.uxcodedev.com.br`)
- `RESEND_FROM_EMAIL` (ex.: `FlixPrev <onboarding@seudominio.com>`)

## Campos suportados do payload

A função tenta mapear de forma flexível:

- `event_id`, `id`, `data.id`
- `event`, `type`, `event_type`
- `status`, `data.status`, `subscription.status`, `order.status`
- `customer.email`, `buyer.email`, `data.customer.email`
- `data.buyer.email`, `contact.email`
- `customer.document|cpf`, `buyer.document|cpf`
- `customer.docNumber`, `buyer.docNumber`, `data.customer.document|cpf|docNumber`
- `customer.name|full_name`, `buyer.name|full_name`, `data.customer.name|full_name`
- `customer.phone|phone_number|mobile_phone`, `buyer.phone|phone_number|mobile_phone`
- `metadata.user_id`, `customer.metadata.user_id`
- `buyer.metadata.user_id`, `data.metadata.user_id`
- `plan.slug|name`, `subscription.plan.slug|name`
- `data.subscription.plan.slug|name`, `offer.slug|name`
- `subscription.id`, `data.subscription.id`, `order.id`
- `data.order.id`, `customer.id|customer_id`, `buyer.id|customer_id`
- `subscription.expires_at`, `subscription.next_charge_at`

## Resultado

- Atualiza `public.usuarios.status_da_assinatura` (`ativo` / `inativo`)
- Upsert em `public.subscriptions` com metadados completos do webhook
- Grava auditoria/idempotência em `public.subscription_webhook_events`
- Se necessário, cria conta automaticamente e envia e-mail de ativação
- O e-mail enviado inclui boas-vindas, dados da compra e botão para definir a senha

## Diagnóstico rápido

- URL correta: `https://gyqsvfwwgiarmhibdjyp.supabase.co/functions/v1/cakto-webhook`
- Se o teste falhar com `404`, normalmente o nome da função na URL está errado.
- Se falhar com `401`, o problema costuma ser assinatura/segreto.
- Se falhar com `500`, o problema tende a ser migração pendente ou segredo `SUPABASE_SERVICE_ROLE_KEY`/`CAKTO_WEBHOOK_SECRET` não configurado.

## Deploy

```bash
supabase functions deploy cakto-webhook
```

## Migração obrigatória

Aplique a migração:

- `supabase/migrations/20260226000003_cakto_webhook_subscription_sync.sql`
- `supabase/migrations/20260304000001_add_contact_fields_to_usuarios_and_cakto_rpc.sql`
