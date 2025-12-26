# Implementation Plan

- [x] 1. Criar sistema de logging condicional


  - Criar arquivo `src/utils/logger.ts` com funções log, warn e error
  - Implementar lógica para mostrar logs apenas em desenvolvimento
  - Garantir que erros sempre sejam mostrados
  - _Requirements: 2.3, 2.4_



- [ ] 2. Remover logs desnecessários do SessionContextProvider
  - Substituir console.warn por logger.warn em `src/components/SessionContextProvider.tsx`
  - Remover ou substituir logs de "Perfil não encontrado"
  - Remover ou substituir logs de "Status de assinatura não encontrado"


  - Remover ou substituir log de "Tentativa de acesso ao /app durante processo de redefinição"
  - _Requirements: 2.1, 2.2, 2.4_

- [x] 3. Remover logs desnecessários de outras páginas


  - Remover console.log do Facebook Pixel em `src/components/AppSettingsProvider.tsx`
  - Remover todos os 4 console.log de `src/pages/EsqueciSenha.tsx`
  - Remover console.log de agentes em `src/pages/LandingPage.tsx`
  - _Requirements: 2.1, 2.2_



- [ ] 4. Corrigir configuração PWA no vite.config.ts
  - Adicionar `devOptions: { enabled: false }` para desabilitar PWA em desenvolvimento
  - Verificar configuração do manifest (name, icons, theme_color)
  - Garantir que workbox está configurado corretamente


  - _Requirements: 1.3, 3.1, 3.5_

- [ ] 5. Adicionar meta tags PWA no index.html
  - Adicionar `<link rel="manifest" href="/manifest.webmanifest">`


  - Adicionar `<meta name="theme-color" content="#3b82f6">`
  - Adicionar `<link rel="apple-touch-icon" href="/pwa-icons/icon-192x192.png">`
  - Verificar que não há conflito com manifest estático
  - _Requirements: 1.1, 1.2, 3.3, 3.4_




- [ ] 6. Verificar ícones PWA
  - Confirmar que `/pwa-icons/icon-192x192.png` existe
  - Confirmar que `/pwa-icons/icon-512x512.png` existe
  - Verificar que os caminhos no manifest estão corretos
  - _Requirements: 3.3_

- [ ]* 7. Testar em desenvolvimento
  - Executar `npm run dev` e verificar console limpo
  - Verificar que não há erros 404 de manifest
  - Verificar que não há logs desnecessários
  - Testar login e navegação
  - _Requirements: 1.1, 2.1, 2.2_

- [ ]* 8. Testar build de produção
  - Executar `npm run build`
  - Executar `npm run preview`
  - Verificar que manifest.webmanifest é servido corretamente
  - Verificar console limpo em produção
  - Testar instalação PWA
  - _Requirements: 1.1, 1.2, 3.1, 3.2_
