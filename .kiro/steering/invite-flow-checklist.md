# Checklist - Fluxo de Convite de Usuário

## ✅ Configurações Verificadas

### 1. Redirect URLs no Supabase
- ✅ `https://flixprev.com.br/reset-password` (destacada na imagem)
- ✅ `https://flixprev.com.br/login`
- ✅ `https://flixprev.com.br/`
- ✅ `https://flixprev.com.br/app`
- ✅ `https://flixprev.com.br/esqueci-senha`
- ✅ URLs localhost para desenvolvimento

### 2. Edge Function
- ✅ Usa `inviteUserByEmail()` corretamente
- ✅ Cria usuário sem senha
- ✅ Envia email de convite
- ✅ Atualiza role do usuário

### 3. Página de Reset de Senha
- ✅ Detecta sessão de recuperação
- ✅ Valida senha com Zod
- ✅ Atualiza senha do usuário
- ✅ Redireciona para login após sucesso

## 🔍 Verificações Necessárias no Dashboard Supabase

### 1. Email Templates
**Caminho**: Authentication → Email Templates → Invite user

**Verificar**:
- [ ] Template "Invite user" está ativo
- [ ] Usa `{{ .ConfirmationURL }}` no link
- [ ] Não tem URL hardcoded
- [ ] Está em português (opcional)

**Template recomendado**:
```html
<h2>Bem-vindo ao FlixPrev I.A!</h2>
<p>Você foi convidado para criar uma conta no FlixPrev I.A.</p>
<p>Clique no link abaixo para definir sua senha e ativar sua conta:</p>
<p><a href="{{ .ConfirmationURL }}">Definir minha senha</a></p>
<p>Este link expira em 24 horas.</p>
<p>Se você não solicitou este convite, ignore este email.</p>
```

### 2. Email Settings
**Caminho**: Project Settings → Authentication → Email

**Verificar**:
- [ ] SMTP configurado (ou usando Supabase SMTP)
- [ ] Email "From" configurado
- [ ] Rate limiting não está bloqueando emails

### 3. Auth Settings
**Caminho**: Authentication → Settings

**Verificar**:
- [ ] "Enable email confirmations" está DESABILITADO (para convites)
- [ ] "Secure email change" configurado conforme necessário
- [ ] "Mailer URLs" aponta para `https://flixprev.com.br`

## 🧪 Teste do Fluxo Completo

### Passo 1: Criar Usuário
1. Login como admin em `https://flixprev.com.br/app/users`
2. Clicar em "Criar Novo Usuário"
3. Preencher:
   - Email: `teste@exemplo.com`
   - Nome: `Teste`
   - Sobrenome: `Usuário`
   - Role: `user`
4. Clicar em "Criar Usuário"

**Resultado esperado**:
- ✅ Mensagem: "Usuário criado com sucesso! Um e-mail de convite foi enviado..."
- ✅ Usuário aparece na lista

### Passo 2: Verificar Email
1. Abrir email em `teste@exemplo.com`
2. Verificar se recebeu email de convite

**Resultado esperado**:
- ✅ Email recebido (verificar spam se não aparecer)
- ✅ Assunto: "Você foi convidado" ou similar
- ✅ Link presente no email

### Passo 3: Clicar no Link
1. Clicar no link do email

**Resultado esperado**:
- ✅ Redireciona para `https://flixprev.com.br/reset-password`
- ✅ Mensagem: "Sessão de recuperação de senha ativa..."
- ✅ Formulário de nova senha aparece

### Passo 4: Definir Senha
1. Inserir nova senha (mínimo 8 caracteres, 1 maiúscula, 1 minúscula, 1 número)
2. Confirmar senha
3. Clicar em "Redefinir Senha"

**Resultado esperado**:
- ✅ Modal de sucesso aparece
- ✅ Redireciona para `/login` após 3 segundos

