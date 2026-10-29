// atendimentoProtocoloCampos.js
//
// Normaliza o que GET .../protocolos/<uuid>/estrutura devolve em `campos`
// para UM formato, o mesmo vocabulário de tipos do catalogosCampos.js
// (numerico | categorico | booleano), mais "texto" como fallback.
//
// Origens (CampoEsperado serializado por ExecucaoAtendimentoService._campo_dict):
//   escore    { campo, texto, tipo_campo: "numero"|"enum", opcoes: [{valor, rotulo}]|null }
//   composto  { campo, texto, tipo_campo: "numerico"|"categorico"|"booleano", opcoes }
//   `label` é alias de `texto`. unidade/faixa/obrigatorio só aparecem se o back os enviar.
//
// Puro: sem DOM, sem fetch.

const ALIAS_TIPO = {
  numerico: "numerico", numero: "numerico", number: "numerico", numeric: "numerico",
  categorico: "categorico", categorica: "categorico", enum: "categorico", select: "categorico",
  booleano: "booleano", boolean: "booleano", bool: "booleano",
};

export function normalizarTipo(valor) {
  if (!valor) return "texto";
  return ALIAS_TIPO[String(valor).toLowerCase()] ?? "texto";
}

/** Lista de textos, lista de objetos ou mapa {valor: rotulo} -> [{ valor, rotulo }]. */
export function normalizarOpcoes(opcoes) {
  if (opcoes === null || opcoes === undefined) return [];

  if (Array.isArray(opcoes)) {
    return opcoes.map((o) => {
      if (o !== null && typeof o === "object") {
        const valor = String(o.valor ?? o.value ?? o.codigo ?? o.rotulo ?? o.texto ?? o.label);
        const rotulo = String(o.rotulo ?? o.texto ?? o.label ?? o.nome ?? valor);
        return { valor, rotulo };
      }
      return { valor: String(o), rotulo: String(o) };
    });
  }
  if (typeof opcoes === "object") {
    return Object.entries(opcoes).map(([valor, rotulo]) => ({
      valor,
      rotulo: typeof rotulo === "string" ? rotulo : valor,
    }));
  }
  return [{ valor: String(opcoes), rotulo: String(opcoes) }];
}

/** Campo do back -> { campo, rotulo, tipo, unidade, opcoes, min, max, obrigatorio }. */
export function normalizarCampo(c) {
  const campo = c.campo ?? c.codigo;
  return {
    campo,
    rotulo: c.texto ?? c.label ?? c.nome ?? campo,
    tipo: normalizarTipo(c.tipo_campo ?? c.tipo_dado),
    unidade: c.unidade ?? null,
    opcoes: normalizarOpcoes(c.opcoes),
    min: c.valor_min ?? c.min ?? null,
    max: c.valor_max ?? c.max ?? null,
    obrigatorio: c.obrigatorio === true,
  };
}
