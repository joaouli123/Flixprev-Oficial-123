# Design Document

## Overview

Este documento descreve a solução para eliminar erros e avisos no console do navegador da aplicação FlixPrev I.A. A solução aborda três problemas principais:

1. **Erros 404 do manifest.json**: O navegador está tentando buscar o manifest.json em uma URL que não existe
2. **Logs desnecessários**: Console poluído com logs de debug de autenticação e perfil
3. **Configuração PWA**: Garantir que a configuração do vite-plugin-pwa está correta

## Architecture

### Problema 1: Erros 404 do manifest.json

**Análise do Problema:**
- O vite-plugin-pwa está configurado para gerar o manifest.json automaticamente
- O navegador está tentando buscar `/manifest.json` mas recebe 404
- Não existe arquivo manifest.json estático em `public/`
- O manifest gerado pelo plugin pode não estar sendo servido corretamente

**Causa Raiz:**
- O manifest.json gerado pelo vite-plugin-pwa pode não estar sendo incluído no build
- Pode haver problema com a configuração do plugin ou com o caminho de saída

**Solução:**
1. Verificar se o manifest está sendo gerado corretamente no build
2. Adicionar link explícito para o manifest no index.html
3. Garantir que o plugin está configurado para injetar o manifest automaticamente

### Problema 2: Logs Desnecessários

**Análise do Problema:**
Logs encontrados no código:
- `src/components/SessionContextProvider.tsx`: 3 console.warn
- `src/components/AppSettingsProvider.tsx`: 1 console.log (Facebook Pixel)
- `src/pages/EsqueciSenha.tsx`: 4 console.log
- `src/pages/LandingPage.tsx`: 1 console.log
- `src/hooks/useFacebookTracking.tsx`: 1 console.log comentado

**Solução:**
1. Remover todos os console.log de debug
2. Manter apenas console.error para erros críticos
3. Converter console.warn em console.error onde apropriado
4. Criar uma função de logging condicional para desenvolvimento

### Problema 3: Configuração PWA

**Análise Atual:**
- vite-plugin-pwa está configurado com `registerType: 'autoUpdate'`
- Manifest tem configuração básica (name, icons, theme_color)
- Workbox configurado para não cachear APIs do Supabase
- Ícones PWA estão em `/pwa-icons/`

**Melhorias Necessárias:**
1. Adicionar `injectManifest: true` para garantir injeção automática
2. Verificar se os ícones PWA existem nos caminhos especificados
3. Adicionar meta tags PWA no index.html

## Components and Interfaces

### 1. Configuração do Vite (vite.config.ts)

```typescript
VitePWA({
  registerType: 'autoUpdate',
  injectRegister: 'auto',
  injectManifest: true, // ADICIONAR: Garante injeção do manifest
  devOptions: {
    enabled: false, // Desabilitar PWA em dev para evitar cache
  },
  workbox: {
    // ... configuração existente
  },
  manifest: {
    // ... configuração existente
  },
})
```

### 2. Index.html

Adicionar meta tags PWA:
```html
<!-- PWA Meta Tags -->
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#3b82f6">
<link rel="apple-touch-icon" href="/pwa-icons/icon-192x192.png">
```

### 3. Função de Logging Condicional

Criar `src/utils/logger.ts`:
```typescript
const isDevelopment = import.meta.env.DEV;

export const logger = {
  log: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  warn: (...args: any[]) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },
  error: (...args: any[]) => {
    console.error(...args); // Sempre mostrar erros
  },
};
```

## Data Models

Não há mudanças em modelos de dados.

## Error Handling

### Estratégia de Logging

1. **Desenvolvimento**: Logs completos via função `logger`
2. **Produção**: Apenas erros críticos via `console.error`
3. **Warnings**: Apenas em desenvolvimento

### Tratamento de Erros PWA

1. Se manifest.json não carregar, não bloquear a aplicação
2. Service Worker deve falhar silenciosamente se não puder registrar
3. Logs de erro do PWA devem ser informativos mas não alarmantes

## Testing Strategy

### Testes Manuais

1. **Verificar Console Limpo:**
   - Abrir aplicação em modo incógnito
   - Verificar que não há erros 404
   - Verificar que não há logs desnecessários
   - Apenas erros legítimos devem aparecer

2. **Verificar PWA:**
   - Fazer build de produção: `npm run build`
   - Servir build: `npm run preview`
   - Verificar que manifest.json é servido em `/manifest.webmanifest`
   - Verificar que ícones PWA carregam corretamente
   - Verificar que aplicação pode ser instalada

3. **Verificar Funcionalidade:**
   - Login deve funcionar normalmente
   - Autenticação deve funcionar sem logs
   - Redefinição de senha deve funcionar
   - Navegação deve funcionar

### Checklist de Validação

- [ ] Console sem erros 404 de manifest
- [ ] Console sem logs de "isAdmin status"
- [ ] Console sem logs de "Fetched profile"
- [ ] Console sem logs de debug em produção
- [ ] Manifest.json acessível em `/manifest.webmanifest`
- [ ] Ícones PWA carregam corretamente
- [ ] Aplicação pode ser instalada como PWA
- [ ] Funcionalidade de autenticação intacta
- [ ] Navegação funciona normalmente

## Implementation Notes

### Arquivos a Modificar

1. `vite.config.ts` - Adicionar injectManifest e devOptions
2. `index.html` - Adicionar meta tags PWA
3. `src/utils/logger.ts` - Criar (novo arquivo)
4. `src/components/SessionContextProvider.tsx` - Remover/substituir logs
5. `src/components/AppSettingsProvider.tsx` - Remover log do Facebook Pixel
6. `src/pages/EsqueciSenha.tsx` - Remover logs de debug
7. `src/pages/LandingPage.tsx` - Remover log de agentes

### Ordem de Implementação

1. Criar função de logging condicional
2. Substituir todos os console.log/warn por logger
3. Atualizar configuração do vite-plugin-pwa
4. Adicionar meta tags PWA no index.html
5. Testar em desenvolvimento
6. Fazer build e testar em produção
7. Validar console limpo

### Considerações de Compatibilidade

- Solução compatível com todos os navegadores modernos
- PWA funciona em Chrome, Edge, Safari, Firefox
- Fallback gracioso se PWA não for suportado
- Logs condicionais não afetam performance
