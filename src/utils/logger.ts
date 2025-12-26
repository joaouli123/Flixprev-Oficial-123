/**
 * Sistema de logging condicional
 * Logs são exibidos apenas em desenvolvimento
 * Erros são sempre exibidos
 */

const isDevelopment = import.meta.env.DEV;

export const logger = {
  /**
   * Log informativo - apenas em desenvolvimento
   */
  log: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  /**
   * Warning - apenas em desenvolvimento
   */
  warn: (...args: any[]) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },

  /**
   * Erro - sempre exibido
   */
  error: (...args: any[]) => {
    console.error(...args);
  },
};
