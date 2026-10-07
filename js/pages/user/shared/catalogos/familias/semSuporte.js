// familias/semSuporte.js
//
// Fallback: protocolo de uma família que ainda não tem rota de campos
// (árvore de decisão, regra categórica, demais escores). A página abre
// normalmente -- cabeçalho, explicação e referência -- e mostra um aviso no
// lugar dos campos. Uma família nova vira um arquivo irmão deste, registrado
// em familias/index.js ANTES deste.

export default {
  nome: 'sem-suporte',

  aplicaA() {
    return true;
  },

  async carregar() {
    return {
      campos: null,
      aviso: 'Os campos de entrada deste tipo de protocolo ainda não estão disponíveis nesta página.',
    };
  },
};