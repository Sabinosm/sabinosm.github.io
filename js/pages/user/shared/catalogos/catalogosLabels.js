// catalogosLabels.js
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
    'protocolo-composto': 'Composição de módulos',
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

// Política de destaque vem da liberação institucional (EmpresaProtocolo).
// Só "obrigatorio" merece badge no card: "opcional" é o estado comum de todo
// protocolo liberado e só poluiria a listagem (`null` = não renderiza badge).
export function rotuloPolitica(valor) {
  if (!valor || valor === 'opcional') return null;
  return ({
    obrigatorio: 'Destaque obrigatório',
  })[valor] ?? valor;
}

// Opções do seletor de política (admin) -- aqui "opcional" aparece, é uma escolha.
export const POLITICAS = ['opcional', 'obrigatorio'];

export function rotuloOpcaoPolitica(valor) {
  return ({
    opcional: 'Opcional',
    obrigatorio: 'Obrigatório',
  })[valor] ?? valor;
}

// Badges de padrão -- `escopo` é 'triagem' | 'consulta' | 'ambos' | null.
export function rotuloPadraoInstitucional(escopo) {
  return escopo ? `Padrão da instituição · ${rotuloEscopoUso(escopo)}` : null;
}

export function rotuloPadraoPessoal(escopo) {
  return escopo ? `Meu padrão · ${rotuloEscopoUso(escopo)}` : null;
}

// --- Protocolo composto (módulos) e campos -----------------------------
export function rotuloPapelModulo(valor) {
  return ({ principal: 'Principal', gatilho: 'Gatilho', informativo: 'Informativo' })[valor] ?? valor ?? '—';
}

export function rotuloAgregacao(valor) {
  return ({
    nenhuma: 'Sem agregação',
    soma: 'Soma',
    maximo: 'Máximo',
    pior_categoria: 'Pior categoria',
    any_flag: 'Qualquer sinalizador',
  })[valor] ?? valor ?? '—';
}

export function rotuloFamiliaCalculo(valor) {
  return ({ pontuador: 'Pontuador', classificador: 'Classificador', regra: 'Regra' })[valor] ?? valor ?? '—';
}

export function rotuloTipoSaida(valor) {
  return ({ pontos: 'Pontos', categoria: 'Categoria', flag: 'Sinalizador' })[valor] ?? valor ?? '—';
}

export function rotuloTipoModulo(valor) {
  return ({
    epidemiologico: 'Epidemiológico',
    comorbidade: 'Comorbidade',
    'faixa-etaria': 'Faixa etária',
    institucional: 'Institucional',
  })[valor] ?? valor ?? '—';
}

export function rotuloTipoCampo(valor) {
  return ({ numerico: 'Numérico', categorico: 'Categórico', booleano: 'Sim/não' })[valor] ?? valor ?? '—';
}