### Passo 5: Fazer Login
1. Inserir email e senha definida
2. Clicar em "Entrar"

**Resultado esperado**:
- ✅ Login bem-sucedido
- ✅ Redireciona para `/app`
- ✅ Usuário consegue acessar o sistema

## 🐛 Troubleshooting

### Problema: Email não chega
**Possíveis causas**:
1. SMTP não configurado
2. Email na caixa de spam
3. Rate limiting do Supabase
4. Email inválido

**Soluções**:
- Verificar logs do Supabase (Authentication → Logs)
- Configurar SMTP customizado
- Verificar caixa de spam
- Testar com email diferente

### Problema: Link redireciona para lugar errado
**Possíveis causas**:
1. Template de email com URL hardcoded
2. Redirect URLs não configuradas
3. Mailer URLs incorretas

**Soluções**:
- Verificar template usa `{{ .ConfirmationURL }}`
- Adicionar URL correta nas Redirect URLs
- Configurar Mailer URLs em Auth Settings

### Problema: "Sessão não encontrada" na página de reset
**Possíveis causas**:
1. Link expirado (24h)
2. Link já usado
3. Cookies bloqueados

**Soluções**:
- Reenviar convite (criar usuário novamente)
- Verificar se cookies estão habilitados
- Limpar cache do navegador

### Problema: Erro ao definir senha
**Possíveis causas**:
1. Senha não atende requisitos
2. Sessão expirada
3. Erro no Supabase

**Soluções**:
- Verificar requisitos de senha (8+ chars, 1 maiúscula, 1 minúscula, 1 número)
- Clicar no link do email novamente
- Verificar logs do Supabase

## 📝 Logs Úteis

### Ver logs da Edge Function
```bash
# No terminal local
supabase functions logs admin-create-user --project-ref ocguczxwkxjdaredqzrx
```

### Ver logs de autenticação no Supabase
1. Dashboard → Authentication → Logs
2. Filtrar por "invite" ou email do usuário
3. Verificar se email foi enviado

### Ver logs no navegador
1. F12 → Console
2. Verificar erros durante o processo
3. Network tab para ver requisições

## ✅ Status Atual

- ✅ Código da aplicação está correto
- ✅ Edge Function está correta
- ✅ Redirect URLs configuradas
- ✅ **CORREÇÃO APLICADA**: Detecção de convite/recuperação com prioridade máxima
- ✅ **CORREÇÃO APLICADA**: Redirect forçado para `/reset-password` quando detectar `type=recovery`, `type=invite` ou `type=signup`
- ✅ **CORREÇÃO APLICADA**: Bloqueio de acesso ao `/app` durante processo de definição de senha
- ⏳ Aguardando teste completo do fluxo em produção

## 🎯 Próximos Passos

1. **Aguardar deploy na Vercel** (~2-3 minutos)
2. **Testar fluxo completo** criando um usuário de teste
3. **Verificar se usuário é redirecionado para `/reset-password`** ao clicar no link do email
4. **Confirmar que consegue definir senha** e fazer login

## 🔧 O Que Foi Corrigido

### Problema Identificado
Quando o usuário clicava no link do email de convite, ele era logado automaticamente e redirecionado para `/app` ao invés de ir para `/reset-password` definir a senha.

### Solução Implementada
1. **Detecção prioritária**: Verificar PRIMEIRO se há `type=recovery`, `type=invite` ou `type=signup` no hash da URL
2. **Redirect forçado**: Se detectar convite/recuperação, redirecionar IMEDIATAMENTE para `/reset-password`
3. **Bloqueio de acesso**: Impedir acesso ao `/app` enquanto houver sessão de recuperação ativa
4. **Ordem de prioridade**: Convite/recuperação tem prioridade sobre qualquer outra lógica de redirect

### Código Modificado
- `src/components/SessionContextProvider.tsx`: Lógica de detecção e redirect movida para o topo da função `handleSession()`
