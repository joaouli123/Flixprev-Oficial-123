# Requirements Document

## Introduction

Este documento define os requisitos para corrigir erros e avisos no console do navegador da aplicação FlixPrev I.A. O objetivo é eliminar todos os erros 404 relacionados ao manifest.json e remover logs desnecessários que poluem o console, garantindo uma experiência de desenvolvimento limpa e profissional.

## Glossary

- **Console**: Ferramenta de desenvolvedor do navegador que exibe logs, erros e avisos
- **Manifest.json**: Arquivo de configuração PWA que define metadados da aplicação
- **PWA (Progressive Web App)**: Aplicação web que pode ser instalada e funcionar offline
- **vite-plugin-pwa**: Plugin do Vite que gera automaticamente arquivos PWA
- **404 Error**: Erro HTTP indicando que um recurso não foi encontrado
- **Console.log**: Função JavaScript para exibir mensagens de debug no console

## Requirements

### Requirement 1

**User Story:** Como desenvolvedor, eu quero que o console do navegador não exiba erros 404 de manifest.json, para que eu possa identificar problemas reais rapidamente

#### Acceptance Criteria

1. WHEN a aplicação é carregada no navegador, THE Sistema SHALL NOT gerar erros 404 para manifest.json
2. THE Sistema SHALL servir o arquivo manifest.json corretamente na URL `/manifest.json`
3. THE Sistema SHALL gerar o manifest.json através do vite-plugin-pwa configurado no vite.config.ts
4. IF existe um arquivo manifest.json estático em public/, THEN THE Sistema SHALL remover este arquivo para evitar conflitos
5. THE Sistema SHALL incluir todos os metadados necessários no manifest gerado (name, short_name, icons, theme_color, background_color)

### Requirement 2

**User Story:** Como desenvolvedor, eu quero que o console não exiba logs desnecessários de debug, para que eu possa focar em mensagens importantes

#### Acceptance Criteria

1. THE Sistema SHALL NOT exibir logs de "isAdmin status" no console em produção
2. THE Sistema SHALL NOT exibir logs de "Fetched profile" no console em produção
3. WHILE em ambiente de desenvolvimento, THE Sistema MAY exibir logs apenas se uma flag de debug estiver habilitada
4. THE Sistema SHALL remover ou comentar todos os console.log relacionados a autenticação e perfil de usuário
5. THE Sistema SHALL manter apenas logs de erro (console.error) para problemas críticos

### Requirement 3

**User Story:** Como desenvolvedor, eu quero que a configuração PWA esteja correta, para que a aplicação funcione como Progressive Web App sem erros

#### Acceptance Criteria

1. THE Sistema SHALL configurar o vite-plugin-pwa com registerType 'autoUpdate'
2. THE Sistema SHALL incluir workbox configuration para cachear assets corretamente
3. THE Sistema SHALL definir ícones PWA em múltiplos tamanhos (192x192, 512x512)
4. THE Sistema SHALL configurar o manifest com start_url, display e scope corretos
5. THE Sistema SHALL garantir que não há conflito entre manifest estático e gerado
