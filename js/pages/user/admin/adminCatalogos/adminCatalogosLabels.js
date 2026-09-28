// adminCatalogosLabels.js
//
// Rótulos de apresentação para os valores de enum que vêm do banco
// (escopos, tipos de protocolo/resultado, política de destaque).
// Qualquer valor não mapeado cai num fallback que exibe o valor cru
// -- a página nunca quebra quando o catálogo ganha um valor novo.
//
// Se o back passar a enviar labels prontos no DTO, este arquivo
// pode ser apagado e as funções trocadas por um lookup direto.

export function rotuloEscopoPopulacao(valor) {
  return ({
    adulto: 'Adulto',
    pediatrico: 'Pediátrico',
    obstetrico: 'Obstétrico',
    neonatal: 'Neonatal',
    universal: 'Universal',
  })[valor] ?? valor ?? '—';
}

export function rotuloEscopoUso(valor) {
  return ({
    triagem: 'Triagem',
    consulta: 'Consulta',
    ambos: 'Triagem e consulta',
  })[valor] ?? valor ?? '—';
}

export function rotuloTipoProtocolo(valor) {
  return ({
    'escore-ponderado': 'Escore ponderado',
    'arvore-decisao': 'Árvore de decisão',
    'regra-categorica': 'Regra categórica',
    'composicao-modulos': 'Composição de módulos',
  })[valor] ?? valor ?? '—';
}

export function rotuloTipoResultado(valor) {
  return ({
    'score-numerico': 'Escore numérico',
    'categoria-cor': 'Categoria por cor',
    'nivel-risco': 'Nível de risco',
    'binario': 'Binário',
  })[valor] ?? valor ?? '—';
}

// Política de destaque vem da liberação institucional (EmpresaProtocolo)
// -- ainda não sabemos os valores exatos (ver TODO no plano), então
// o fallback exibe o valor cru. `null`/`undefined` = sem política
// definida (não renderiza badge -- ver módulos que chamam).
export function rotuloPolitica(valor) {
  if (!valor) return null;
  return ({
    obrigatorio: 'Destaque obrigatório',
    opcional: 'Destaque opcional',
  })[valor] ?? valor;
}