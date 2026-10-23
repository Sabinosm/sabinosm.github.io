// atendimentoHelpers.js
//
// Utilitários puros da tela de Atendimento (Bloco 2): estado compartilhado,
// eventos, labels, mapas de sinais vitais e o parser do binário. Sem estado
// de página além do objeto `estadoAtendimento` (escrito pelo orquestrador,
// lido pelas abas -- evita import circular).

import { lerUuidUsuarioCache } from "../../../../sharedConfig/userCacheHelpers/userCacheUsuario.js";

// Reexportados do Bloco 1 para as abas (mesma formatação de data/labels).
export { formatarDataHora } from "../../clinico/consulta/consultaHelpers.js";

/** Disparado por QUALQUER escrita com sucesso: orquestrador recarrega o contexto e as abas se re-renderizam. Ninguém dispara dentro do próprio handler -- não há loop. */
export const EVENTO_ATENDIMENTO_ALTERADA = "atendimento:alterada";
/** Disparado pela aba binário quando termina de carregar (para a aba coleta atualizar o gate). */
export const EVENTO_BINARIO_CARREGADO = "atendimento:binario-carregado";

/**
 * Estado compartilhado da página. O orquestrador escreve; as abas leem.
 * `dadosNovoAtendimento` guarda a resposta de /binario/do-paciente (binario,
 * confirmacao, pendentes, completo) + `dados_paciente` (listas por seção,
 * lidas por dadosPaciente()). É null se a rota falhou.
 */
export const estadoAtendimento = {
  consulta: null,
  atendimento: null,
  somenteLeitura: true,
  binarioCompleto: false,
  dadosNovoAtendimento: null,
};

/** uuid da consulta (?consulta=... -- gerado por urlAtendimento do Bloco 1). */
export const uuidConsultaDaUrl = () =>
  new URLSearchParams(window.location.search).get("consulta");

// ------------------------------------------------------------------ labels

export const TIPOS_ATENDIMENTO_LABELS = {
  triagem: "Triagem",
  "avaliacao-medica": "Avaliação médica",
  reavaliacao: "Reavaliação",
  alta: "Alta",
  procedimento: "Procedimento",
};

export const SECOES_BINARIO = [
  { id: "alergias", label: "Alergias", comItens: true },
  { id: "medicamentos", label: "Medicamentos em uso", comItens: true },
  { id: "tipo_sanguineo", label: "Tipo sanguíneo", tipoSanguineo: true },
  { id: "doenca_cronica", label: "Doenças crônicas", comItens: true },
];

export const MOTIVO_REVISAO_LABELS = {
  "dado-novo": "Há dado novo registrado desde a última conferência.",
  "registro-removido": "Um registro foi removido desde a última conferência.",
};

export const ESTADO_SECAO_LABELS = {
  pendente: "Pendente",
  manual: "Conferido",
  automatico: "Derivado — confirme",
  revisao: "Requer revisão",
};

/** Cópia manual de UNIDADE_POR_TIPO (schema.py do back). Se mudar lá, muda aqui. */
export const UNIDADE_POR_TIPO = {
  "frequencia-respiratoria": "irpm",
  spo2: "%",
  "pa-sistolica": "mmHg",
  "pa-diastolica": "mmHg",
  "frequencia-cardiaca": "bpm",
  temperatura: "°C",
  "glicemia-capilar": "mg-dL",
};

export const TIPO_PARAMETRO_LABELS = {
  "frequencia-respiratoria": "Frequência respiratória",
  spo2: "SpO₂",
  "pa-sistolica": "PA sistólica",
  "pa-diastolica": "PA diastólica",
  "frequencia-cardiaca": "Frequência cardíaca",
  temperatura: "Temperatura",
  "glicemia-capilar": "Glicemia capilar",
};

/** Cópia manual de SitioMedicao por tipo (schema.py). Tipos sem sítio: lista vazia. */
export const SITIOS_POR_TIPO = {
  temperatura: ["axilar", "oral", "retal", "timpanico"],
  spo2: ["oximetria-digital"],
  "pa-sistolica": ["manguito-braco-direito", "manguito-braco-esquerdo"],
  "pa-diastolica": ["manguito-braco-direito", "manguito-braco-esquerdo"],
  "frequencia-respiratoria": [],
  "frequencia-cardiaca": [],
  "glicemia-capilar": [],
};

