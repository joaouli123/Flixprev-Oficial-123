// O multer entrega file.originalname lendo os bytes UTF-8 do navegador como latin1,
// entao "Ações.pdf" chega como "AÃ§Ãµes.pdf". O nome vira o titulo do documento na
// base do agente (fonte citada e bonus de relevancia por titulo).
// So converte quando os bytes formam UTF-8 valido; nome ja correto fica como esta.
export function decodeUploadFileName(value = '') {
  const name = String(value || '');
  if (!/[\u0080-ÿ]/.test(name) || /[^\u0000-ÿ]/.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}
