// atendimentoProtocoloInput.js
//
// Snapshot dos campos USADOS no input de protocolo, para a aba mostrar o que
// foi registrado (rótulo + valor legível + ausente). O back guarda só
// InputProtocolo.input_json ({campo: valor}) e não tem GET de input, então o
// front guarda este snapshot junto da coleta (sessionStorage), como já faz com
// o resto do estado da aba.
//
// Puro: sem DOM, sem fetch.

function textoDoValor(campo, valor) {
  if (campo.tipo === "booleano") return valor ? "Sim" : "Não";
  if (campo.tipo === "categorico") {
    return campo.opcoes.find((o) => o.valor === String(valor))?.rotulo ?? String(valor);
  }
  const base = String(valor);
  return campo.unidade ? `${base} ${campo.unidade}` : base;
}

/**
 * @param campos     normalizados (atendimentoProtocoloCampos)
 * @param validacao  retorno de validarRespostas (usa .validados)
 * @returns [{ campo, rotulo, tipo, unidade, valor, valor_exibido, ausente }]
 */
export function montarSnapshotCampos(campos, validacao) {
  return campos.map((c) => {
    const valor = validacao.validados[c.campo];
    const ausente = valor === undefined;
    return {
      campo: c.campo,
      rotulo: c.rotulo,
      tipo: c.tipo,
      unidade: c.unidade,
      valor: ausente ? null : valor,
      valor_exibido: ausente ? null : textoDoValor(c, valor),
      ausente,
    };
  });
}