export const SITIO_LABELS = {
  axilar: "Axilar",
  oral: "Oral",
  retal: "Retal",
  timpanico: "Timpânico",
  "oximetria-digital": "Oximetria digital",
  "manguito-braco-direito": "Manguito (braço direito)",
  "manguito-braco-esquerdo": "Manguito (braço esquerdo)",
};

// ----------------------------------------------------------------- binário

/**
 * Normaliza a resposta de GET /binario (estado por seção) num formato único. Tolerante ao shape: aceita {binario: {...}}, {secoes: [...]}
 * ou o dict direto {alergias: {...}}.
 *
 * Devolve { secoes: {alergias: sec|null, ...}, completo } onde sec =
 * { estado, conferida, possui, origem, reconciliado, revisao } e null = pendente.
 */
export function normalizarSecoesBinario(data) {
  const cru = data?.binario ?? data ?? {};
  let porNome = {};

  if (Array.isArray(cru.secoes)) {
    cru.secoes.forEach((s) => { if (s && (s.secao || s.nome)) porNome[s.secao ?? s.nome] = s; });
  } else if (cru.secoes && typeof cru.secoes === "object") {
    porNome = cru.secoes;
  } else {
    porNome = cru;
  }

  const secoes = {};
  for (const { id } of SECOES_BINARIO) {
    const item = porNome[id];
    if (!item || !item.estado) { secoes[id] = null; continue; }

    const estado = item.estado;
    secoes[id] = {
      estado,
      conferida: estado !== "requer-revisao",
      possui: estado === "preenchido" ? true : estado === "nega" ? false : null,
      origem: item.origem ?? "manual",
      reconciliado: Boolean(item.reconciliado),
      revisao:
        estado === "requer-revisao"
          ? { motivo: item.motivo ?? null, estadoAnterior: item.anterior ?? null }
          : null,
    };
  }

  return {
    secoes,
    completo: SECOES_BINARIO.every(({ id }) => secoes[id]?.conferida),
  };
}

/** Classe visual da seção: pendente | manual | automatico | revisao. */
export function classeSecao(sec) {
  if (!sec) return "pendente";
  if (sec.estado === "requer-revisao") return "revisao";
  return sec.origem === "manual" ? "manual" : "automatico";
}

/** Registros ativos do paciente vindos de /binario/do-paciente ({} se ainda não carregou). */
export function dadosPaciente() {
  return estadoAtendimento.dadosNovoAtendimento?.dados_paciente ?? {};
}

/** true quando a escrita clínica está liberada neste atendimento (dono + em andamento). */
export function podeEscrever() {
  const a = estadoAtendimento.atendimento;
  return Boolean(a) && a.status === "em-andamento" && !estadoAtendimento.somenteLeitura;
}

/** Dono do atendimento sou eu? Compara o realizado_por (uuid) com o usuário do cache. */
export function souDono() {
  const rp = estadoAtendimento.atendimento?.realizado_por;
  const meu = lerUuidUsuarioCache();
  return Boolean(rp && meu && String(rp) === String(meu));
}

// -------------------------------------------------------------- dom helpers

export function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/** Texto curto de um item de dado clínico para pré-visualização. */
export function textoItem(item) {
  if (item == null) return "";
  if (typeof item === "string") return item;
  if (item.codigo_cid10) {
    return `${item.codigo_cid10} — ${item.descricao_cid10 ?? ""}${item.status === "em-remissao" ? " (em remissão)" : ""}`;
  }
  if (item.substancia) {
    // gravidade_maxima, não gravidade: uma reação grave antiga não pode sumir
    return [item.substancia, item.tipo_reacao, item.gravidade_maxima ?? item.gravidade].filter(Boolean).join(" · ");
  }
  if (item.descricao && (item.dose || item.frequencia)) {
    return [item.descricao, item.dose, item.frequencia].filter(Boolean).join(" · ");
  }
  return (
    item.descricao ?? item.nome ??
    item.principio_ativo ?? item.tipo_sanguineo ??
    (item.tipo ? `${item.tipo}: ${item.descricao ?? ""}` : null) ??
    JSON.stringify(item)
  );
}

export function uuidValido(v) {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}