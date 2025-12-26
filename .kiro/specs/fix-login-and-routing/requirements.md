# Requirements Document

## Introduction

Este documento define os requisitos para corrigir dois problemas críticos na aplicação FlixPrev I.A:
1. Erro 404 ao atualizar páginas em produção (problema de roteamento SPA)
2. Impossibilidade de fazer login com usuários criados pelo painel administrativo

## Glossary

- **SPA (Single Page Application)**: Aplicação web que carrega uma única página HTML e atualiza dinamicamente o conteúdo
- **Client-side routing**: Roteamento gerenciado pelo JavaScript no navegador, não pelo servidor
- **404 Error**: Erro HTTP indicando que o recurso não foi encontrado
- **Edge Function**: Função serverless do Supabase executada no backend
- **Admin Panel**: Painel administrativo para gerenciar usuários
- **Supabase Auth**: Sistema de autenticação do Supabase

## Requirements

### Requirement 1

**User Story:** Como usuário, eu quero que as páginas da aplicação funcionem corretamente ao atualizar o navegador em produção, para que eu não veja erros 404

#### Acceptance Criteria

1. WHEN um usuário atualiza a página em qualquer rota da aplicação, THE Sistema SHALL servir o index.html corretamente
2. THE Sistema SHALL configurar o servidor para redirecionar todas as rotas para index.html (SPA fallback)
3. THE Sistema SHALL manter o roteamento client-side funcionando após o reload
4. IF o servidor é Vercel, THEN THE Sistema SHALL usar vercel.json para configurar rewrites
5. IF o servidor é Netlify, THEN THE Sistema SHALL usar _redirects ou netlify.toml para configurar redirects

### Requirement 2

**User Story:** Como administrador, eu quero criar usuários pelo painel admin e eles conseguirem fazer login, para que eu possa gerenciar acessos facilmente

#### Acceptance Criteria

1. WHEN um admin cria um usuário via Edge Function, THE Sistema SHALL criar o usuário no Supabase Auth corretamente
2. THE Sistema SHALL enviar e-mail de confirmação para o novo usuário com link para definir senha
3. WHEN o usuário clica no link de confirmação, THE Sistema SHALL permitir que ele defina sua senha
4. THE Sistema SHALL criar o perfil do usuário na tabela profiles automaticamente
5. WHEN o usuário tenta fazer login com as credenciais, THE Sistema SHALL autenticar com sucesso

### Requirement 3

**User Story:** Como desenvolvedor, eu quero entender por que o login falha para usuários criados pelo admin, para que eu possa corrigir o problema

#### Acceptance Criteria

1. THE Sistema SHALL verificar se o usuário foi criado corretamente no Supabase Auth
2. THE Sistema SHALL verificar se o e-mail foi confirmado
3. THE Sistema SHALL verificar se a senha foi definida corretamente
4. THE Sistema SHALL logar erros detalhados durante o processo de criação de usuário
5. THE Sistema SHALL validar que a Edge Function está usando os parâmetros corretos do Supabase Auth
