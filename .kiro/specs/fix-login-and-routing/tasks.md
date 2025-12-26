# Implementation Plan

- [x] 1. Adicionar configuração SPA fallback no vercel.json


  - Adicionar seção "rewrites" antes de "headers"
  - Configurar rewrite de todas as rotas para /index.html
  - Manter headers de segurança existentes
  - _Requirements: 1.1, 1.2, 1.3, 1.4_



- [ ] 2. Adicionar configuração SPA fallback no netlify.toml
  - Adicionar seção "redirects" antes de "headers"
  - Configurar redirect de todas as rotas para /index.html com status 200


  - Manter headers de segurança existentes
  - _Requirements: 1.1, 1.2, 1.3, 1.5_

- [ ] 3. Modificar Edge Function para enviar convite por e-mail
  - Remover parâmetro `password` da criação de usuário
  - Mudar `email_confirm` para `false`


  - Adicionar chamada para `admin.inviteUserByEmail()` após criar usuário
  - Atualizar mensagem de sucesso para informar que e-mail foi enviado
  - Adicionar logs detalhados para debug
  - _Requirements: 2.1, 2.2, 2.3_



- [ ] 4. Atualizar CreateUserDialog para remover campo de senha
  - Remover input de senha do formulário
  - Remover validação de senha
  - Atualizar mensagem de sucesso para informar sobre e-mail de convite


  - Adicionar tooltip explicando que usuário receberá e-mail
  - _Requirements: 2.2_

- [ ] 5. Atualizar validação para não exigir senha
  - Modificar `src/lib/validations.ts` para criar schema sem senha

  - Criar `createUserByAdminSchema` sem campo password
  - Manter validação de email, first_name, last_name e role
  - _Requirements: 2.1_

- [ ]* 6. Testar roteamento em desenvolvimento
  - Fazer build de produção local
  - Testar acesso direto a rotas
  - Testar reload de páginas


  - Verificar que não há erro 404
  - _Requirements: 1.1, 1.2, 1.3_

- [ ]* 7. Testar criação de usuário e login
  - Criar usuário pelo painel admin
  - Verificar se e-mail de convite foi enviado
  - Clicar no link do e-mail
  - Definir senha
  - Fazer login com as credenciais
  - Verificar acesso ao /app
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ]* 8. Testar em produção
  - Fazer deploy das mudanças
  - Testar todas as rotas com reload
  - Criar usuário de teste
  - Verificar fluxo completo de convite e login
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5_
